"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Search, ListFilter, CircleDashed } from "lucide-react";
import type { Defect, ScrutinyResult } from "@/lib/types";
import DefectCard from "./DefectCard";

const FILTERS = [
  { id: "ALL", label: "All findings" },
  { id: "FATAL", label: "Fatal" },
  { id: "REGISTRY_OBJECTION", label: "Objections" },
  { id: "ADVISORY", label: "Advisories" },
] as const;
const priority = { FATAL: 0, REGISTRY_OBJECTION: 1, ADVISORY: 2 };

export default function FindingsReview({ defects, passed, skipped }: {
  defects: (Defect & { documentName?: string })[];
  passed: ScrutinyResult["passed"];
  skipped: ScrutinyResult["skipped"];
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  useEffect(() => {
    let expanded: HTMLDetailsElement[] = [];
    const beforePrint = () => {
      expanded = Array.from(document.querySelectorAll<HTMLDetailsElement>(".audit-page details:not([open])"));
      expanded.forEach(detail => { detail.open = true; });
    };
    const afterPrint = () => {
      expanded.forEach(detail => { detail.open = false; });
      expanded = [];
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);
  const ordered = [...defects].sort((a, b) => priority[a.severity] - priority[b.severity]);
  const query = search.trim().toLowerCase();
  const shown = ordered.map((d, i) => ({ ...d, index: i + 1 })).filter(d =>
    (filter === "ALL" || d.severity === filter) &&
    (!query || [d.title, d.detail, d.documentName, d.ruleId, d.source].join(" ").toLowerCase().includes(query))
  );

  return (
    <div className="audit-stack">
      <section className="audit-panel" aria-label="Scrutiny findings">
        <header className="audit-panel-head">
          <div><h2 className="audit-panel-title">Findings &amp; corrective actions</h2><p className="audit-sub">Review in order of severity. Every finding includes its authority.</p></div>
          <span className="audit-badge">{defects.length} findings</span>
        </header>
        <div className="audit-filterbar no-print">
          <div className="audit-filters" role="group" aria-label="Filter by severity">
            {FILTERS.map(f => <button key={f.id} className="audit-filter" type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}<span>{f.id === "ALL" ? defects.length : defects.filter(d => d.severity === f.id).length}</span></button>)}
          </div>
          <label className="audit-search"><Search size={15} /><input type="search" aria-label="Search findings" placeholder="Search document or rule" value={search} onChange={e => setSearch(e.target.value)} /></label>
        </div>
        <div className="no-print">
          <p role="status" aria-live="polite" className="sr-only">{shown.length} findings shown</p>
          {shown.length ? shown.map(d => <DefectCard key={d.ruleId + "-" + d.index} defect={d} documentName={d.documentName} index={d.index} />) :
            <div className="audit-empty">{defects.length ? <ListFilter /> : <CheckCircle2 />}<h3>{defects.length ? "No findings match this view" : "No defects were raised"}</h3><p>{defects.length ? "Try another severity or search term." : "Check the coverage below for matters that still need your review."}</p>{defects.length > 0 && <button type="button" className="audit-btn" onClick={() => { setFilter("ALL"); setSearch(""); }}>Clear filters</button>}</div>}
        </div>
        <div className="hidden print:block">{ordered.map((d,i) => <DefectCard key={d.ruleId + "-" + i} defect={d} documentName={d.documentName} index={i + 1} />)}</div>
      </section>
      <section className="audit-panel">
        <header className="audit-panel-head"><div><h2 className="audit-panel-title">What this assessment covers</h2><p className="audit-sub">Passed checks and the boundaries of automated scrutiny.</p></div></header>
        <div className="audit-cover-list">
          <details><summary>Checks passed <span className="audit-badge ml-2" data-tone="pass">{passed.length}</span></summary><ul>{passed.map(p => <li key={p.ruleId}><CheckCircle2 color="#4b8261" /><span>{p.text}</span></li>)}</ul>{!passed.length && <p className="audit-sub">No checks recorded as passed.</p>}</details>
          <details open={skipped.length > 0}><summary>Not checked <span className="audit-badge ml-2" data-tone="advisory">{skipped.length}</span></summary><ul>{skipped.map(s => <li key={s.ruleId}><CircleDashed color="#597991" /><span>{s.text}<small>{s.reason}</small></span></li>)}</ul>{!skipped.length && <p className="audit-sub">All applicable checks were performed.</p>}</details>
        </div>
      </section>
    </div>
  );
}
