import type { DocKind } from "../types";

/**
 * Court-document classification.
 *
 * Deterministic first, AI second. Filenames in a real filing bundle are
 * unusually honest ("vakalatnama.pdf", "Annexure P-3.pdf") because the person
 * assembling the bundle names them for their own use, so the filename is
 * genuinely strong evidence here in a way it would not be elsewhere. Content
 * keywords are the fallback, and the AI classifier only sees the documents both
 * of those fail on.
 *
 * Rewritten from SIIM's CATEGORY_RULES, same shape, court taxonomy.
 */

interface KindRule {
  kind: DocKind;
  /** Matched against the filename. */
  file?: RegExp;
  /** Matched against the first page or two of extracted text. */
  content?: RegExp;
}

const RULES: KindRule[] = [
  {
    kind: "VAKALATNAMA",
    file: /vakalat|vakalath|vakkalat|power[\s_-]*of[\s_-]*attorney|\bpoa\b|memo[\s_-]*of[\s_-]*appearance/i,
    content: /vakalatnama|memo of appearance|do hereby appoint.{0,80}advocate|advocate[- ]on[- ]record/i,
  },
  {
    kind: "AFFIDAVIT",
    file: /affidavit|\baffi\b|verifying[\s_-]*affidavit/i,
    content: /solemnly affirm|deponent|sworn|oath commissioner|verified at .{0,40} on this/i,
  },
  {
    kind: "SYNOPSIS_LIST_OF_DATES",
    file: /synops|list[\s_-]*of[\s_-]*dates|\blod\b/i,
    content: /list of dates|synopsis and list of dates|dates?\s*(&|and)\s*events/i,
  },
  {
    kind: "MEMO_OF_PARTIES",
    file: /memo[\s_-]*of[\s_-]*part|\bmop\b|array[\s_-]*of[\s_-]*part/i,
    content: /memo of parties|memorandum of parties/i,
  },
  {
    kind: "LISTING_PROFORMA",
    file: /listing[\s_-]*proforma|proforma/i,
    content: /listing proforma|nature of (the )?matter.{0,60}category/i,
  },
  {
    kind: "COURT_FEE",
    file: /court[\s_-]*fee|\bcf\b|challan|e[\s_-]*stamp|receipt/i,
    content: /court fee|e-?stamp certificate|stamp duty paid|challan no/i,
  },
  {
    kind: "INDEX",
    file: /^index|\bindex\b/i,
    content: /^\s*index\b|s\.?\s*no\.?\s+particulars\s+page/i,
  },
  {
    kind: "CERTIFIED_COPY",
    file: /certified[\s_-]*copy|\bcc\b[\s_-]*(of|order)|true[\s_-]*copy/i,
    content:
      /certified (to be a )?true copy|copy prepared on|date of application.{0,40}date of delivery|application for copy/i,
  },
  {
    kind: "IMPUGNED_ORDER",
    file: /impugned|judgment|judgement|order[\s_-]*dated|decree/i,
    content: /in the high court of|coram\s*:|pronounced on|it is ordered that/i,
  },
  {
    kind: "APPLICATION",
    file: /\bia\b|application|condonation|exemption|stay[\s_-]*appl/i,
    content: /application (under|for) (section|s\.)|condonation of delay|prayed that this hon/i,
  },
  {
    kind: "ANNEXURE",
    file: /annexur|annex[\s_-]*[a-z]?[-\s]*\d|\bexhibit\b/i,
    content: /^\s*annexure\s*[a-z]?\s*-?\s*\d/i,
  },
  {
    kind: "PETITION",
    file: /petition|appeal|\bslp\b|writ|memo[\s_-]*of[\s_-]*appeal|plaint/i,
    content:
      /special leave petition|in the supreme court of india|writ petition|memorandum of appeal|most respectfully sheweth|prayer\b/i,
  },
];

/** "Annexure P-7" / "Annexure P7" / "ANNEXURE-A-1" from a filename or heading. */
export function readAnnexureMark(fileName: string, text: string): string | undefined {
  const src = `${fileName}\n${text.slice(0, 600)}`;
  const m = src.match(/annexure\s*[-–:]?\s*([A-Za-z]{1,2})\s*[-–]?\s*(\d{1,3})/i);
  if (m) return `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`;
  return undefined;
}

export interface ClassifyResult {
  kind: DocKind;
  source: "filename" | "keywords";
  confidence: number;
}

/**
 * Classify without any network call. Filename evidence outranks content
 * evidence, and both are scored so the UI can show how sure we are — a
 * mis-classification is the advocate's to correct, not something to hide.
 */
export function classifyDocument(fileName: string, text: string): ClassifyResult {
  const head = text.slice(0, 4000);

  for (const r of RULES) {
    if (r.file?.test(fileName)) {
      const alsoContent = r.content?.test(head) ?? false;
      return { kind: r.kind, source: "filename", confidence: alsoContent ? 95 : 78 };
    }
  }
  for (const r of RULES) {
    if (r.content?.test(head)) {
      return { kind: r.kind, source: "keywords", confidence: 66 };
    }
  }
  return { kind: "UNKNOWN", source: "keywords", confidence: 0 };
}
