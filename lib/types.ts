/**
 * PARAM domain types.
 *
 * Vocabulary is deliberately the Registry's own: a filing is a BUNDLE of
 * DOCUMENTS, scrutiny produces DEFECTS, and every defect points at a RULE.
 */

// ── Courts and case types ───────────────────────────────────────────────────

export type CourtId = "SUPREME_COURT" | "DELHI_HIGH_COURT";

export const COURTS: { id: CourtId; name: string; short: string }[] = [
  { id: "SUPREME_COURT", name: "Supreme Court of India", short: "SC" },
  { id: "DELHI_HIGH_COURT", name: "High Court of Delhi", short: "DHC" },
];

export interface CaseType {
  id: string;
  court: CourtId;
  /** Registry's own abbreviation, e.g. CRLA, CUSAC, SLP(C). */
  code: string;
  name: string;
  /** Prescribed limitation period in days, null when not a fixed appeal window. */
  limitationDays: number | null;
  /** Statutory source of that period. */
  limitationSource?: string;
  /** Whether s.12(2) certified-copy exclusion applies (appeals/revisions/reviews). */
  certifiedCopyExclusion: boolean;
  /** Whether s.5 condonation is available at all. */
  condonationAvailable: boolean;
  /** Hard outer limit beyond which no court may condone, in days. */
  outerLimitDays?: number;
  outerLimitNote?: string;
}

// ── Rulebook ────────────────────────────────────────────────────────────────

export type Severity = "FATAL" | "REGISTRY_OBJECTION" | "ADVISORY";

/**
 * One row of the rulebook. `check` is the id of the deterministic function in
 * lib/scrutiny/checks that tests it. A rule with no matching check is inert —
 * it shows in the browsable rulebook but cannot raise a defect, which is the
 * honest state for a rule we have encoded but not yet automated.
 */
export interface Rule {
  id: string;
  court: CourtId;
  /** Empty array means: applies to every case type in this court. */
  caseTypes: string[];
  severity: Severity;
  check: string;
  /** The objection as the Registry itself words it, wherever possible. */
  text: string;
  /** Plain-English explanation of why it matters. */
  why?: string;
  source: string;
  sourceUrl: string;
  /** Date we last checked this row against its primary source. */
  verifiedOn: string;
  /** Rules we could not verify are excluded from scrutiny, never guessed at. */
  status: "verified" | "unverified";
  /** Arguments for the check function, e.g. which document kind is required. */
  params?: Record<string, string | number>;
  /** True when the check needs an AI key and is skipped without one. */
  needsAi?: boolean;
  fix?: {
    auto: boolean;
    guidance: string;
  };
}

// ── Bundle and documents ────────────────────────────────────────────────────

export type DocKind =
  | "PETITION"
  | "SYNOPSIS_LIST_OF_DATES"
  | "MEMO_OF_PARTIES"
  | "CERTIFIED_COPY"
  | "IMPUGNED_ORDER"
  | "AFFIDAVIT"
  | "VAKALATNAMA"
  | "COURT_FEE"
  | "LISTING_PROFORMA"
  | "ANNEXURE"
  | "APPLICATION"
  | "INDEX"
  | "UNKNOWN";

export const DOC_KIND_LABEL: Record<DocKind, string> = {
  PETITION: "Petition / Appeal",
  SYNOPSIS_LIST_OF_DATES: "Synopsis & List of Dates",
  MEMO_OF_PARTIES: "Memo of Parties",
  CERTIFIED_COPY: "Certified Copy",
  IMPUGNED_ORDER: "Impugned Order",
  AFFIDAVIT: "Affidavit",
  VAKALATNAMA: "Vakalatnama",
  COURT_FEE: "Court Fee",
  LISTING_PROFORMA: "Listing Proforma",
  ANNEXURE: "Annexure",
  APPLICATION: "Interlocutory Application",
  INDEX: "Index",
  UNKNOWN: "Unclassified",
};

/** Per-page forensic measurements taken from the PDF itself. */
export interface PageForensics {
  pageNo: number;
  widthPt: number;
  heightPt: number;
  /** Characters of extractable text. 0 means no text layer on this page. */
  charCount: number;
  /** Left margin in centimetres, measured from the leftmost text on the page. */
  leftMarginCm: number | null;
  /** Page number printed on the page, as read from its text. */
  printedPageNo: number | null;
  /** Dominant script detected on the page. */
  script: "latin" | "devanagari" | "other" | "none";
  isBlank: boolean;
  /** Rough words-per-page, used to spot near-empty pages. */
  wordCount: number;
  /**
   * Effective resolution of the largest image on the page, in DPI, computed as
   * image pixel width over page width in inches. Null when the page carries no
   * image we could measure. Below ~200 the Registry is likely to call it dim.
   */
  effectiveDpi?: number | null;
}

