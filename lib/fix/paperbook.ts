import {
  PDFDocument, PDFFont, PDFPage, PDFArray, PDFDict, PDFName, PDFNumber, PDFHexString,
  StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState,
  concatTransformationMatrix, rectangle, clip, endPath,
} from "pdf-lib";
import type { Bundle, BundleDocument } from "../types";
import { readDocumentFile } from "../storage/files";
import { preserveFormAppearances } from "./source-forms";
import { describeDocument, reviewAssembly, type AssemblyWarning, type DocumentDescription } from "./document-description";

/**
 * Build a reviewable, navigable paperbook without rewriting a source document.
 * Index ranges, PDF positions, printed numbers and link destinations share ONE
 * coordinate system: physical pages, starting at 1, including the index.
 */
const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.08, 0.08, 0.08);
const RULE = rgb(0.55, 0.55, 0.55);
const MUTED = rgb(0.27, 0.27, 0.27);
const ORDER: BundleDocument["kind"][] = [
  "COVER", "CHECKLIST", "INDEX", "LISTING_PROFORMA", "MEMO_OF_PARTIES", "SYNOPSIS_LIST_OF_DATES",
  "PETITION", "APPLICATION", "AFFIDAVIT", "VAKALATNAMA", "COURT_FEE",
  "CERTIFIED_COPY", "IMPUGNED_ORDER", "ANNEXURE", "FILING_MEMO", "UNKNOWN",
];

export function orderedDocuments(bundle: Bundle): BundleDocument[] {
  const rank = (d: BundleDocument) => ORDER.indexOf(d.kind) < 0 ? ORDER.length : ORDER.indexOf(d.kind);
  return bundle.documents.map((doc, position) => ({ doc, position })).sort((a, b) => {
    const priority = rank(a.doc) - rank(b.doc);
    if (priority) return priority;
    if (a.doc.kind === "ANNEXURE") {
      const mark = (d: BundleDocument) => d.annexureMark || "";
      if (mark(a.doc) && mark(b.doc)) return mark(a.doc).localeCompare(mark(b.doc), "en", { numeric: true });
    }
    // Filenames are not a legal chronology. Preserve the user's order within a kind.
    return a.position - b.position;
  }).map(x => x.doc);
}

export interface RepairContents {
  fileName: string; label: string; detail: string; from: number; to: number;
}
export interface RepairResult {
  pdf: Uint8Array;
  totalPages: number;
  indexPages: number;
  contents: RepairContents[];
  missing: string[];
  stamped: number;
  carryOwnPagination: { fileName: string; pages: number }[];
  warnings: AssemblyWarning[];
  normalizedPages: number;
  signatureAppearancesPreserved: number;
  pageGeometry: { fileName: string; sourcePage: number; pdfPage: number; scale: number; width: number; height: number }[];
}
export interface RepairOptions { paginate?: boolean; index?: boolean }

export async function repairBundle(bundle: Bundle, opts: RepairOptions = {}): Promise<RepairResult> {
  return assemblePaperbook(bundle, doc => readDocumentFile(bundle.id, doc.id), opts);
}

