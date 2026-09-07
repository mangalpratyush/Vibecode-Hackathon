import type { CaseType, CourtId, Rule } from "../types";
import dhcObjections from "./dhc-common-objections.json";
import dhcEfiling from "./dhc-efiling-2021.json";
import scRules from "./sc-rules-2013.json";

/**
 * The rulebook is DATA, not code.
 *
 * Every defect PARAM raises resolves to one row here, and every row carries the
 * primary source it came from plus the date we last checked it. Rows we could
 * not verify against the source are marked "unverified" and are excluded from
 * scrutiny — they still appear in the browsable rulebook, honestly labelled, so
 * the coverage gap is visible rather than hidden.
 *
 * This is the answer to the only question a practitioner will really ask:
 * "where does that objection come from?"
 */

export const RULES: Rule[] = [
  ...(scRules as Rule[]),
  ...(dhcObjections as Rule[]),
  ...(dhcEfiling as Rule[]),
];

/** Rules that may actually raise a defect: right court, right case type, verified. */
export function activeRules(court: CourtId, caseTypeId: string): Rule[] {
  return RULES.filter(
    (r) =>
      r.court === court &&
      r.status === "verified" &&
      (r.caseTypes.length === 0 || r.caseTypes.includes(caseTypeId))
  );
}

export function ruleById(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}

export function rulebookStats() {
  const verified = RULES.filter((r) => r.status === "verified").length;
  return {
    total: RULES.length,
    verified,
    unverified: RULES.length - verified,
    courts: new Set(RULES.map((r) => r.court)).size,
    sources: new Set(RULES.map((r) => r.source)).size,
  };
}

// ── Case types and their limitation periods ─────────────────────────────────

/**
 * The prescribed period, its statutory source, and — critically — whether s.5
 * condonation is available at all. Arbitration s.34(3) is the trap: the outer
 * limit is absolute and no court may condone beyond it, so telling an advocate
 * "file a condonation application" there would be wrong advice.
 */
export const CASE_TYPES: CaseType[] = [
  {
    id: "SLP_CIVIL",
    court: "SUPREME_COURT",
    code: "SLP (C)",
    name: "Special Leave Petition (Civil)",
    limitationDays: 90,
    limitationSource: "Limitation Act, 1963, Schedule, Art. 133 (90 days from the judgment of the High Court)",
    certifiedCopyExclusion: true,
    condonationAvailable: true,
  },
  {
    id: "SLP_CRIMINAL",
    court: "SUPREME_COURT",
    code: "SLP (Crl)",
    name: "Special Leave Petition (Criminal)",
    limitationDays: 60,
    limitationSource: "Supreme Court Rules, 2013, Order XXII r.2 (60 days from the order refusing leave / the impugned order)",
    certifiedCopyExclusion: true,
    condonationAvailable: true,
  },
  {
    id: "WRIT_PETITION",
    court: "SUPREME_COURT",
    code: "W.P.",
    name: "Writ Petition (Article 32)",
    limitationDays: null,
    limitationSource: "No period is prescribed for Art. 32, but unexplained delay (laches) is a discretionary bar.",
    certifiedCopyExclusion: false,
    condonationAvailable: true,
  },
  {
    id: "CIVIL_WRIT",
    court: "DELHI_HIGH_COURT",
    code: "W.P.(C)",
    name: "Civil Writ Petition (Article 226)",
    limitationDays: null,
    limitationSource: "No period is prescribed for Art. 226, but delay and laches are a discretionary bar.",
    certifiedCopyExclusion: false,
    condonationAvailable: true,
  },
  {
    id: "CRLA",
    court: "DELHI_HIGH_COURT",
    code: "CRL.A.",
    name: "Criminal Appeal",
    limitationDays: 60,
    limitationSource: "Limitation Act, 1963, Schedule, Art. 115 (appeal to the High Court from a sentence)",
    certifiedCopyExclusion: true,
    condonationAvailable: true,
  },
  {
    id: "RFA",
    court: "DELHI_HIGH_COURT",
    code: "RFA",
    name: "Regular First Appeal (civil)",
    limitationDays: 90,
    limitationSource: "Limitation Act, 1963, Schedule, Art. 116 (appeal to a High Court from a decree)",
    certifiedCopyExclusion: true,
    condonationAvailable: true,
  },
  {
    id: "CRLREV",
    court: "DELHI_HIGH_COURT",
    code: "CRL.REV.P.",
    name: "Criminal Revision Petition",
    limitationDays: 90,
    limitationSource: "Limitation Act, 1963, Schedule, Art. 131 (revision to the High Court)",
    certifiedCopyExclusion: true,
    condonationAvailable: true,
  },
  {
    id: "OMP_34",
    court: "DELHI_HIGH_COURT",
    code: "O.M.P. (COMM)",
    name: "Petition to set aside an arbitral award (s.34)",
    limitationDays: 90,
    limitationSource: "Arbitration and Conciliation Act, 1996, s.34(3) — three months from receipt of the signed award",
    certifiedCopyExclusion: false,
    condonationAvailable: true,
    outerLimitDays: 120,
    outerLimitNote:
      "s.34(3) proviso allows a further 30 days on sufficient cause and no more. s.5 of the Limitation Act does not apply, and no court may condone beyond 120 days.",
  },
];

export function caseTypesForCourt(court: CourtId): CaseType[] {
  return CASE_TYPES.filter((c) => c.court === court);
}

export function caseTypeById(id: string): CaseType | undefined {
  return CASE_TYPES.find((c) => c.id === id);
}