export interface BundleDocument {
  id: string;
  fileName: string;
  sizeBytes: number;
  kind: DocKind;
  /** How the kind was decided, shown in the UI so nothing looks like magic. */
  kindSource: "filename" | "keywords" | "ai" | "user";
  kindConfidence: number;
  /** Annexure mark, e.g. "P-7", when kind is ANNEXURE. */
  annexureMark?: string;
  pageCount: number;
  hasTextLayer: boolean;
  hasBookmarks: boolean;
  pages: PageForensics[];
  /** Page-wise text, so a defect can name the page it sits on. */
  pagesText: string[];
  text: string;
}

export interface Bundle {
  id: string;
  ownerEmail: string;
  title: string;
  court: CourtId;
  caseTypeId: string;
  createdAt: string;
  documents: BundleDocument[];
  /** Dates the advocate supplied or PARAM read off the certified copy. */
  dates: FilingDates;
  /** Declared court fee paid, in rupees. */
  courtFeePaid?: number;
  /** Suit valuation where relevant, in rupees. */
  valuation?: number;
}

export interface FilingDates {
  /** Date the impugned judgment/order was pronounced. */
  pronouncedOn?: string;
  /** Date the certified copy was applied for. */
  copyAppliedOn?: string;
  /** Date the certified copy was ready/delivered. */
  copyReadyOn?: string;
  /** Intended date of filing; defaults to today. */
  filingOn?: string;
  /** Where each date came from, so the UI can show provenance. */
  source?: Partial<Record<keyof Omit<FilingDates, "source">, "user" | "ai" | "regex">>;
}

// ── Scrutiny output ─────────────────────────────────────────────────────────

export interface Defect {
  /** Rule that was violated. */
  ruleId: string;
  severity: Severity;
  /** One-line statement of the defect, filled with the specifics found. */
  title: string;
  /** The specifics: which page, which annexure, which number. */
  detail: string;
  /** The Registry's own wording of the objection. */
  registryWording: string;
  source: string;
  sourceUrl: string;
  /** Document and page this defect sits on, when it is page-specific. */
  documentId?: string;
  pageNo?: number;
  /**
   * True when a model inferred this rather than the engine measuring it. The
   * UI shows it differently on purpose: "page 23 has a 1.7 cm margin" and "the
   * cause title looks wrong" are not findings of the same kind, and presenting
   * them with equal authority would be misleading.
   */
  aiAssisted?: boolean;
  fix?: { auto: boolean; guidance: string };
}

export interface LimitationResult {
  /** Whether we had enough information to compute at all. */
  computed: boolean;
  /** Why not, when computed is false. */
  reason?: string;
  prescribedDays?: number;
  prescribedSource?: string;
  /** Step-by-step working, shown to the user. This is the whole point: an
   *  advocate must be able to check our arithmetic against the statute. */
  steps: LimitationStep[];
  dueOn?: string;
  daysRemaining?: number;
  /** Positive when the filing is already out of time. */
  daysOverdue?: number;
  barred?: boolean;
  condonationNeeded?: boolean;
  condonationAvailable?: boolean;
  condonationNote?: string;
}

export interface LimitationStep {
  label: string;
  /** The provision relied on, e.g. "Limitation Act, 1963, s.12(2)". */
  provision?: string;
  /** Human sentence explaining what this step did. */
  detail: string;
  /** Running date after this step, where applicable. */
  runningDate?: string;
  /** Days added or excluded by this step. */
  days?: number;
}

export interface ScrutinyResult {
  bundleId: string;
  ranAt: string;
  court: CourtId;
  caseTypeId: string;
  defects: Defect[];
  limitation: LimitationResult;
  /** Checks that ran and found nothing — shown so the advocate sees coverage. */
  passed: { ruleId: string; text: string }[];
  /** Checks skipped because they need an AI key or missing input. */
  skipped: { ruleId: string; text: string; reason: string }[];
  stats: {
    documents: number;
    pages: number;
    fatal: number;
    objections: number;
    advisories: number;
  };
}
