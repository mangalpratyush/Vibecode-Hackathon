import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Bundle, BundleDocument } from "../types";
import { DOC_KIND_LABEL } from "../types";
import { readDocumentFile } from "../storage/files";

/**
 * Auto-repair.
 *
 * Two of the defects PARAM raises are purely mechanical, and fixing them by
 * hand is the kind of clerical work that eats an afternoon and then gets a
 * digit wrong anyway: continuous pagination across the whole paperbook, and an
 * index whose page numbers actually match it.
 *
 * What this deliberately does NOT do is as important. It will not touch
 * translations, signatures, court fee or certified copies — those are defects
 * only a person can cure, and a tool that quietly "fixed" them would be
 * producing a document the advocate has not read.
 *
 * A note on repagination, learned the hard way.
 *
 * The obvious implementation — paint a white box over the old page number and
 * stamp a new one — DOES NOT WORK, and fails in a way worth recording. Drawing
 * a rectangle only adds paint to the content stream; the original text is still
 * there and still extractable. Round-tripping such a file back through
 * lib/docs/pdf-forensics found both numbers sitting in the footer, and the
 * "repaired" bundle failed the very pagination check it was meant to cure.
 * (This is the same reason white-box redaction leaks documents in the wild.)
 *
 * pdf-lib cannot excise text from a content stream, so PARAM does not pretend
 * to. Numbers are stamped ONLY on pages that carry none. A page whose existing
 * number is out of sequence is reported back for manual repagination instead of
 * being silently double-numbered — an advocate would rather be told than be
 * handed a file that looks fixed and is not.
 */

const PAGE_ORDER: BundleDocument["kind"][] = [
  "INDEX",
  "LISTING_PROFORMA",
  "MEMO_OF_PARTIES",
  "SYNOPSIS_LIST_OF_DATES",
  "PETITION",
  "APPLICATION",
  "AFFIDAVIT",
  "VAKALATNAMA",
  "COURT_FEE",
  "CERTIFIED_COPY",
  "IMPUGNED_ORDER",
  "ANNEXURE",
  "UNKNOWN",
];

/** Paperbook order, with annexures in their marked sequence (P-1, P-2, P-10). */
export function orderedDocuments(bundle: Bundle): BundleDocument[] {
  const rank = (d: BundleDocument) => {
    const i = PAGE_ORDER.indexOf(d.kind);
    return i === -1 ? PAGE_ORDER.length : i;
  };
  const annexureNo = (d: BundleDocument) => {
    const m = d.annexureMark?.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };
  return [...bundle.documents].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      annexureNo(a) - annexureNo(b) ||
      a.fileName.localeCompare(b.fileName)
  );
}

export interface RepairResult {
  pdf: Uint8Array;
  totalPages: number;
  /** Document → first and last page in the repaired bundle. */
  contents: { fileName: string; label: string; from: number; to: number }[];
  /** Files we could not read back, named rather than silently dropped. */
  missing: string[];
  /** Pages that had no number and were given one. */
  stamped: number;
  /**
   * Pages that already carry a printed number which no longer matches their
   * position. PARAM cannot remove existing text, so these are reported rather
   * than double-stamped. Empty is the good case.
   *
   * `page` is the sheet in the repaired file; `shouldBe` is its place in the
   * paperbook sequence, which excludes the generated index. The two differ by
   * the index length, and saying only "carries 7" would look correct when it
   * is not.
   */
  needsManualRepagination: { page: number; carries: number; shouldBe: number }[];
}

interface RepairOptions {
  /** Stamp continuous page numbers bottom-centre. */
  paginate?: boolean;
  /** Prepend a generated index sheet. */
  index?: boolean;
}

