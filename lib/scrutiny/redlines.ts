import { aiAvailable, callAI } from "../ai/provider";
import type { Bundle, Defect } from "../types";

/**
 * Proposed corrections, for a human to accept or reject.
 *
 * This is the part of PARAM that comes closest to writing a court document, so
 * the constraints are tighter here than anywhere else in the codebase.
 *
 *  1. A redline is a PROPOSAL. Nothing here is ever written into a bundle. The
 *     advocate accepts, edits or rejects it, and only accepted text is used.
 *  2. It corrects what is already on the page. It does not compose new pleading,
 *     new grounds, or a missing annexure. If Annexure P-7 is not in the bundle,
 *     the answer is "file it", not a generated P-7.
 *  3. `before` is quoted verbatim from the document. A redline whose "before"
 *     does not actually appear in the filing is discarded, because a diff
 *     against text that was never there is a hallucination wearing a diff's
 *     clothes, and it is the most convincing kind.
 *  4. Every proposal is scoped and labelled so the UI can show an inferred
 *     correction differently from a measured defect.
 *
 * Indian courts have already come down on advocates for filing AI-generated
 * material that nobody checked. The approval gate is the product, not friction.
 */

export type RedlineStatus = "proposed" | "accepted" | "rejected";

export interface Redline {
  id: string;
  /** The defect this cures. */
  ruleId: string;
  documentId?: string;
  documentName?: string;
  title: string;
  /** Verbatim from the document, so the diff is anchored in the real text. */
  before: string;
  /** What PARAM proposes instead. Editable by the advocate. */
  after: string;
  why: string;
  confidence: "high" | "medium" | "low";
  status: RedlineStatus;
  /** Set when the advocate edits the proposal before accepting it. */
  editedAfter?: string;
}

export interface RedlineSet {
  bundleId: string;
  generatedAt: string;
  redlines: Redline[];
  /** Defects PARAM will not propose text for, and why. */
  declined: { ruleId: string; title: string; reason: string }[];
}

/** Only these defects are ever eligible for a proposed correction. */
const CORRECTABLE = new Set([
  "cause_title_match",
  "provision_check",
  "synopsis_prayer",
]);

/**
 * Defects that look correctable but are not. Naming them explicitly is better
 * than silently producing nothing, because the user would otherwise assume the
 * feature failed rather than that PARAM declined on purpose.
 */
const NEVER_DRAFT: Record<string, string> = {
  annexure_cross_reference:
    "A missing annexure has to be filed, not written. PARAM will not generate a document that does not exist.",
  limitation:
    "Delay is cured by an application explaining what actually happened, which only counsel can state. PARAM drafts the application and leaves the reason blank.",
  missing_document:
    "The document has to be prepared and executed, not drafted from the bundle.",
  vernacular_without_translation:
    "A translation filed on the record has to be certified by a person who can vouch for it.",
  attestation_missing:
    "An affidavit is sworn in person before an Oath Commissioner. Nothing here can substitute for that.",
  signature_missing: "A signature cannot be generated.",
  welfare_stamp: "A physical stamp has to be affixed.",
};

interface Proposal {
  before: string;
  after: string;
  why: string;
  confidence: "high" | "medium" | "low";
}

