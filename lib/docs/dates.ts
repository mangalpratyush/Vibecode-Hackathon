import type { BundleDocument, FilingDates } from "../types";

/**
 * Reading the filing dates off the documents themselves.
 *
 * This is the step that separates PARAM from the limitation calculators already
 * on the market. They ask the advocate to type a date into a box. A certified
 * copy carries its own endorsement — the date the copy was applied for and the
 * date it was ready — and those two dates are exactly what s.12(2) turns on.
 * If we can read them, the advocate cannot mistype them.
 *
 * Deterministic first, and usually sufficient: a copying-section endorsement is
 * a printed form with fixed labels. lib/ai/tasks.ts has an AI fallback for the
 * ones that are worded unusually, but a regex hit is always preferred, because
 * a date is precisely the kind of value a model should not be inventing.
 */

// 12.03.2026 · 12-3-2026 · 12/03/26 · 12th March 2026 · 12 Mar 2026
const NUMERIC = /(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{2,4})/;
const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const TEXTUAL = new RegExp(
  `(\\d{1,2})\\s*(?:st|nd|rd|th)?\\s+(${MONTHS})[a-z]*\\.?,?\\s+(\\d{4})`,
  "i"
);

const MONTH_INDEX: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Parse the first date appearing in `s`, as ISO. Indian order is day-first. */
export function parseIndianDate(s: string): string | null {
  const textual = s.match(TEXTUAL);
  if (textual) {
    const d = parseInt(textual[1], 10);
    const m = MONTH_INDEX[textual[2].slice(0, 3).toLowerCase()];
    const y = parseInt(textual[3], 10);
    return build(y, m, d);
  }
  const numeric = s.match(NUMERIC);
  if (numeric) {
    const d = parseInt(numeric[1], 10);
    const m = parseInt(numeric[2], 10);
    let y = parseInt(numeric[3], 10);
    // A two-digit year on a court document is this century, not 1926.
    if (y < 100) y += 2000;
    return build(y, m, d);
  }
  return null;
}

function build(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject a date the calendar does not have (31 February and friends).
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    return null;
  return dt.toISOString().slice(0, 10);
}

/**
 * Labels as the copying sections actually print them. Order matters: the more
 * specific phrasing is tried first so "date of application for copy" is not
 * swallowed by a looser "date of" pattern.
 */