export async function repairBundle(
  bundle: Bundle,
  opts: RepairOptions = { paginate: true, index: true }
): Promise<RepairResult> {
  const ordered = orderedDocuments(bundle);
  const out = await PDFDocument.create();
  const contents: RepairResult["contents"] = [];
  const missing: string[] = [];

  /*
    Output pages that already carry a printed number, and the number they carry.
    These are left alone: see the note at the top of this file.
  */
  const alreadyNumbered = new Map<number, number>();

  for (const doc of ordered) {
    const bytes = await readDocumentFile(bundle.id, doc.id);
    if (!bytes) {
      missing.push(doc.fileName);
      continue;
    }
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      missing.push(doc.fileName);
      continue;
    }
    const from = out.getPageCount() + 1;
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p, i) => {
      const before = out.getPageCount(); // zero-based index of the page we add
      out.addPage(p);
      const existing = doc.pages[i]?.printedPageNo;
      if (existing !== null && existing !== undefined)
        alreadyNumbered.set(before, existing);
    });
    contents.push({
      fileName: doc.fileName,
      label:
        DOC_KIND_LABEL[doc.kind] + (doc.annexureMark ? ` ${doc.annexureMark}` : ""),
      from,
      to: out.getPageCount(),
    });
  }

  if (out.getPageCount() === 0)
    throw new Error(
      "None of the bundle's files could be read back from disk, so there is nothing to repair."
    );

  /*
    The index is built first and inserted at the front, which shifts every page
    by the length of the index itself. So the index is generated, its own length
    measured, and the page numbers written into it are offset accordingly —
    otherwise the regenerated index would point one or two pages short, which is
    the very defect we are curing.
  */
  let offset = 0;
  if (opts.index) {
    const rows = contents.length;
    const perPage = 28;
    offset = Math.max(1, Math.ceil(rows / perPage));
    await prependIndex(out, contents, offset);
  }

  // insertPage shifted every original page down by the length of the index.
  const numbered = new Map(
    [...alreadyNumbered].map(([i, n]) => [i + offset, n] as const)
  );

  let stamped = 0;
  if (opts.paginate) stamped = await stampPageNumbers(out, offset, numbered);

  /*
    Pages whose existing number does not match where they now sit. We cannot
    remove that number, so we name the pages and let counsel repaginate them.
  */
  const needsManualRepagination: RepairResult["needsManualRepagination"] = [];
  for (const [i, carries] of numbered) {
    // Position in the paperbook, not in the file: the generated index sheet is
    // not part of the numbered sequence.
    const shouldBe = i + 1 - offset;
    if (carries !== shouldBe)
      needsManualRepagination.push({ page: i + 1, carries, shouldBe });
  }
  needsManualRepagination.sort((a, b) => a.page - b.page);

  return {
    pdf: await out.save(),
    totalPages: out.getPageCount(),
    contents: contents.map((c) => ({
      ...c,
      from: c.from + offset,
      to: c.to + offset,
    })),
    missing,
    stamped,
    needsManualRepagination,
  };
}

async function prependIndex(
  doc: PDFDocument,
  contents: RepairResult["contents"],
  indexPages: number
) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const CM = 72 / 2.54;
  const [w, h] = [595.28, 841.89]; // A4
  const left = 4 * CM; // the Delhi HC 4 cm rule applies to what we generate too
  const right = w - 2 * CM;

  const perPage = 28;
  const chunks: RepairResult["contents"][] = [];
  for (let i = 0; i < contents.length; i += perPage)
    chunks.push(contents.slice(i, i + perPage));
  if (!chunks.length) chunks.push([]);

  // Built back-to-front: each insertAt(0) pushes the previous one down.
  for (let c = chunks.length - 1; c >= 0; c--) {
    const page = doc.insertPage(0, [w, h]);
    let y = h - 2.6 * CM;

    page.drawText("INDEX", {
      x: left,
      y,
      size: 13,
      font: bold,
      color: rgb(0.07, 0.16, 0.28),
    });
    y -= 10;
    page.drawText(
      c === 0 ? "Prepared by PARAM — verify against the bundle before filing." : "INDEX (contd.)",
      { x: left, y: y - 8, size: 8, font, color: rgb(0.42, 0.47, 0.53) }
    );
    y -= 30;

    page.drawText("S. No.", { x: left, y, size: 9, font: bold });
    page.drawText("Particulars", { x: left + 50, y, size: 9, font: bold });
    page.drawText("Page", { x: right - 40, y, size: 9, font: bold });
    y -= 6;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.7,
      color: rgb(0.78, 0.75, 0.68),
    });
    y -= 16;

    const startNo = c * perPage;
    chunks[c].forEach((row, i) => {
      const n = startNo + i + 1;
      const from = row.from + indexPages;
      const to = row.to + indexPages;
      page.drawText(`${n}.`, { x: left, y, size: 9.5, font });
      page.drawText(clip(`${row.label} — ${row.fileName}`, 66), {
        x: left + 50,
        y,
        size: 9.5,
        font,
      });
      page.drawText(from === to ? `${from}` : `${from}–${to}`, {
        x: right - 40,
        y,
        size: 9.5,
        font,
      });
      y -= 16;
    });
  }
}

/**
 * Continuous numbering across the whole paperbook, bottom-centre, in the
 * footer band where a Registry-paginated bundle carries it — and where
 * lib/docs/pdf-forensics.ts looks for it when the repaired file is re-scanned.
 */
async function stampPageNumbers(
  doc: PDFDocument,
  skipFirst: number,
  alreadyNumbered: Map<number, number>
): Promise<number> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  let count = 0;
  pages.forEach((page, i) => {
    if (i < skipFirst) return; // the generated index is not part of the sequence
    // Never add a second number to a page that already has one.
    if (alreadyNumbered.has(i)) return;
    const n = i + 1 - skipFirst;
    const { width } = page.getSize();
    count++;
    const label = String(n);
    const size = 10;
    const textWidth = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: width / 2 - textWidth / 2,
      y: 1.5 * (72 / 2.54),
      size,
      font,
      color: rgb(0, 0, 0),
    });
  });
  return count;
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
