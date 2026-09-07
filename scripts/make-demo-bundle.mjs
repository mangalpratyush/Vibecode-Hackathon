import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

/**
 * Builds a realistic SLP bundle with defects planted on purpose, so PARAM can
 * be demonstrated against files anyone can open and verify.
 *
 * Every defect below is one PARAM claims to catch. The point of the demo is
 * that a sceptic can open the PDF, go to the page PARAM names, and see it.
 *
 *   1. Annexure P-7 is relied on at two places in the petition and is not filed
 *   2. Annexure P-9 is filed and never referred to anywhere
 *   3. The petition's printed pagination skips 6 and repeats 9
 *   4. Four pages carry a left margin of ~1.6 cm against the 4 cm rule
 *   5. The impugned order has pages in Devanagari with no translation filed
 *   6. The vakalatnama carries no welfare-stamp endorsement
 *   7. The affidavit carries no attestation clause
 *   8. There is no listing proforma and no memo of parties in the bundle
 *   9. The dates are the interesting part. On the face of it the filing is 13
 *      days out of time, which is what every dropdown limitation calculator
 *      will tell you. Read the certified copy's own endorsement, exclude the
 *      18 days requisite for obtaining it under s.12(2), and notice that the
 *      resulting expiry falls on a Sunday under s.4 — and the advocate in fact
 *      has until Monday 14.09.2026, six clear days
 *
 *   node scripts/make-demo-bundle.mjs
 */

const OUT = path.join(process.cwd(), "demo-bundle");
const CM = 72 / 2.54;

const DEVANAGARI_FONT = [
  "C:/Windows/Fonts/Nirmala.ttf",
  "/usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf",
  "/System/Library/Fonts/Supplemental/DevanagariMT.ttc",
].find((p) => fs.existsSync(p));

function newDoc() {
  // margin 0: every page sets its own, because the margin IS the test here.
  return new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
}

/** One page. `marginCm` is the left margin actually used, `printedNo` the number stamped on it. */
function page(doc, { marginCm = 4, printedNo = null, heading = null, body = [], devanagari = false }) {
  doc.addPage();
  const left = marginCm * CM;
  const right = doc.page.width - 2.2 * CM;
  const width = right - left;
  let y = 2.6 * CM;

  if (heading) {
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000");
    doc.text(heading, left, y, { width, align: "center" });
    y = doc.y + 14;
  }

  for (const para of body) {
    if (devanagari && DEVANAGARI_FONT) doc.font(DEVANAGARI_FONT).fontSize(11);
    else doc.font("Helvetica").fontSize(10.5);
    doc.fillColor("#111").text(para, left, y, { width, align: "justify", lineGap: 3.5 });
    y = doc.y + 10;
  }

  if (printedNo !== null) {
    doc.font("Helvetica").fontSize(10).fillColor("#000");
    doc.text(String(printedNo), 0, doc.page.height - 1.5 * CM, {
      width: doc.page.width,
      align: "center",
    });
  }
}

function write(name, build) {
  const doc = newDoc();
  const out = fs.createWriteStream(path.join(OUT, name));
  const done = new Promise((res) => out.on("finish", res));
  doc.pipe(out);
  build(doc);
  doc.end();
  return done.then(() => console.log("  " + name));
}

