import type { Bundle } from "../types";
import { classifyDocument, readAnnexureMark } from "./classify";
import { detectMatter, suggestedTitle } from "./detect";

/** Re-evaluate machine guesses after classifier upgrades; never override a human. */
export function normalizeBundle(bundle: Bundle): Bundle {
  const normalized = { ...bundle, documents: bundle.documents.map(d => {
    const kind = d.kindSource === "user" ? d.kind : classifyDocument(d.fileName, d.text).kind;
    const classification = classifyDocument(d.fileName, d.text);
    return { ...d, kind,
      ...(d.kindSource === "user" ? {} : {kindSource:classification.source,kindConfidence:classification.confidence}),
      annexureMark: kind === "ANNEXURE" ? d.annexureMark || readAnnexureMark(d.fileName,d.text) : undefined };
  }) };
  if (!(normalized.title || "").trim() || /^untitled filing$/i.test((normalized.title || "").trim())) {
    const detected = detectMatter(normalized.documents);
    normalized.title = suggestedTitle(detected) || normalized.title;
    normalized.detected = detected;
  }
  return normalized;
}
