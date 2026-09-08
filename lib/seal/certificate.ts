import PDFDocument from "pdfkit";
import type { Seal } from "./seal";

/**
 * The seal, as a page you can put in the file.
 *
 * A hash in a browser tab proves nothing to the person you hand the bundle to.
 * This is the same manifest rendered as a certificate that travels with the
 * filing, carrying every document hash so anyone holding the bundle can check
 * it against /verify without needing an account here.
 *
 * The disclaimer at the foot is not boilerplate and is not small print. This is
 * an integrity seal, not a digital signature under the IT Act, and saying so on
 * the artefact itself is the difference between a useful record and a document
 * that misleads a court.
 */

const CM = 72 / 2.54;

export function sealCertificate(seal: Seal): Promise<Buffer> {
  const { manifest } = seal;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 2.4 * CM, bottom: 2 * CM, left: 2.6 * CM, right: 2.6 * CM },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  const INK = "#241f1e";
  const SOFT = "#6b615c";
  const BRAND = "#7b2832";

  // ── Masthead ─────────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor(BRAND);
  doc.text("PARAM", { characterSpacing: 3 });
  doc.font("Helvetica").fontSize(7.5).fillColor(SOFT);
  doc.text("PRE ASSESSMENT REGISTRY AND AUDIT MITRA", { characterSpacing: 1.4 });

  doc.moveDown(1.6);
  doc.font("Times-Bold").fontSize(21).fillColor(INK);
  doc.text("Filing Integrity Seal");
  doc.moveDown(0.35);
  doc.font("Helvetica").fontSize(9.5).fillColor(SOFT);
  doc.text(
    "This record fixes the contents of a filing bundle at the moment PARAM scrutinised it. " +
      "Any later change to any page of any document below will fail verification."
  );

  rule(doc, INK);

  // ── The matter ───────────────────────────────────────────────────────────
  field(doc, "Bundle", manifest.title);
  field(doc, "Court", pretty(manifest.court));
  field(doc, "Case type", manifest.caseType);
  field(doc, "Sealed at", isoToIst(manifest.sealedAt));
  field(
    doc,
    "Checked against",
    `PARAM rulebook ${manifest.rulebook.version}, ${manifest.rulebook.verifiedRules} verified rules`
  );

  rule(doc, "#e7ded3");

  // ── What the scrutiny found ──────────────────────────────────────────────
  const s = manifest.scrutiny;
  heading(doc, "Scrutiny at the time of sealing", INK);
  field(doc, "Verdict", `${s.verdict.replace(/_/g, " ")} · score ${s.score}/100`);
  field(
    doc,
    "Findings",
    `${s.fatal} fatal, ${s.objections} objections, ${s.advisories} advisory, ${s.passed} passed, ${s.notChecked} not checked`
  );
  field(doc, "Limitation", s.limitation);

  rule(doc, "#e7ded3");

  // ── Documents ────────────────────────────────────────────────────────────
  heading(doc, `Documents sealed (${manifest.documents.length})`, INK);
  doc.moveDown(0.2);

  for (const d of manifest.documents) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK);
    doc.text(`${d.fileName}`, { continued: true });
    doc.font("Helvetica").fontSize(8.5).fillColor(SOFT);
    doc.text(`   ${d.kind.replace(/_/g, " ").toLowerCase()} · ${d.pages} pp · ${fmtBytes(d.bytes)}`);
    doc.font("Courier").fontSize(7.6).fillColor("#4a423e");
    doc.text(`sha256  ${d.sha256}`);
    doc.moveDown(0.45);
  }

  rule(doc, "#e7ded3");

  // ── The seal itself ──────────────────────────────────────────────────────
  heading(doc, "Seal", INK);
  doc.font("Helvetica").fontSize(8.5).fillColor(SOFT);
  doc.text("Bundle digest (sha256 over the ordered document hashes)");
  doc.font("Courier").fontSize(7.6).fillColor(INK);
  doc.text(manifest.bundleDigest);
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(8.5).fillColor(SOFT);
  doc.text(`Seal (${seal.algorithm} over the canonical manifest)`);
  doc.font("Courier").fontSize(7.6).fillColor(BRAND);
  doc.text(seal.seal);

  doc.moveDown(1.1);
  doc.font("Helvetica").fontSize(9).fillColor(INK);
  doc.text(
    "To verify: open the PARAM verification page, upload this certificate's manifest together with the bundle, and PARAM will re-hash every document and re-check the seal."
  );

  // ── The disclaimer that keeps this honest ────────────────────────────────
  doc.moveDown(1.4);
  doc.rect(doc.x - 8, doc.y - 6, 460, 52).fillAndStroke("#faf7f2", "#e7ded3");
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5);
  doc.text("This is an integrity seal, not a digital signature.", doc.x, doc.y + 2);
  doc.font("Helvetica").fontSize(8).fillColor(SOFT);
  doc.text(
    "It is not a digital signature or electronic signature under the Information Technology Act, 2000, " +
      "is not issued against a certificate from a licensed Certifying Authority, and does not replace a DSC " +
      "or Aadhaar eSign where one is required. It evidences only that these bytes are the bytes PARAM saw."
  );

  doc.end();
  return done;
}

function rule(doc: PDFKit.PDFDocument, colour: string) {
  doc.moveDown(0.8);
  const y = doc.y;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.7)
    .strokeColor(colour)
    .stroke();
  doc.moveDown(0.8);
}

function heading(doc: PDFKit.PDFDocument, text: string, colour: string) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor(colour);
  doc.text(text.toUpperCase(), { characterSpacing: 1.2 });
  doc.moveDown(0.5);
}

function field(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font("Helvetica").fontSize(8).fillColor("#6b615c");
  doc.text(label, { continued: false });
  doc.font("Helvetica").fontSize(10).fillColor("#241f1e");
  doc.text(value);
  doc.moveDown(0.42);
}

const pretty = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const fmtBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Courts here run on IST, so show IST and say so. */
function isoToIst(iso: string): string {
  const d = new Date(iso);
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(ist.getUTCDate())}.${p(ist.getUTCMonth() + 1)}.${ist.getUTCFullYear()} at ${p(ist.getUTCHours())}:${p(ist.getUTCMinutes())} IST`;
}
