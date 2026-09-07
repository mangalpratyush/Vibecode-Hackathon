// Extract text PAGE-WISE from an uploaded file buffer.
// PDF: pdfjs-dist (robust, line-aware) with pdf-parse fallback (single page).
// TXT/CSV/MD/JSON: one logical page per ~3500 words.
// DOCX/XLSX/scanned PDFs: empty result, the record is still created, marked
// "OCR / manual entry required", and the promoter can paste text or enter
// facts manually. Never crash on unreadable files.

/* eslint-disable @typescript-eslint/no-require-imports */

export interface FileText {
  pages: string[]; // page-wise text; empty array => unreadable
  text: string;    // full concatenated text
}

interface TextItem { str: string; hasEOL?: boolean }

async function pdfPagesViaPdfjs(buf: Buffer): Promise<string[]> {
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let text = "";
    for (const item of tc.items as TextItem[]) {
      text += item.str;
      text += item.hasEOL ? "\n" : " ";
    }
    pages.push(text);
  }
  return pages;
}

async function pdfTextViaPdfParse(buf: Buffer): Promise<string> {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer) => Promise<{ text: string }>;
  const res = await pdfParse(buf);
  return res.text ?? "";
}

export async function readFileText(fileName: string, buf: Buffer): Promise<FileText> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  try {
    if (ext === "pdf") {
      try {
        const pages = await pdfPagesViaPdfjs(buf);
        return { pages, text: pages.join("\n") };
      } catch {
        const text = await pdfTextViaPdfParse(buf);
        return { pages: text.trim() ? [text] : [], text };
      }
    }
    if (["txt", "csv", "md", "json"].includes(ext)) {
      const text = buf.toString("utf-8");
      // split long text files into pseudo-pages so chunking & page refs work
      const words = text.split(/\s+/);
      if (words.length <= 3500) return { pages: [text], text };
      const pages: string[] = [];
      for (let i = 0; i < words.length; i += 3500) pages.push(words.slice(i, i + 3500).join(" "));
      return { pages, text };
    }
  } catch {
    // unreadable file is a valid state, not an error
  }
  return { pages: [], text: "" };
}