/** Source loader injection keeps artifact regression tests off the live store. */
export async function assemblePaperbook(
  bundle: Bundle,
  readSource: (doc: BundleDocument) => Promise<Uint8Array | null>,
  options: RepairOptions = {},
): Promise<RepairResult> {
  const opts = { paginate: true, index: true, ...options };
  const descriptions = bundle.documents.map(describeDocument);
  const warnings = reviewAssembly(bundle, descriptions);
  const mixed = warnings.some(w => w.code === "MULTIPLE_MATTERS" || w.code === "UNFILLED_TEMPLATE");
  // There is no defensible automatic "main petition" order for a mixed sample.
  const ordered = (mixed ? [...bundle.documents] : orderedDocuments(bundle))
    .filter(d => !opts.index || d.kind !== "INDEX");
  if (opts.index && bundle.documents.some(d => d.kind === "INDEX")) warnings.push({
    code: "INDEX_REPLACED", message: "The uploaded index is replaced by the generated index. Original index pages remain in the source uploads, not duplicated in this paperbook."
  });
  const byId = new Map(bundle.documents.map((d, i) => [d.id, descriptions[i]]));
  const loaded: { doc: BundleDocument; pdf: PDFDocument; description: DocumentDescription }[] = [];
  const missing: string[] = [];
  let signatures = 0;
  for (const doc of ordered) {
    const bytes = await readSource(doc);
    if (!bytes) { missing.push(doc.fileName); continue; }
    try {
      const source = await PDFDocument.load(bytes);
      if (!source.getPageCount()) throw new Error("Empty PDF");
      // Flatten APPEARANCES on the working copy, not the uploaded bytes.
      // An assembled PDF cannot inherit the original cryptographic signatures.
      signatures += preserveFormAppearances(source);
      loaded.push({ doc, pdf: source, description: byId.get(doc.id)! });
    } catch {
      missing.push(doc.fileName);
    }
  }
  if (missing.length) throw new Error("Cannot create a complete paperbook. These files are missing, encrypted, unreadable, or have form appearances that could not be preserved: " + missing.join(", ") + ". Re-upload readable PDFs; no partial paperbook was generated.");
  if (!loaded.length) throw new Error("There are no readable documents to assemble.");
  if (signatures) warnings.push({
    code: "SOURCE_SIGNATURES",
    message: "Signature appearances are preserved in this assembled copy, but the source PDFs must be used to validate their digital signatures. The assembled PDF is not digitally signed.",
  });

  const out = await PDFDocument.create();
  const regular = await out.embedFont(StandardFonts.TimesRoman);
  const bold = await out.embedFont(StandardFonts.TimesRomanBold);
  const fonts = { regular, bold };
  const rows = loaded.map(({ doc, description, pdf }) => ({
    fileName: doc.fileName, label: description.label, detail: description.detail, count: pdf.getPageCount(),
  }));
  const plan = opts.index ? planIndex(bundle, rows, fonts, mixed) : null;
  const indexPages = plan?.sheets.length || 0;
  for (let i = 0; i < indexPages; i++) out.addPage(A4);
  const contents: RepairContents[] = [];
  const geometry: RepairResult["pageGeometry"] = [];
  const carryOwnPagination: RepairResult["carryOwnPagination"] = [];
  for (const { doc, pdf, description } of loaded) {
    const from = out.getPageCount() + 1;
    const pages = await out.copyPages(pdf, pdf.getPageIndices());
    for (const [i, page] of pages.entries()) {
      out.addPage(page);
      const placement = normalizePage(page);
      geometry.push({ fileName: doc.fileName, sourcePage: i + 1, pdfPage: out.getPageCount(), ...placement });
    }
    const own = doc.pages.filter(p => p.printedPageNo !== null).length;
    if (own) carryOwnPagination.push({ fileName: doc.fileName, pages: own });
    contents.push({ fileName: doc.fileName, label: description.label, detail: description.detail, from, to: out.getPageCount() });
  }
  if (plan) drawIndex(out, plan, contents, fonts, mixed);
  addNavigation(out, contents, indexPages);
  if (opts.paginate) {
    for (const [i, page] of out.getPages().entries()) {
      const source = contents.findIndex(c => i + 1 >= c.from && i + 1 <= c.to);
      const context = source < 0 ? "INDEX" : "DOCUMENT " + String(source + 1).padStart(2, "0");
      drawPageNumber(page, i + 1, out.getPageCount(), context, regular);
    }
  }
  out.setTitle(mixed ? "Document compilation for review" : bundle.title);
  out.setAuthor("PARAM");
  out.setSubject("Indexed document assembly. Source text preserved; not a certification of filing readiness.");
  out.setCreator("PARAM paperbook assembler");
  return {
    pdf: await out.save(), totalPages: out.getPageCount(), indexPages, contents,
    missing: [], stamped: opts.paginate ? out.getPageCount() : 0, carryOwnPagination,
    warnings, normalizedPages: geometry.length, signatureAppearancesPreserved: signatures, pageGeometry: geometry,
  };
}

