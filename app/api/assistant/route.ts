import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { answerFilingQuestion } from "@/lib/ai/tasks";
import { aiAvailable } from "@/lib/ai/provider";
import { RULES, caseTypeById } from "@/lib/rulebook";
import { getBundle, getResult } from "@/lib/store";
import type { AssistantContext } from "@/lib/ai/tasks";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The PARAM Assistant.
 *
 * Retrieval is lexical and local — the rulebook is ~30 rows, so a term-overlap
 * score beats a vector database here and adds no dependency, no key and no
 * latency. The retrieved rules are handed to the model as the authoritative
 * text so it answers from the rulebook rather than from memory.
 */
const asContext = (r: (typeof RULES)[number]) => ({
  text: `${r.text} ${r.why ?? ""}`.trim(),
  source: r.source,
});

function retrieveRules(question: string, limit = 8) {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);

  const scored = terms.length
    ? RULES.map((r) => {
        const hay = `${r.text} ${r.why ?? ""} ${r.source}`.toLowerCase();
        let score = 0;
        for (const t of terms) if (hay.includes(t)) score++;
        return { r, score };
      })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ r }) => asContext(r))
    : [];

  if (scored.length) return scored;

  /**
   * No lexical purchase on the question.
   *
   * This is the normal case for a question typed in Devanagari, Tamil, Bengali
   * or any non-Latin script: splitting on [a-z0-9] leaves nothing to match, so
   * the retriever finds no rules and the model, handed an empty context, tends
   * to conclude the question is out of scope and decline it. Grounding must not
   * depend on the script the user happens to type in.
   *
   * The rulebook is 31 short rows, so the honest fix is to hand over all of the
   * verified ones rather than nothing. It costs a small prompt and removes an
   * entire class of wrong answer.
   */
  return RULES.filter((r) => r.status === "verified").map(asContext);
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const question = String(body.question ?? "").trim();
  const bundleId = String(body.bundleId ?? "");
  if (!question)
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  const ctx: AssistantContext = { rules: retrieveRules(question) };

  // Ground anything bundle-specific in what the deterministic engine produced.
  if (bundleId) {
    const bundle = await getBundle(bundleId);
    if (bundle && bundle.ownerEmail === user.email) {
      const ct = caseTypeById(bundle.caseTypeId);
      ctx.bundleSummary = `"${bundle.title}" — ${ct?.name ?? bundle.caseTypeId} in the ${bundle.court.replace(/_/g, " ").toLowerCase()}, ${bundle.documents.length} documents, ${bundle.documents.reduce((s, d) => s + d.pageCount, 0)} pages.`;
      const result = await getResult(bundleId);
      if (result) {
        ctx.defects = result.defects.map(
          (d) => `[${d.severity}] ${d.title} — ${d.detail}`
        );
        const l = result.limitation;
        ctx.limitation = l.computed
          ? l.barred
            ? `Out of time by ${l.daysOverdue} day(s); limitation expired ${l.dueOn}.`
            : `Within time; ${l.daysRemaining} day(s) remain, expiring ${l.dueOn}.`
          : `Not computed — ${l.reason}`;
      }
    }
  }

  const answer = await answerFilingQuestion(question, ctx);
  return NextResponse.json({
    answer,
    aiAvailable: aiAvailable(),
    citedRules: ctx.rules?.map((r) => r.source) ?? [],
  });
}

export async function GET() {
  return NextResponse.json({ aiAvailable: aiAvailable() });
}
