import { AlertTriangle, CalendarClock, ChevronDown, Scale } from "lucide-react";
import type { CaseType, FilingDates, LimitationResult } from "@/lib/types";

function dateLabel(value?: string) {
  if (!value) return "Not supplied";
  return new Date(value + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function LimitationPanel({ limitation: l, caseType, dates }: {
  limitation: LimitationResult; caseType: CaseType | null; dates?: FilingDates;
}) {
  const sourceDates = Object.entries(dates?.source ?? {}).filter(([, source]) => source === "regex" || source === "ai").length;
  return (
    <section className="audit-panel">
      <header className="audit-panel-head">
        <div className="flex items-center gap-3"><Scale size={20} color="#96713e" /><h2 className="audit-panel-title">Limitation review</h2></div>
        <span className="audit-badge" data-tone={!l.computed ? "advisory" : l.barred ? "fatal" : "pass"}>{!l.computed ? "Not computed" : l.barred ? "Outside limitation" : "Within limitation"}</span>
      </header>
      {!l.computed ? (
        <div className="p-6"><p className="audit-sub">{l.reason ?? "Insufficient information to calculate limitation."}</p>
          {caseType?.limitationDays != null && <p className="audit-note mt-3">Complete the missing dates in Verification and run scrutiny again.</p>}
        </div>
      ) : (
        <>
          <div className="audit-time-summary">
            <div><div className="audit-kicker"><CalendarClock size={14} />Based on intended filing</div>
              <strong style={{ color: l.barred ? "#a33f38" : "#326e51" }}>{l.barred ? l.daysOverdue + " days overdue" : l.daysRemaining + " days remaining"}</strong>
            </div>
            <dl className="audit-time-dates">
              <div><dt>Last permissible date</dt><dd>{dateLabel(l.dueOn)}</dd></div>
              <div><dt>Intended filing</dt><dd>{dateLabel(dates?.filingOn)}</dd></div>
            </dl>
          </div>
          {l.condonationNeeded && <div className="mx-6 mb-5 audit-notice" data-tone={l.condonationAvailable === false ? "error" : undefined}><AlertTriangle /><div><strong>{l.condonationAvailable === false ? "Condonation unavailable. " : "Condonation required. "}</strong>{l.condonationNote}</div></div>}
          <details className="audit-working">
            <summary><span>Review the calculation <span style={{ color: "#8d8171", fontWeight: 400 }}>· {l.steps.length} steps with statutory sources</span></span><ChevronDown /></summary>
            <ol className="audit-timeline">{l.steps.map((s, i) => (
              <li key={i}><span className="audit-timeline-number">{i + 1}</span><div><h4>{s.label}</h4>{s.provision && <small>{s.provision}</small>}<p>{s.detail}</p></div><time>{s.runningDate ? dateLabel(s.runningDate) : ""}</time></li>
            ))}</ol>
            {sourceDates > 0 && <p className="audit-note px-6 pb-4">Dates extracted from your documents are used in this calculation. Compare them with the certified copy endorsement.</p>}
          </details>
        </>
      )}
      <p className="audit-note border-t border-rule px-6 py-3">Computed from supplied dates. Acknowledgment, part payment and time spent in another court may affect limitation. Check the working before relying on it.</p>
    </section>
  );
}
