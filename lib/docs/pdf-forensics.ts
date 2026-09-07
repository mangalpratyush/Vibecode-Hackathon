import type { PageForensics } from "../types";

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Page-level forensics, measured from the PDF itself.
 *
 * This is the part that lets PARAM say something a checklist cannot: not
 * "remember your margins" but "page 23 has a 1.7 cm left margin; the rule is
 * 4 cm". Everything here is measurement, never inference — each number below
 * is read off the file and can be verified by opening the PDF.
 *
 * Text geometry comes from pdfjs-dist (text items carry a transform matrix, so
 * we get the x/y of every run of text). Image dimensions come from pdf-lib,
 * reading the XObject dictionary directly, because that is the only way to get
 * a scan's true pixel size without rendering the page.
 */

const PT_PER_CM = 72 / 2.54; // 28.346 pt

interface PdfTextItem {
  str: string;
  transform: number[]; // [a, b, c, d, e, f] — e = x, f = y (origin bottom-left)
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

export interface PdfForensics {
  pageCount: number;
  hasTextLayer: boolean;
  hasBookmarks: boolean;
  pages: PageForensics[];
  /** Page-wise text, so callers do not have to parse twice. */
  pageTexts: string[];
}

/** Devanagari, Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam. */
const INDIC =
  /[ऀ-ॿঀ-৿਀-੿઀-૿଀-୿஀-௿ఀ-౿ಀ-೿ഀ-ൿ]/;

function detectScript(text: string): PageForensics["script"] {
  const t = text.trim();
  if (!t) return "none";
  const indic = (t.match(new RegExp(INDIC, "g")) || []).length;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  if (indic > 0 && indic >= latin * 0.25) return "devanagari";
  if (latin > 0) return "latin";
  return "other";
}

/**
 * The page number printed on the page, as distinct from its ordinal position.
 * We only trust a bare number sitting in the top or bottom 9% of the page —
 * that is where a Registry-paginated paperbook carries it. A number in the
 * body of the page is evidence, a date, or a section reference, not pagination.
 */
function readPrintedPageNo(items: PdfTextItem[], heightPt: number): number | null {
  const band = heightPt * 0.09;
  const candidates: { n: number; edge: number }[] = [];
  for (const it of items) {
    const s = it.str.trim();
    if (!/^\d{1,4}$/.test(s)) continue;
    const y = it.transform?.[5] ?? 0;
    const fromBottom = y;
    const fromTop = heightPt - y;
    const edge = Math.min(fromBottom, fromTop);
    if (edge <= band) candidates.push({ n: parseInt(s, 10), edge });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.edge - b.edge);
  return candidates[0].n;
}

/**
 * Left margin in centimetres.
 *
 * Uses the 5th percentile of the x-coordinates of body text rather than the
 * bare minimum: one stray element hanging into the margin (a stamp, a seal, a
 * marginal note) should not decide the measurement for the whole page. Header
 * and footer bands are excluded for the same reason.
 */
function measureLeftMargin(items: PdfTextItem[], heightPt: number): number | null {
  const band = heightPt * 0.09;
  const xs: number[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = it.transform?.[5] ?? 0;
    if (y <= band || heightPt - y <= band) continue; // skip header/footer
    const x = it.transform?.[4];
    if (typeof x === "number" && x >= 0) xs.push(x);
  }
  if (xs.length < 5) return null;
  xs.sort((a, b) => a - b);
  const p5 = xs[Math.floor(xs.length * 0.05)];
  return Math.round((p5 / PT_PER_CM) * 100) / 100;
}

/**
 * Largest image on each page, in pixels, read straight from the page's XObject
 * dictionary. Used to compute effective DPI for the "dim / illegible annexure"
 * objection. Best-effort: a PDF that hides its images behind a form XObject we
 * do not walk into simply yields null, and the check is skipped rather than
 * guessed.
 */
async function imagePixelWidths(buf: Buffer): Promise<(number | null)[]> {
  try {
    const { PDFDocument, PDFName, PDFRawStream } = require("pdf-lib");
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
    const pages = doc.getPages();
    return pages.map((page: { node: { Resources: () => unknown } }) => {
      try {
        const res = page.node.Resources() as
          | { lookup: (n: unknown) => unknown }
          | undefined;
        if (!res) return null;
        const xobjs = res.lookup(PDFName.of("XObject")) as
          | { entries: () => [unknown, unknown][] }
          | undefined;
        if (!xobjs?.entries) return null;
        let widest: number | null = null;
        for (const [, ref] of xobjs.entries()) {
          const stream = doc.context.lookup(ref);
          if (!(stream instanceof PDFRawStream)) continue;
          const dict = stream.dict as { get: (n: unknown) => { asNumber?: () => number } | undefined };
          const subtype = dict.get(PDFName.of("Subtype")) as { asString?: () => string } | undefined;
          if (subtype?.asString?.() !== "/Image") continue;
          const w = dict.get(PDFName.of("Width"))?.asNumber?.();
          if (typeof w === "number" && (widest === null || w > widest)) widest = w;
        }
        return widest;
      } catch {
        return null;
      }
    });
  } catch {
    return [];
  }
}

export async function analysePdf(buf: Buffer): Promise<PdfForensics> {
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  let hasBookmarks = false;
  try {
    const outline = await doc.getOutline();
    hasBookmarks = Array.isArray(outline) && outline.length > 0;
  } catch {
    hasBookmarks = false;
  }

  const imgWidths = await imagePixelWidths(buf);

  const pages: PageForensics[] = [];
  const pageTexts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const widthPt = viewport.width;
    const heightPt = viewport.height;

    const tc = await page.getTextContent();
    const items = (tc.items as PdfTextItem[]).filter((it) => typeof it.str === "string");

    let text = "";
    for (const it of items) text += it.str + (it.hasEOL ? "\n" : " ");
    text = text.replace(/[ \t]+/g, " ").trim();
    pageTexts.push(text);

    const wordCount = text ? text.split(/\s+/).length : 0;
    const imgW = imgWidths[i - 1] ?? null;
    const effectiveDpi =
      imgW && widthPt > 0 ? Math.round(imgW / (widthPt / 72)) : null;

    pages.push({
      pageNo: i,
      widthPt: Math.round(widthPt),
      heightPt: Math.round(heightPt),
      charCount: text.length,
      leftMarginCm: measureLeftMargin(items, heightPt),
      printedPageNo: readPrintedPageNo(items, heightPt),
      script: detectScript(text),
      // A page with almost no text and no image is blank; a scan is not blank.
      isBlank: wordCount <= 2 && !imgW,
      wordCount,
      effectiveDpi,
    });
  }

  return {
    pageCount: doc.numPages,
    hasTextLayer: pages.some((p) => p.charCount > 40),
    hasBookmarks,
    pages,
    pageTexts,
  };
}
