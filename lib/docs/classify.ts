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
  const src = `${fileName.replace(/_/g, " ")}\n${text.slice(0, 600)}`;
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
 * Phrases that settle what a document IS, whatever someone named the file.
 *
 * The filename pass below is deliberately trusting, and on a bundle an
 * advocate assembled by hand that is right. It was wrong on real court files.
 * "DHC-writ-11742-2025.pdf" is a judgment delivered in a writ petition, but
 * "writ" sits in the PETITION filename rule, so every judgment we tested
 * against came back labelled Petition / Appeal. That produced a wrong index,
 * and it hid the impugned order from the limitation engine, which is the one
 * date the whole calculation turns on.
 *
 * So a few phrases get to speak over the filename. Each is something a
 * document can only really say about itself: a court announcing its coram, a
 * registry endorsing a certified copy, a petitioner sheweth-ing. Anything
 * weaker stays in RULES below, where the filename still wins.
 *
 * Order matters. A judgment reproduces the prayer it is deciding and a
 * petition quotes the order it impugns, so the party's own voice is read
 * before the court's.
 */
const DECISIVE: { kind: DocKind; re: RegExp }[] = [
  {
    kind: "VAKALATNAMA",
re: /^\s*VAKALATNAMA\s*$|do\s+hereby\s+appoint\s+and\s+retain/im,
  },
  {
    kind: "CERTIFIED_COPY",
    re: /certified\s+(?:to\s+be\s+a\s+)?true\s+copy|date\s+of\s+application\s+for\s+(?:certified\s+)?copy|date\s+on\s+which\s+(?:the\s+)?copy\s+was\s+(?:made\s+)?ready/i,
  },
  {
    kind: "PETITION",
    re: /most\s+respectfully\s+sheweth|therefore\s+most\s+respectfully\s+pray/i,
  },
  {
    kind: "IMPUGNED_ORDER",
    // "J U D G M E N T" letterspaced as a heading, never the running word.
    re: /\bcoram\s*:|\bj\s+u\s+d\s+g\s+m\s+e\s+n\s+t\b|\bo\s+r\s+d\s+e\s+r\b|judgment\s+(?:was\s+)?(?:pronounced|delivered|reserved)\s+on|(?:pronounced|reserved)\s+on\s*:|this\s+is\s+a\s+digitally\s+signed\s+(?:order|judgment)/i,
  },
];

/**
 * Classify without any network call. A decisive phrase wins outright; failing
 * that, filename evidence outranks content evidence. Both are scored so the UI
 * can show how sure we are, because a mis-classification is the advocate's to
 * correct, not something to hide.
 */
export function isUnfilledPrescribedForm(fileName: string, text: string): boolean {
  const head = text.slice(0, 7000);
  return /here\s+(?:insert|specify)\s+(?:the\s+)?(?:name|court)|S\.?L\.?P\.?\s*\(Civil\)\s*No\.?\s*\.{4,}/i.test(head)
    && /prescribed|form|NO\.?\s*28|special\s+leave\s+petition/i.test(fileName + " " + head);
}

export function classifyDocument(fileName: string, text: string): ClassifyResult {
  // A downloaded specimen is not the petition needed to satisfy a filing check.
  if (isUnfilledPrescribedForm(fileName, text)) return { kind: "UNKNOWN", source: "keywords", confidence: 95 };
  const head = text.slice(0, 4000);
  const name = fileName.replace(/_/g, " ").replace(/^\d+[ .-]*/, "");
  // A heading/explicit structural filename wins over references inside an index.
  if (/^index\b/i.test(name) || /^\s*INDEX\b/i.test(head))
    return { kind: "INDEX", source: "filename", confidence: 98 };
  if (/check\s*list/i.test(name) || /^\s*Advocate.{0,10}Check\s*List/i.test(head))
    return { kind: "CHECKLIST", source: "filename", confidence: 98 };
  if (/^cover\b/i.test(name)) return { kind: "COVER", source: "filename", confidence: 95 };
  if (/filing[ -]*memo/i.test(name)) return { kind: "FILING_MEMO", source: "filename", confidence: 95 };
  if (/annexur/i.test(name)) return { kind: "ANNEXURE", source: "filename", confidence: 95 };

  for (const d of DECISIVE) {
    if (d.re.test(head)) return { kind: d.kind, source: "keywords", confidence: 92 };
  }

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
