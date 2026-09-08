import { ChevronRight, ExternalLink, FileText, Wrench } from "lucide-react";
import type { Defect } from "@/lib/types";

const levels = {
  FATAL: { label: "Fatal", tone: "fatal" },
  REGISTRY_OBJECTION: { label: "Objection", tone: "objection" },
  ADVISORY: { label: "Advisory", tone: "advisory" },
};

export default function DefectCard({ defect, documentName, index = 1 }: {
  defect: Defect; documentName?: string; index?: number;
}) {
  const severity = levels[defect.severity];
  return (
    <article className="audit-finding">
      <div className="audit-finding-heading">
        <span className="audit-finding-index">{String(index).padStart(2, "0")}</span>
        <h3>{defect.title}</h3>
        <span className="audit-badge" data-tone={severity.tone}>{severity.label}</span>
      </div>
      <div className="audit-finding-meta">
        <FileText /> <span>{documentName ?? "Bundle-wide check"}{defect.pageNo ? " · Page " + defect.pageNo : ""}</span>
        {defect.aiAssisted && <span className="audit-badge" data-tone="advisory">AI-assisted · verify</span>}
      </div>
      <p className="audit-finding-detail">{defect.detail}</p>
      {defect.fix && <div className="audit-finding-action"><Wrench /><div><strong>{defect.fix.auto ? "Repair guidance. " : "Next action. "}</strong>{defect.fix.guidance}</div></div>}
      <details className="audit-source">
        <summary><ChevronRight />View Registry wording &amp; authority <span style={{ color: "#8a8074", fontWeight: 400 }}>· {defect.ruleId}</span></summary>
        <blockquote>{defect.registryWording}</blockquote>
        <a href={defect.sourceUrl} target="_blank" rel="noreferrer">{defect.source}<ExternalLink size={12} /></a>
      </details>
    </article>
  );
}
