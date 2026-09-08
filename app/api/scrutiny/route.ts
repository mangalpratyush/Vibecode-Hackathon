import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle, getResult, saveResult } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import { runAiChecks } from "@/lib/scrutiny/ai-checks";
import { activeRules } from "@/lib/rulebook";
import { scoreFiling } from "@/lib/scrutiny/score";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Run the checkslip against a stored bundle.
 *
 * Two passes, deliberately kept apart. The deterministic engine is synchronous
 * and always runs; the AI-assisted checks are awaited separately and merged in.
 * That ordering means a slow or dead AI provider can never delay or degrade the
 * measured findings — the worst case is that the AI rules stay in "not checked",
 * which is exactly where they sit with no key at all.
 *
 * Pass `?ai=0` to skip the AI pass entirely.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { bundleId } = await req.json().catch(() => ({ bundleId: "" }));
  const bundle = await getBundle(String(bundleId ?? ""));
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  const result = runScrutiny(bundle);

  const wantAi = new URL(req.url).searchParams.get("ai") !== "0";
  if (wantAi) {
    try {
      const ai = await runAiChecks(bundle, activeRules(bundle.court, bundle.caseTypeId));

      // The AI rules were parked in `skipped` by the deterministic pass. Now
      // that they have actually run, replace those placeholders with the real
      // outcome rather than leaving both on the memo.
      const settled = new Set([
        ...ai.defects.map((d) => d.ruleId),
        ...ai.passed.map((p) => p.ruleId),
        ...ai.unchecked.map((u) => u.ruleId),
      ]);
      result.skipped = result.skipped.filter((s) => !settled.has(s.ruleId));

      result.defects.push(...ai.defects);
      result.passed.push(...ai.passed);
      result.skipped.push(...ai.unchecked);

      const order = { FATAL: 0, REGISTRY_OBJECTION: 1, ADVISORY: 2 } as const;
      result.defects.sort(
        (a, b) => order[a.severity] - order[b.severity] || a.ruleId.localeCompare(b.ruleId)
      );
      result.stats.fatal = result.defects.filter((d) => d.severity === "FATAL").length;
      result.stats.objections = result.defects.filter(
        (d) => d.severity === "REGISTRY_OBJECTION"
      ).length;
      result.stats.advisories = result.defects.filter(
        (d) => d.severity === "ADVISORY"
      ).length;
    } catch (e) {
      // An AI failure must never lose the deterministic memo we already have.
      console.error("[scrutiny] AI pass failed:", e instanceof Error ? e.message : e);
    }
  }

  result.score = scoreFiling(result);
  await saveResult(result);
  return NextResponse.json({ ok: true, result });
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("bundleId") ?? "";
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  return NextResponse.json({ result: await getResult(id) });
}
