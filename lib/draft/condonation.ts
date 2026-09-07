import PDFDocument from "pdfkit";
import type { Bundle, LimitationResult } from "../types";
import { COURTS, DOC_KIND_LABEL } from "../types";
import { caseTypeById } from "../rulebook";

/**
 * The application under s.5 of the Limitation Act.
 *
 * When PARAM says a filing is out of time it owes the advocate more than the
 * bad news. Courts do not condone delay on a general explanation — the settled
 * requirement is that EVERY DAY of the delay be accounted for. That is the part
 * juniors get sent back on, and it is mechanical: the days are known, the
 * computation is already on the memo.
 *
 * So this generates the application with the day-by-day chart already built and
 * the limitation working reproduced as an annexure, leaving the advocate the
 * one thing only they can supply: the reason. Those lines are left as visible
 * blanks rather than filled with plausible-sounding text — a fabricated cause
 * in a sworn application is not a shortcut, it is a false statement to a court.
 */

const CM = 72 / 2.54;

export interface CondonationInput {
  bundle: Bundle;
  limitation: LimitationResult;
  /** Optional, supplied by the advocate; blanks are left where absent. */
  reason?: string;
}

export function draftCondonationApplication({
  bundle,
  limitation,
  reason,
}: CondonationInput): Promise<Buffer> {
  if (!limitation.computed || !limitation.barred)
    return Promise.reject(
      new Error(
        "No condonation application is needed: on the dates supplied the filing is within time."
      )
    );
  if (limitation.condonationAvailable === false)
    return Promise.reject(
      new Error(
        `Condonation is not available here. ${limitation.condonationNote ?? ""} Drafting a s.5 application would be the wrong remedy.`
      )
    );

  const court = COURTS.find((c) => c.id === bundle.court);
  const ct = caseTypeById(bundle.caseTypeId);
  const days = limitation.daysOverdue ?? 0;

  const doc = new PDFDocument({ size: "A4", margins: { top: 2.6 * CM, bottom: 2.2 * CM, left: 4 * CM, right: 2.2 * CM } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  const H = (t: string) => doc.font("Helvetica-Bold").fontSize(11).text(t, { align: "center" });
  const P = (t: string, opts: PDFKit.Mixins.TextOptions = {}) =>
    doc.font("Helvetica").fontSize(10.5).text(t, { align: "justify", lineGap: 3, ...opts });
  const gap = (n = 10) => doc.moveDown(n / 12);

  // ── Cause title ──────────────────────────────────────────────────────────
  H(`IN THE ${(court?.name ?? bundle.court).toUpperCase()}`);
  gap();
  H(`${ct?.name ?? bundle.caseTypeId} NO. ______ OF ${new Date().getFullYear()}`);
  gap(16);
  P(`IN THE MATTER OF:`);
  gap();
  P(bundle.title);
  gap(18);
  H("APPLICATION UNDER SECTION 5 OF THE LIMITATION ACT, 1963");
  H(`FOR CONDONATION OF DELAY OF ${days} DAY${days === 1 ? "" : "S"}`);
  gap(18);

  P("MOST RESPECTFULLY SHEWETH:");
  gap(12);

  // ── The computation, stated as the court will want it ────────────────────
  let n = 1;
  P(
    `${n++}. That the impugned order was pronounced on ${fmt(bundle.dates.pronouncedOn)}. The present ${ct?.name ?? "proceeding"} is accompanied by this application, the filing being beyond the prescribed period.`
  );
  gap();

  if (bundle.dates.copyAppliedOn && bundle.dates.copyReadyOn) {
    P(
      `${n++}. That the certified copy of the impugned order was applied for on ${fmt(bundle.dates.copyAppliedOn)} and was ready on ${fmt(bundle.dates.copyReadyOn)}. The time requisite for obtaining the said copy stands excluded under Section 12(2) of the Limitation Act, 1963.`
    );
    gap();
  }

  P(
    `${n++}. That after allowing every exclusion available on the record, the period of limitation expired on ${fmt(limitation.dueOn)}. The filing is therefore delayed by ${days} day${days === 1 ? "" : "s"}. The step-by-step computation is set out in the Schedule below.`
  );
  gap();

  // ── The reason: the advocate's to give ───────────────────────────────────
  P(
    `${n++}. That the said delay of ${days} day${days === 1 ? "" : "s"} occurred in the following circumstances:`
  );
  gap();
  if (reason?.trim()) {
    P(reason.trim(), { indent: 18 });
  } else {
    doc.font("Helvetica-Oblique").fontSize(9.5).fillColor("#8a6d1f");
    doc.text(
      "[ To be completed by counsel. Every one of the days above must be explained; a general averment of illness, of papers being awaited, or of the file being with a colleague is routinely refused. State what happened on which dates. PARAM does not draft this paragraph, because a cause stated on affidavit must be true. ]",
      { align: "justify", indent: 18, lineGap: 2 }
    );
    doc.fillColor("black");
    gap();
    for (let i = 0; i < 4; i++) {
      doc.font("Helvetica").fontSize(10.5).text("_".repeat(72), { indent: 18 });
      gap(6);
    }
  }
  gap();

  P(
    `${n++}. That the delay is neither wilful nor deliberate, and has occasioned no prejudice to the opposite party which cannot be compensated.`
  );
  gap();
  P(
    `${n++}. That the Applicant has a good case on merits and will suffer irreparable loss if the delay is not condoned.`
  );
  gap(16);

  P("PRAYER");
  gap();
  P(
    `It is therefore most respectfully prayed that this Hon'ble Court may be pleased to condone the delay of ${days} day${days === 1 ? "" : "s"} in filing the accompanying ${ct?.name ?? "proceeding"}, and pass such further orders as this Hon'ble Court may deem fit.`
  );
  gap(24);
  doc.font("Helvetica").fontSize(10.5).text("APPLICANT", { align: "right" });
  gap();
  doc.text("THROUGH COUNSEL", { align: "right" });

  // ── Schedule: the day-by-day account ─────────────────────────────────────
  doc.addPage();
  H("SCHEDULE — COMPUTATION OF LIMITATION");
  gap(14);
  P(
    "The following is the computation on which the delay of " +
      `${days} day${days === 1 ? "" : "s"} is arrived at. Each step names the provision applied.`
  );
  gap(14);

  for (const step of limitation.steps) {
    doc.font("Helvetica-Bold").fontSize(10).text(step.label);
    if (step.provision)
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#4a5a6e").text(step.provision);
    doc.fillColor("black").font("Helvetica").fontSize(9.5).text(step.detail, {
      align: "justify",
      lineGap: 2,
    });
    if (step.runningDate)
      doc.font("Helvetica-Bold").fontSize(9.5).text(`→ ${fmt(step.runningDate)}`);
    gap(12);
  }

  gap(10);
  doc.font("Helvetica-Bold").fontSize(10).text("DAYS TO BE EXPLAINED");
  doc.font("Helvetica").fontSize(9.5).text(
    `From ${fmt(limitation.dueOn)} (expiry of limitation) to ${fmt(bundle.dates.filingOn)} (intended filing): ${days} day${days === 1 ? "" : "s"}. Counsel must account for each of these days in paragraph 4 above.`,
    { align: "justify", lineGap: 2 }
  );

  gap(18);
  doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#4a5a6e").text(
    "Generated by PARAM from the dates on record. This is a working draft for counsel to settle, not a filed document, and not legal advice. Verify the computation and every averment before signature.",
    { align: "justify" }
  );

  // ── Bundle inventory, so the application travels with its context ────────
  gap(16);
  doc.fillColor("black").font("Helvetica-Bold").fontSize(10).text("DOCUMENTS ON RECORD");
  gap(8);
  for (const d of bundle.documents) {
    doc.font("Helvetica").fontSize(9).text(
      `• ${DOC_KIND_LABEL[d.kind]}${d.annexureMark ? ` ${d.annexureMark}` : ""} — ${d.fileName} (${d.pageCount} pp)`
    );
  }

  doc.end();
  return done;
}

/** Indian courts write dates as 08.09.2026. */
function fmt(iso?: string): string {
  if (!iso) return "____________";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
