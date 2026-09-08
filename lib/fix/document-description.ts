import type { Bundle, BundleDocument } from "../types";
import { DOC_KIND_LABEL } from "../types";
import { detectMatter } from "../docs/detect";
import { isUnfilledPrescribedForm } from "../docs/classify";

export interface DocumentDescription {
  label: string;
  detail: string;
  caseNumber?: string;
  court?: string;
  template: boolean;
  judicial: boolean;
}

const tidy = (s: string) => s.replace(/\s+/g, " ").trim();

/** Describe the document itself, not its assumed legal role in another case. */
export function describeDocument(doc: BundleDocument): DocumentDescription {
  const head = (doc.pagesText[0] || doc.text.slice(0, 7000)).slice(0, 7000);
  const detected = detectMatter([doc]);
  const court = detected.court?.value.name;
  const longNumber = head.match(/\b(?:Civil|Criminal)\s+Appeal\s+No\.?s?\.?\s*\d+\s+(?:of|\/)\s*\d{4}/i)?.[0];
  const caseNumber = longNumber ? tidy(longNumber) : detected.caseNumber?.value;
  const citation = head.match(/\b20\d{2}\s+INSC\s+\d+\b/)?.[0];
  const template = isUnfilledPrescribedForm(doc.fileName, head);
  const judgmentHeading = /^\s*J\s*U\s*D\s*G\s*M\s*E\s*N\s*T\s*$/im.test(head);
  const judicial = !template && (/^\s*CORAM\s*:|^\s*O\s+R\s+D\s+E\s+R\s*$|^\s*Reportable\s*$|this\s+is\s+a\s+digitally\s+signed\s+order/im.test(head) || judgmentHeading);
  const judgment = (judgmentHeading || /^\s*Reportable\s*$/im.test(head)) && !/judgment\s+is\s+reserved/i.test(head);
  const date = head.match(/(?:judgment\s+(?:delivered|pronounced)\s+on\s*:|O\s+R\s+D\s+E\s+R\s*%?)\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i)?.[1];
  let label = doc.kind === "ANNEXURE"
    ? "Annexure" + (doc.annexureMark ? " " + doc.annexureMark : "")
    : DOC_KIND_LABEL[doc.kind];
  if (template) label = "Prescribed SLP form (unfilled)";
  else if (judicial && doc.kindSource !== "user" && doc.kind !== "ANNEXURE" && doc.kind !== "CERTIFIED_COPY") {
    label = judgment ? "Judgment" : "Order";
    if (date) label += " dated " + date;
    else if (citation) label += " (" + tidy(citation) + ")";
  }
  if (doc.kind === "UNKNOWN" && !judicial && !template) label = "Document";
  const identity = [court, caseNumber || (template ? "Form No. 28" : citation)].filter(Boolean).join(" · ");
  // Distinguish filings without exposing long machine filenames as the primary label.
  if (!judicial && !template) {
    const qualifier = doc.fileName.match(/petitioner[ _-]*(\d+)/i)?.[1];
    if (qualifier && (doc.kind === "AFFIDAVIT" || doc.kind === "VAKALATNAMA")) label += " - Petitioner " + qualifier;
    if (doc.kind === "APPLICATION") label = doc.fileName.replace(/^\d+[_ -]*/, "").replace(/\.pdf$/i, "").replace(/_/g, " ");
  }
  const detail = doc.kind === "UNKNOWN" ? doc.fileName : (caseNumber ? identity : "");
  return { label, detail, caseNumber, court, template, judicial };
}

export interface AssemblyWarning { code: string; message: string; fileNames?: string[] }

export function reviewAssembly(bundle: Bundle, descriptions: DocumentDescription[]): AssemblyWarning[] {
  const warnings: AssemblyWarning[] = [];
  const identities = new Set(descriptions.filter(d => !d.template && d.caseNumber).map(d => (d.court || "") + "|" + d.caseNumber!.replace(/[^a-z0-9]/gi, "").toUpperCase()));
  if (identities.size > 1) warnings.push({
    code: "MULTIPLE_MATTERS",
    message: "The documents show different case numbers. Confirm which matter is being filed and which documents are supporting authorities before submission.",
  });
  const forms = bundle.documents.filter((_, i) => descriptions[i].template).map(d => d.fileName);
  if (forms.length) warnings.push({
    code: "UNFILLED_TEMPLATE",
    message: "An unfilled prescribed form is included. It is not a completed petition and must be completed or removed before filing.",
    fileNames: forms,
  });
  if (bundle.documents.length && descriptions.every(d => d.judicial || d.template)) warnings.push({
    code: "NO_COMPLETED_PLEADING",
    message: "This set contains court decisions or prescribed forms. No completed pleading has been identified; assembling these documents does not create one.",
  });
  return warnings;
}