const LABELS: { key: keyof FilingDates; patterns: RegExp[] }[] = [
  {
    key: "copyAppliedOn",
    patterns: [
      /date\s+(?:of|on\s+which)\s+(?:the\s+)?application\s+(?:for\s+(?:the\s+)?copy\s+)?(?:was\s+)?(?:made|filed|presented)[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /date\s+of\s+application\s+for\s+(?:certified\s+)?copy[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /(?:copy\s+)?applied\s+(?:for\s+)?on[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /date\s+of\s+application[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
    ],
  },
  {
    key: "copyReadyOn",
    patterns: [
      /date\s+on\s+which\s+(?:the\s+)?copy\s+(?:was\s+)?(?:made\s+)?ready[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /date\s+(?:when|on\s+which)\s+(?:the\s+)?copy\s+was\s+(?:ready|prepared)[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /copy\s+(?:was\s+)?(?:made\s+)?ready\s+on[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /date\s+of\s+(?:preparation|readiness)[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /*
        Delivery is the fallback for readiness: a copy cannot be delivered
        before it is ready, so it is the conservative substitute.

        But the word "copy" is REQUIRED here, and "judgment"/"order" must not
        precede it. Without that guard, a real Delhi High Court judgment headed
        "Judgment Delivered on: 26.08.2025" had its pronouncement date read as
        the certified copy's delivery date. That silently invents a s.12(2)
        exclusion and produces a limitation verdict that is confident and wrong,
        which is the exact failure this whole extraction stage exists to stop.
      */
      /date\s+of\s+delivery\s+of\s+(?:the\s+)?(?:certified\s+)?copy[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /(?<!judgment\s)(?<!judgement\s)(?<!order\s)(?:certified\s+)?copy\s+(?:was\s+)?delivered\s+on[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      // Bare "Date of delivery:" is safe only on a copying-section endorsement,
      // which is why it is last and only consulted when nothing better matched.
      /date\s+of\s+delivery\s*[:\-]\s*([^\n]{0,40})/i,
    ],
  },
  {
    key: "pronouncedOn",
    patterns: [
      // Real courts write this several ways: "Judgment pronounced on:",
      // "Judgment Delivered on:", "Reserved on … Pronounced on:".
      /(?:judgment|judgement|order)\s+(?:was\s+)?(?:pronounced|delivered|reserved\s+and\s+pronounced)\s+on[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /pronounced\s+on[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /date\s+of\s+(?:judgment|judgement|order|decision|decree)[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /(?:decided|delivered)\s+on[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
      /reserved\s+on[^\n]{0,60}?pronounced\s+on[^\n:]*[:\-]?\s*([^\n]{0,40})/i,
    ],
  },
];

export interface DateExtraction {
  dates: Partial<Record<keyof FilingDates, string>>;
  /** Where each date was found, for the provenance line in the UI. */
  evidence: Partial<Record<keyof FilingDates, string>>;
}

/**
 * Pull what we can from the certified copy and the impugned order.
 *
 * We only read documents that should carry these endorsements. Scanning the
 * whole bundle would find plenty of dates and attribute them wrongly, which is
 * worse than finding nothing — a wrong pronouncement date produces a confident
 * limitation computation that is silently off by weeks.
 */
export function extractFilingDates(documents: BundleDocument[]): DateExtraction {
  /*
    Prefer the documents that carry the endorsement, but do not stop there.

    Restricting the search to CERTIFIED_COPY and IMPUGNED_ORDER was tuned to a
    bundle this project generated, where those kinds were always classified
    correctly. Handed a real judgment the classifier calls it something else,
    and every date was missed. So: read the preferred kinds when they exist,
    otherwise read whatever has text. The labels are specific enough
    ("pronounced on", "date of application for copy") that a false positive
    elsewhere is unlikely, and the ordering sanity checks below still apply.
  */
  const preferred = documents.filter(
    (d) => d.kind === "CERTIFIED_COPY" || d.kind === "IMPUGNED_ORDER"
  );
  const sources = preferred.length
    ? preferred
    : documents.filter((d) => d.text.trim().length > 80);
  const out: DateExtraction = { dates: {}, evidence: {} };
  if (!sources.length) return out;

  for (const doc of sources) {
    // The endorsement is on the first page or two, never buried at the back.
    const head = doc.pagesText.slice(0, 3).join("\n");
    if (!head.trim()) continue;

    for (const { key, patterns } of LABELS) {
      if (out.dates[key]) continue;
      for (const re of patterns) {
        const m = head.match(re);
        if (!m?.[1]) continue;
        const iso = parseIndianDate(m[1]);
        if (!iso) continue;
        out.dates[key] = iso;
        out.evidence[key] = `${doc.fileName}: "${m[0].trim().slice(0, 90)}"`;
        break;
      }
    }
  }

  // Sanity: a copy cannot be ready before it was applied for, and cannot be
  // applied for before the order existed. A pattern that produces an impossible
  // ordering has matched the wrong line, so drop it rather than compute on it.
  const { pronouncedOn, copyAppliedOn, copyReadyOn } = out.dates;
  if (copyAppliedOn && copyReadyOn && copyReadyOn < copyAppliedOn) {
    delete out.dates.copyReadyOn;
    delete out.evidence.copyReadyOn;
  }
  if (pronouncedOn && copyAppliedOn && copyAppliedOn < pronouncedOn) {
    delete out.dates.copyAppliedOn;
    delete out.evidence.copyAppliedOn;
    delete out.dates.copyReadyOn;
    delete out.evidence.copyReadyOn;
  }

  return out;
}