type Matrix = [number, number, number, number, number, number];
function transformPoint(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Retain content streams, fonts, scans and annotations. Never OCR/retype evidence. */
function normalizePage(page: PDFPage): { scale: number; width: number; height: number } {
  const media = page.getMediaBox();
  const crop = page.getCropBox();
  const x = Math.max(media.x, crop.x), y = Math.max(media.y, crop.y);
  const w = Math.min(media.x + media.width, crop.x + crop.width) - x;
  const h = Math.min(media.y + media.height, crop.y + crop.height) - y;
  if (!(w > 0 && h > 0)) throw new Error("A source page has an invalid visible page area.");
  const angle = ((page.getRotation().angle % 360) + 360) % 360;
  const visibleW = angle === 90 || angle === 270 ? h : w;
  const visibleH = angle === 90 || angle === 270 ? w : h;
  const landscape = visibleW > visibleH;
  const [width, height] = landscape ? [A4[1], A4[0]] : A4;
  const top = 60, bottom = 24, side = 24;
  const s = Math.min((width - side * 2) / visibleW, (height - top - bottom) / visibleH, 1);
  const dx = (width - visibleW * s) / 2;
  const dy = height - top - visibleH * s;
  const rotation: Matrix = angle === 90 ? [0, -1, 1, 0, -y, x + w]
    : angle === 180 ? [-1, 0, 0, -1, x + w, y + h]
    : angle === 270 ? [0, 1, -1, 0, y + h, -x] : [1, 0, 0, 1, -x, -y];
  const matrix: Matrix = [rotation[0] * s, rotation[1] * s, rotation[2] * s, rotation[3] * s, rotation[4] * s + dx, rotation[5] * s + dy];
  page.node.normalize();
  page.pushOperators(); // Establish a content stream even for an empty scanned leaf.
  const ctx = page.doc.context;
  const start = ctx.register(ctx.contentStream([
    pushGraphicsState(), concatTransformationMatrix(...matrix),
    rectangle(x, y, w, h), clip(), endPath(),
  ]));
  const end = ctx.register(ctx.contentStream([popGraphicsState()]));
  if (!page.node.wrapContentStreams(start, end)) throw new Error("Could not preserve a source page's content streams.");
  transformAnnotations(page, matrix);
  page.setRotation(degrees(0));
  page.setMediaBox(0, 0, width, height);
  page.setCropBox(0, 0, width, height);
  page.setTrimBox(0, 0, width, height);
  page.setBleedBox(0, 0, width, height);
  page.setArtBox(0, 0, width, height);
  page.resetPosition(); // New page furniture is OUTSIDE the source transform/clip.
  return { scale: s, width, height };
}

function transformAnnotations(page: PDFPage, matrix: Matrix) {
  const annots = page.node.Annots();
  if (!annots) return;
  const ctx = page.doc.context;
  const points = (values: PDFArray) => {
    const result: number[] = [];
    for (let i = 0; i + 1 < values.size(); i += 2) {
      result.push(...transformPoint(matrix, values.lookup(i, PDFNumber).asNumber(), values.lookup(i + 1, PDFNumber).asNumber()));
    }
    return result;
  };
  for (let i = 0; i < annots.size(); i++) {
    const annot = annots.lookup(i, PDFDict);
    const rect = annot.lookupMaybe(PDFName.of("Rect"), PDFArray);
    if (rect?.size() === 4) {
      const [x1, y1, x2, y2] = [0, 1, 2, 3].map(n => rect.lookup(n, PDFNumber).asNumber());
      const corners = [transformPoint(matrix, x1, y1), transformPoint(matrix, x2, y2), transformPoint(matrix, x1, y2), transformPoint(matrix, x2, y1)];
      annot.set(PDFName.of("Rect"), ctx.obj([Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])), Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))]));
    }
    for (const key of ["QuadPoints", "Vertices", "L", "CL"]) {
      const value = annot.lookupMaybe(PDFName.of(key), PDFArray);
      if (value) annot.set(PDFName.of(key), ctx.obj(points(value)));
    }
    const ink = annot.lookupMaybe(PDFName.of("InkList"), PDFArray);
    if (ink) annot.set(PDFName.of("InkList"), ctx.obj(Array.from({ length: ink.size() }, (_, k) => points(ink.lookup(k, PDFArray)))));
  }
}

interface Fonts { regular: PDFFont; bold: PDFFont }
interface IndexRow { fileName: string; label: string; detail: string; count: number }
interface PlannedRow { index: number; label: string[]; detail: string[]; height: number }
interface IndexPlan {
  left: number; right: number; colText: number; colPage: number;
  titleLines: string[]; subtitleLines: string[];
  sheets: { top: number; rows: PlannedRow[] }[];
}
const LEADING = 21;
const BOTTOM = 108;