function parseProposal(raw: string | null): Proposal | null {
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?/im, "").replace(/```\s*$/m, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const v = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Proposal>;
    if (!v.before || !v.after) return null;
    const confidence =
      v.confidence === "high" || v.confidence === "low" ? v.confidence : "medium";
    return {
      before: String(v.before).trim().slice(0, 1200),
      after: String(v.after).trim().slice(0, 1200),
      why: String(v.why ?? "").trim().slice(0, 500),
      confidence,
    };
  } catch {
    return null;
  }
}

/**
 * Is `before` genuinely in the document?
 *
 * Compared on collapsed whitespace, because PDF extraction inserts line breaks
 * the model will not reproduce exactly. This is the check that stops a
 * confident diff against invented text from reaching the screen.
 */
function anchoredInDocument(before: string, haystack: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const needle = norm(before);
  if (needle.length < 12) return false;
  return norm(haystack).includes(needle);
}

const rid = () =>
  `rl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export async function proposeRedlines(
  bundle: Bundle,
  defects: Defect[]
): Promise<RedlineSet> {
  const out: RedlineSet = {
    bundleId: bundle.id,
    generatedAt: new Date().toISOString(),
    redlines: [],
    declined: [],
  };

  const petition = bundle.documents.find((d) => d.kind === "PETITION");
  const impugned = bundle.documents.find(
    (d) => d.kind === "CERTIFIED_COPY" || d.kind === "IMPUGNED_ORDER"
  );

  for (const d of defects) {
    const check = checkOf(d.ruleId);

    if (NEVER_DRAFT[check]) {
      out.declined.push({ ruleId: d.ruleId, title: d.title, reason: NEVER_DRAFT[check] });
      continue;
    }
    if (!CORRECTABLE.has(check)) continue;

    if (!aiAvailable()) {
      out.declined.push({
        ruleId: d.ruleId,
        title: d.title,
        reason: "Needs an AI provider key to propose a correction.",
      });
      continue;
    }
    if (!petition) {
      out.declined.push({
        ruleId: d.ruleId,
        title: d.title,
        reason: "The petition is not in the bundle, so there is nothing to correct against.",
      });
      continue;
    }

    const context =
      check === "cause_title_match" && impugned
        ? `PETITION (first pages):\n${petition.text.slice(0, 2500)}\n\nIMPUGNED ORDER (first pages):\n${impugned.text.slice(0, 2500)}`
        : `PETITION:\n${petition.text.slice(0, 4000)}`;

    const raw = await callAI(
      [
        `You are correcting one specific defect in an Indian court filing. The defect is:`,
        `"${d.title}" — ${d.detail}`,
        ``,
        `Propose the smallest correction that cures it. Reply with a single JSON object and nothing else:`,
        `{"before": "<text copied VERBATIM from the document, the exact passage to replace>",`,
        ` "after": "<the corrected passage>",`,
        ` "why": "<one sentence on what was wrong>",`,
        ` "confidence": "high" | "medium" | "low"}`,
        ``,
        `Rules you must follow:`,
        `- "before" must be copied word for word from the document below. Do not paraphrase it, do not tidy it, do not invent it. If you cannot find the exact passage, reply {"before": "", "after": ""}.`,
        `- Correct only what the defect describes. Do not rewrite the pleading, do not add grounds, do not improve the drafting.`,
        `- Do not invent facts, party names, dates, case numbers or citations that are not already in the material below.`,
        `- Keep the correction as short as it can be while curing the defect.`,
        ``,
        context,
      ].join("\n"),
      { json: true, maxTokens: 700 }
    );

    const proposal = parseProposal(raw);
    if (!proposal) {
      out.declined.push({
        ruleId: d.ruleId,
        title: d.title,
        reason: "PARAM could not produce a correction it was confident enough to show.",
      });
      continue;
    }

    // The anchor check. A proposal that rewrites text the document does not
    // contain is discarded rather than shown with a caveat.
    if (!anchoredInDocument(proposal.before, petition.text)) {
      out.declined.push({
        ruleId: d.ruleId,
        title: d.title,
        reason:
          "The proposed correction did not match any passage actually in the petition, so it was discarded rather than shown.",
      });
      continue;
    }

    out.redlines.push({
      id: rid(),
      ruleId: d.ruleId,
      documentId: petition.id,
      documentName: petition.fileName,
      title: d.title,
      before: proposal.before,
      after: proposal.after,
      why: proposal.why,
      confidence: proposal.confidence,
      status: "proposed",
    });
  }

  return out;
}

/**
 * Rule ids encode their check, e.g. SC-CAUSE-TITLE -> cause_title_match. Rather
 * than re-import the rulebook here, map the handful that are correctable.
 */
function checkOf(ruleId: string): string {
  const map: Record<string, string> = {
    "SC-CAUSE-TITLE": "cause_title_match",
    "SC-SYNOPSIS-PRAYER": "synopsis_prayer",
    "DHC-OBJ-PROVISION": "provision_check",
    "SC-VIII-ANNEXURE-CROSSREF": "annexure_cross_reference",
    "SC-LIMITATION-SLP": "limitation",
    "DHC-OBJ-BARRED-BY-TIME": "limitation",
    "DHC-OBJ-VERNACULAR": "vernacular_without_translation",
    "SC-VIII-VERNACULAR": "vernacular_without_translation",
    "DHC-OBJ-AFFIDAVIT-ATTESTED": "attestation_missing",
    "DHC-OBJ-SIGNED-BY-COUNSEL": "signature_missing",
    "DHC-OBJ-WELFARE-STAMP": "welfare_stamp",
  };
  if (map[ruleId]) return map[ruleId];
  if (/VAKALATNAMA|MEMO-OF-PARTIES|LISTING-PROFORMA|SYNOPSIS|CERTIFIED-COPY|AFFIDAVIT/.test(ruleId))
    return "missing_document";
  return "other";
}