const LOREM = (n) =>
  Array.from(
    { length: n },
    () =>
      "That the Petitioner respectfully submits that the findings recorded by the learned Single Judge proceed on a misreading of the record, and that the conclusions drawn therefrom are unsustainable in law. The Petitioner had at all material times acted in accordance with the terms of the agreement dated 14.02.2023, and the contrary finding is not borne out by the evidence on record."
  );

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log("Writing demo bundle to " + OUT);

  // ── The petition: broken pagination, narrow margins, a dead annexure ref ──
  await write("SLP Petition.pdf", (doc) => {
    page(doc, {
      printedNo: 1,
      heading: "IN THE SUPREME COURT OF INDIA\nCIVIL APPELLATE JURISDICTION\n\nSPECIAL LEAVE PETITION (CIVIL) NO. ______ OF 2026",
      body: [
        "IN THE MATTER OF:",
        "Rajesh Sharma ... Petitioner",
        "VERSUS",
        "State of NCT of Delhi & Anr. ... Respondents",
        "",
        "SPECIAL LEAVE PETITION UNDER ARTICLE 136 OF THE CONSTITUTION OF INDIA AGAINST THE FINAL JUDGMENT AND ORDER DATED 28.05.2026 PASSED BY THE HON'BLE HIGH COURT OF DELHI IN W.P.(C) NO. 4471 OF 2025.",
      ],
    });
    page(doc, {
      printedNo: 2,
      heading: "SYNOPSIS",
      body: [
        "The present petition arises out of the judgment dated 28.05.2026. A true copy of the impugned judgment is annexed hereto and marked as Annexure P-1.",
        "The Petitioner had preferred a representation before the competent authority, a copy whereof is annexed as Annexure P-2.",
        ...LOREM(1),
      ],
    });
    page(doc, { printedNo: 3, heading: "LIST OF DATES", body: LOREM(2) });
    page(doc, { printedNo: 4, body: LOREM(3) });
    // Narrow margin begins here — four consecutive pages at ~1.6 cm.
    page(doc, { printedNo: 5, marginCm: 1.6, body: LOREM(3) });
    // Pagination jumps 5 -> 7, skipping 6.
    page(doc, {
      printedNo: 7,
      marginCm: 1.6,
      body: [
        "The Petitioner placed on record the inspection report of the said authority, which is annexed hereto and marked as Annexure P-7, and which was not considered by the High Court at all.",
        ...LOREM(2),
      ],
    });
    page(doc, { printedNo: 8, marginCm: 1.6, body: LOREM(3) });
    page(doc, { printedNo: 9, marginCm: 1.6, body: LOREM(3) });
    // …and repeats 9.
    page(doc, {
      printedNo: 9,
      body: [
        "It is further submitted that the contents of Annexure P-7 squarely establish the Petitioner's case, and the failure to consider the same has occasioned a failure of justice.",
        ...LOREM(1),
      ],
    });
    page(doc, {
      printedNo: 10,
      heading: "PRAYER",
      body: [
        "It is therefore most respectfully prayed that this Hon'ble Court may be pleased to grant special leave to appeal against the judgment and order dated 28.05.2026 passed by the Hon'ble High Court of Delhi in W.P.(C) No. 4471 of 2025.",
        "",
        "Drawn and filed by:",
        "Sd/-",
        "ADVOCATE FOR THE PETITIONER",
      ],
    });
  });

  // ── Annexures: P-1 and P-2 cited and filed; P-9 filed but never cited ────
  await write("Annexure P-1.pdf", (doc) => {
    page(doc, {
      printedNo: 11,
      heading: "ANNEXURE P-1\n\nTRUE COPY OF THE IMPUGNED JUDGMENT DATED 28.05.2026",
      body: LOREM(3),
    });
    page(doc, { printedNo: 12, body: LOREM(3) });
  });

  await write("Annexure P-2.pdf", (doc) => {
    page(doc, {
      printedNo: 13,
      heading: "ANNEXURE P-2\n\nTRUE COPY OF THE REPRESENTATION DATED 04.04.2025",
      body: LOREM(2),
    });
  });

  await write("Annexure P-9.pdf", (doc) => {
    page(doc, {
      printedNo: 14,
      heading: "ANNEXURE P-9\n\nTRUE COPY OF THE CORRESPONDENCE DATED 19.08.2025",
      body: LOREM(2),
    });
  });

  // ── Impugned order with untranslated Devanagari pages ────────────────────
  await write("Certified Copy of Impugned Order.pdf", (doc) => {
    page(doc, {
      printedNo: 15,
      heading: "IN THE HIGH COURT OF DELHI AT NEW DELHI\n\nW.P.(C) NO. 4471 OF 2025",
      body: [
        "Certified to be a true copy.",
        "Date of application for copy: 05.06.2026",
        "Date on which copy was ready: 23.06.2026",
        "Date of delivery: 23.06.2026",
        "",
        "CORAM: HON'BLE MR. JUSTICE A. K. MEHTA",
        "Pronounced on: 28.05.2026",
        ...LOREM(1),
      ],
    });
    page(doc, {
      printedNo: 16,
      devanagari: true,
      heading: DEVANAGARI_FONT ? null : "ANNEXURE — VERNACULAR STATEMENT",
      body: DEVANAGARI_FONT
        ? [
            "प्रतिवादी द्वारा दिनांक 14.02.2023 को प्रस्तुत किया गया शपथ पत्र इस न्यायालय के समक्ष रखा गया। उक्त शपथ पत्र में यह कहा गया है कि याचिकाकर्ता ने समझौते की शर्तों का पालन नहीं किया।",
            "उपरोक्त तथ्यों के आधार पर यह न्यायालय इस निष्कर्ष पर पहुँचता है कि याचिका में कोई सार नहीं है और तदनुसार याचिका खारिज की जाती है।",
          ]
        : ["[Devanagari font not found on this machine; this page would carry the vernacular record.]"],
    });
  });

  // ── Vakalatnama with no welfare stamp endorsement ────────────────────────
  await write("Vakalatnama.pdf", (doc) => {
    page(doc, {
      printedNo: 17,
      heading: "VAKALATNAMA",
      body: [
        "I, Rajesh Sharma, the Petitioner above named, do hereby appoint and retain Shri A. Verma, Advocate-on-Record, to act, appear and plead for me in the above matter.",
        "",
        "Dated this 05th day of September 2026.",
        "Sd/- Petitioner",
        "ACCEPTED. Sd/- ADVOCATE ON RECORD",
      ],
    });
  });

  // ── Affidavit with no attestation clause ─────────────────────────────────
  await write("Affidavit.pdf", (doc) => {
    page(doc, {
      printedNo: 18,
      heading: "AFFIDAVIT",
      body: [
        "I, Rajesh Sharma, aged about 42 years, resident of New Delhi, do state as follows:",
        "1. That I am the Petitioner in the accompanying special leave petition and am fully conversant with the facts of the case.",
        "2. That the contents of the accompanying petition are true and correct to my knowledge.",
        "",
        "Sd/- Petitioner",
      ],
    });
  });

  console.log("\nPlanted defects:");
  console.log("  Annexure P-7 relied on at pages 6 and 9, not filed");
  console.log("  Annexure P-9 filed, never referred to");
  console.log("  Pagination skips 6, repeats 9");
  console.log("  Four pages at ~1.6 cm left margin (rule: 4 cm)");
  console.log("  Vernacular pages with no English translation filed");
  console.log("  No welfare stamp on the vakalatnama, no attestation on the affidavit");
  console.log("  No memo of parties, no listing proforma");
  console.log("\nSuggested dates for the scrutiny form:");
  console.log("  Impugned order pronounced   2026-05-28");
  console.log("  Certified copy applied for  2026-06-05");
  console.log("  Certified copy ready        2026-06-23");
  console.log("  Intended date of filing     2026-09-08");
  console.log("");
  console.log("  Naive computation (90 days from 28.05):  expired 26.08.2026, barred by 13 days");
  console.log("  With s.12(2) + s.4:                      expires 14.09.2026, 6 days in hand");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
