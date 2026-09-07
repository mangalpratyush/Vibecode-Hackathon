import type { Bundle, Defect, Rule } from "../types";
import { aiAvailable, callAI } from "../ai/provider";

/**
 * The AI-assisted checks (A2–A4 of the plan).
 *
 * These are the Registry objections that need reading comprehension rather than
 * measurement: does the cause title match the impugned order, does the synopsis
 * agree with the prayer, is the provision invoked the right one. A regex cannot
 * do them and pretending otherwise would be worse than leaving them out.
 *
 * The guard rails matter more here than anywhere else in PARAM:
 *
 *  - The model returns a STRUCTURED VERDICT, never prose that we then display.
 *    It answers {"ok": bool, "detail": string} and nothing else.
 *  - The severity, the Registry wording, the citation and the rule id all come
 *    from the rulebook row, exactly as in the deterministic checks. The model
 *    contributes one boolean and one sentence of explanation.
 *  - Anything unparseable is treated as "could not check", never as "clean" and
 *    never as a defect. A silent false pass is the failure mode that would hurt
 *    an advocate most.
 *  - Every finding is marked so the UI can show it was AI-assisted. A defect a
 *    machine inferred should not look identical to one it measured.
 */

export interface AiCheckOutcome {
  defects: Defect[];
  /** Rules we tried and could not complete, with why. */
  unchecked: { ruleId: string; text: string; reason: string }[];
  /** Rules the model actively cleared. */
  passed: { ruleId: string; text: string }[];
}

interface Verdict {
  ok: boolean;
  detail: string;
}

const EMPTY: AiCheckOutcome = { defects: [], unchecked: [], passed: [] };

function parseVerdict(raw: string | null): Verdict | null {
  if (!raw) return null;
  try {
    const cleaned = raw
      .replace(/^```(?:json)?/im, "")
      .replace(/```\s*$/m, "")
      .trim();
    // Tolerate a model that wraps the object in a sentence.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const v = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Verdict>;
    if (typeof v.ok !== "boolean") return null;
    return { ok: v.ok, detail: String(v.detail ?? "").slice(0, 600) };
  } catch {
    return null;
  }
}

/** Trim a document to the part that carries the answer, to keep prompts small. */
const head = (text: string, chars = 3500) => text.slice(0, chars);

async function verdictFor(
  instruction: string,
  material: string
): Promise<Verdict | null> {
  const raw = await callAI(
    [
      instruction,
      ``,
      `Answer with a single JSON object and nothing else:`,
      `{"ok": true}  — if there is no problem`,
      `{"ok": false, "detail": "<one sentence naming the specific discrepancy>"}  — if there is`,
      ``,
      `Be conservative. If the material is incomplete, unclear, or you are not`,
      `confident, answer {"ok": true}. A false alarm sent to an advocate the day`,
      `before filing costs more than a missed nicety.`,
      ``,
      `MATERIAL:`,
      material,
    ].join("\n"),
    { json: true, maxTokens: 400 }
  );
  return parseVerdict(raw);
}

function toDefect(rule: Rule, title: string, detail: string): Defect {
  return {
    ruleId: rule.id,
    severity: rule.severity,
    title,
    detail,
    registryWording: rule.text,
    source: rule.source,
    sourceUrl: rule.sourceUrl,
    // The flag is deliberate: an inferred finding must not be presented with
    // the same authority as a measured one. The memo renders it differently.
    aiAssisted: true,
    fix: rule.fix,
  };
}

export async function runAiChecks(
  bundle: Bundle,
  rules: Rule[]
): Promise<AiCheckOutcome> {
  const wanted = rules.filter((r) => r.needsAi);
  if (!wanted.length) return EMPTY;

  if (!aiAvailable()) {
    return {
      defects: [],
      passed: [],
      unchecked: wanted.map((r) => ({
        ruleId: r.id,
        text: r.text,
        reason:
          "Needs an AI provider key. The deterministic scrutiny is unaffected.",
      })),
    };
  }

  const petition = bundle.documents.find((d) => d.kind === "PETITION");
  const synopsis = bundle.documents.find(
    (d) => d.kind === "SYNOPSIS_LIST_OF_DATES"
  );
  const impugned = bundle.documents.find(
    (d) => d.kind === "CERTIFIED_COPY" || d.kind === "IMPUGNED_ORDER"
  );

  const out: AiCheckOutcome = { defects: [], unchecked: [], passed: [] };

  for (const rule of wanted) {
    let verdict: Verdict | null = null;
    let missing: string | null = null;
    let title = "";

    if (rule.check === "cause_title_match") {
      title = "Cause title may not match the impugned order";
      if (!petition || !impugned)
        missing = "Needs both the petition and the impugned order in the bundle.";
      else
        verdict = await verdictFor(
          `You are checking an Indian court filing for one specific Registry objection: whether the CAUSE TITLE of the petition correctly describes the parties as they stood before the court below. Compare the party names and their array (who is petitioner/appellant, who is respondent) in the petition against the impugned order. Ignore differences of spelling, honorifics, transliteration, ordering of initials, and "& Anr."/"& Ors." shorthand. Report a problem only if a party appears to be genuinely different, missing, or on the wrong side.`,
          `PETITION (cause title):\n${head(petition.text, 2200)}\n\nIMPUGNED ORDER:\n${head(impugned.text, 2200)}`
        );
    } else if (rule.check === "synopsis_prayer") {
      title = "Synopsis and prayer may not agree";
      const syn = synopsis ?? petition;
      if (!syn || !petition)
        missing = "Needs the synopsis and the petition's prayer in the bundle.";
      else
        verdict = await verdictFor(
          `You are checking an Indian court filing for one specific Registry objection: whether the SYNOPSIS and the PRAYER are consistent. The synopsis describes what the matter is about; the prayer states the relief actually sought. Report a problem only if the relief claimed in the prayer is materially different from what the synopsis says the case is about — not for differences of emphasis, length or wording.`,
          `SYNOPSIS:\n${head(syn.text, 2200)}\n\nPETITION AND PRAYER:\n${head(petition.text, 2600)}`
        );
    } else if (rule.check === "provision_check") {
      title = "Provision invoked may be the wrong one";
      if (!petition)
        missing = "Needs the petition in the bundle.";
      else
        verdict = await verdictFor(
          `You are checking an Indian court filing for one specific Registry objection: "correct and relevant provision of law be given". Read the provision the petition invokes in its cause title and prayer (for example Article 226 vs Article 227 of the Constitution, s.482 CrPC / s.528 BNSS, s.34 vs s.37 of the Arbitration Act, the Article of the Limitation Act) and judge whether it fits the relief actually sought and the forum. Report a problem only where the mismatch is clear on the face of the document.`,
          `PETITION:\n${head(petition.text, 3500)}`
        );
    } else {
      missing = "No AI check is implemented for this rule.";
    }

    if (missing) {
      out.unchecked.push({ ruleId: rule.id, text: rule.text, reason: missing });
      continue;
    }
    if (!verdict) {
      // Unparseable or the provider did not answer. Never silently pass.
      out.unchecked.push({
        ruleId: rule.id,
        text: rule.text,
        reason:
          "The AI provider did not return a usable verdict, so this was not checked.",
      });
      continue;
    }
    if (verdict.ok) {
      out.passed.push({ ruleId: rule.id, text: rule.text });
      continue;
    }
    out.defects.push(toDefect(rule, title, verdict.detail || rule.text));
  }

  return out;
}