function planIndex(bundle: Bundle, rows: IndexRow[], fonts: Fonts, mixed: boolean): IndexPlan {
  // Delhi's A4 direction: 4 cm left/right; 2 cm top/bottom.
  // This applies to GENERATED index text, not a claim about reproduced exhibits.
  const margin = bundle.court === "DELHI_HIGH_COURT" ? 4 * 72 / 2.54 : 85;
  const left = margin, right = A4[0] - margin;
  const colText = left + 35, colPage = right - 53;
  const width = colPage - colText - 16;
  const heading = mixed ? "DOCUMENT COMPILATION" : (bundle.courtName || "FILING DOCUMENTS").toUpperCase();
  const titleLines = wrap(heading, fonts.bold, 14, right - left);
  const subtitle = mixed ? "For review before filing" : [bundle.caseNumber, bundle.title].filter(Boolean).join("\n");
  const subtitleLines = subtitle.split("\n").flatMap(line => wrap(line, fonts.regular, 14, right - left));
  const firstTop = A4[1] - 83 - (titleLines.length + subtitleLines.length) * LEADING - 62;
  const continuationTop = A4[1] - 120;
  if (firstTop < BOTTOM + 100) throw new Error("The filing title is too long for an index heading. Shorten the filing title and try again.");
  const sheets: IndexPlan["sheets"] = [{ top: firstTop, rows: [] }];
  let remaining = firstTop - 40 - BOTTOM;
  rows.forEach((row, index) => {
    const label = wrap(row.label, fonts.bold, 14, width);
    const detail = row.detail ? wrap(row.detail, fonts.regular, 14, width) : [];
    const height = Math.max(40, (label.length + detail.length) * LEADING + 12);
    if (height > continuationTop - 40 - BOTTOM) throw new Error("An index entry is too long to fit on one page: " + row.fileName);
    if (height > remaining) {
      if (sheets.length === 1 && sheets[0].rows.length === 0) throw new Error("The filing heading and first index entry do not fit together. Shorten the filing title before exporting.");
      sheets.push({ top: continuationTop, rows: [] });
      remaining = continuationTop - 40 - BOTTOM;
    }
    sheets[sheets.length - 1].rows.push({ index, label, detail, height });
    remaining -= height;
  });
  return { left, right, colText, colPage, titleLines, subtitleLines, sheets };
}

function drawIndex(out: PDFDocument, plan: IndexPlan, contents: RepairContents[], fonts: Fonts, mixed: boolean) {
  for (const [i, sheet] of plan.sheets.entries()) {
    const page = out.getPage(i);
    let y = A4[1] - 83;
    if (!i) {
      for (const line of plan.titleLines) { center(page, line, fonts.bold, 14, y, plan.left, plan.right); y -= LEADING; }
      y -= 5;
      for (const line of plan.subtitleLines) { center(page, line, fonts.regular, 14, y, plan.left, plan.right); y -= LEADING; }
      y -= 22;
      center(page, "INDEX OF DOCUMENTS", fonts.bold, 16, y, plan.left, plan.right);
    } else center(page, "INDEX OF DOCUMENTS (continued)", fonts.bold, 14, y, plan.left, plan.right);
    y = sheet.top;
    const line = (at: number, weight = 0.6) => page.drawLine({ start: { x: plan.left, y: at }, end: { x: plan.right, y: at }, thickness: weight, color: RULE });
    line(y, 0.8);
    page.drawText("No.", { x: plan.left + 5, y: y - 23, size: 12, font: fonts.bold, color: INK });
    page.drawText("Particulars of document", { x: plan.colText + 4, y: y - 23, size: 14, font: fonts.bold, color: INK });
    page.drawText("Pages", { x: plan.colPage + 6, y: y - 23, size: 12, font: fonts.bold, color: INK });
    y -= 39;
    line(y);
    const tableTop = sheet.top;
    for (const row of sheet.rows) {
      const item = contents[row.index];
      const top = y;
      page.drawText(String(row.index + 1), { x: plan.left + 8, y: y - 25, size: 14, font: fonts.regular, color: INK });
      let ty = y - 25;
      for (const text of row.label) { page.drawText(text, { x: plan.colText + 4, y: ty, size: 14, font: fonts.bold, color: INK }); ty -= LEADING; }
      for (const text of row.detail) { page.drawText(text, { x: plan.colText + 4, y: ty, size: 14, font: fonts.regular, color: INK }); ty -= LEADING; }
      const range = item.from === item.to ? String(item.from) : item.from + "–" + item.to;
      const size = fonts.regular.widthOfTextAtSize(range, 13) > 45 ? 11 : 13;
      page.drawText(range, { x: plan.right - 6 - fonts.regular.widthOfTextAtSize(range, size), y: y - 25, size, font: fonts.regular, color: INK });
      y -= row.height;
      line(y);
      const link = out.context.register(out.context.obj({
        Type: "Annot", Subtype: "Link", Rect: [plan.left, y, plan.right, top], Border: [0, 0, 0],
        Dest: [out.getPage(item.from - 1).ref, PDFName.of("Fit")],
      }));
      page.node.addAnnot(link);
    }
    for (const x of [plan.left, plan.colText, plan.colPage, plan.right]) page.drawLine({ start: { x, y: tableTop }, end: { x, y }, thickness: 0.6, color: RULE });
    const note = mixed ? "Review copy: confirm the relevance of each case and complete any prescribed forms before filing."
      : "Page references include the index and match the PDF page positions.";
    let fy = 79;
    for (const text of wrap(note, fonts.regular, 11, plan.right - plan.left)) {
      page.drawText(text, { x: plan.left, y: fy, size: 11, font: fonts.regular, color: MUTED }); fy -= 14;
    }
  }
}

function drawPageNumber(page: PDFPage, n: number, total: number, context: string, font: PDFFont) {
  const { width, height } = page.getSize();
  page.drawText(context, { x: 32, y: height - 30, size: 9, font, color: MUTED });
  const text = "Page " + n + " of " + total;
  page.drawText(text, { x: width - 32 - font.widthOfTextAtSize(text, 11), y: height - 30, size: 11, font, color: INK });
  page.drawLine({ start: { x: 32, y: height - 40 }, end: { x: width - 32, y: height - 40 }, thickness: 0.45, color: RULE });
}

function addNavigation(doc: PDFDocument, contents: RepairContents[], indexPages: number) {
  const entries = [
    ...(indexPages ? [{ title: "Index of documents", page: 0 }] : []),
    ...contents.map((c, i) => ({ title: String(i + 1).padStart(2, "0") + ". " + c.label + " | " + c.fileName, page: c.from - 1 })),
  ];
  const ctx = doc.context;
  const root = ctx.register(ctx.obj({ Type: "Outlines" }));
  const refs = entries.map(() => ctx.nextRef());
  entries.forEach((entry, i) => {
    ctx.assign(refs[i], ctx.obj({
      Title: PDFHexString.fromText(entry.title), Parent: root,
      Dest: [doc.getPage(entry.page).ref, PDFName.of("Fit")],
      ...(i ? { Prev: refs[i - 1] } : {}), ...(i + 1 < refs.length ? { Next: refs[i + 1] } : {}),
    }));
  });
  const outline = ctx.lookup(root, PDFDict);
  outline.set(PDFName.of("First"), refs[0]);
  outline.set(PDFName.of("Last"), refs[refs.length - 1]);
  outline.set(PDFName.of("Count"), PDFNumber.of(refs.length));
  doc.catalog.set(PDFName.of("Outlines"), root);
  doc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
  doc.catalog.set(PDFName.of("PageLabels"), ctx.obj({ Nums: [0, { S: "D", St: 1 }] }));
}

function center(page: PDFPage, text: string, font: PDFFont, size: number, y: number, left: number, right: number) {
  page.drawText(text, { x: left + (right - left - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color: INK });
}

/** Wrap by measured glyph width, including long unbroken names. Never truncate. */
function wrap(value: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const text = value.replace(/[\u00a0\u2007\u202f]/g, " ").replace(/[\u2010\u2011\u2212]/g, "-").trim();
  try { font.encodeText(text); } catch {
    throw new Error("The index contains text not supported by its print font. Use a Latin-script filing title or document label for this export; original document text is preserved.");
  }
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const joined = line ? line + " " + word : word;
    if (font.widthOfTextAtSize(joined, size) <= maxWidth) { line = joined; continue; }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) { lines.push(line); line = ""; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}
