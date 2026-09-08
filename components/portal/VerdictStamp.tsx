import type { CSSProperties } from "react";
import { ShieldCheck } from "lucide-react";
import type { FilingScore } from "@/lib/types";

const tones = {
  WILL_BE_RETURNED: { accent: "#f2a79a", label: "Critical issues found" },
  LIKELY_OBJECTIONS: { accent: "#ebc380", label: "Corrections required" },
  READY_WITH_NOTES: { accent: "#a5c9e2", label: "Advisories to review" },
  CLEAR: { accent: "#a6cfb4", label: "No defects raised" },
};

export default function VerdictStamp({ score, passedCount, skippedCount }: {
  score: FilingScore; passedCount: number; skippedCount: number;
}) {
  const tone = tones[score.verdict];
  const metrics = [
    { label: "Fatal defects", count: score.breakdown.find(b => b.label === "Fatal defects")?.count ?? 0, color: "#f2a79a" },
    { label: "Registry objections", count: score.breakdown.find(b => b.label === "Registry objections")?.count ?? 0, color: "#ebc380" },
    { label: "Checks passed", count: passedCount, color: "#a6cfb4" },
    { label: "Not checked", count: skippedCount, color: "#b9c9d8" },
  ];
  return (
    <section className="audit-verdict" style={{ "--verdict-accent": tone.accent } as CSSProperties} aria-label="Filing assessment">
      <div className="audit-verdict-copy">
        <div className="audit-kicker"><ShieldCheck size={15} /> PARAM ASSESSMENT <span style={{ color: tone.accent, marginLeft: "auto" }}>{tone.label}</span></div>
        <h2>{score.headline}</h2>
        <p>{score.cappedBy ? <>Score limited by {score.cappedBy}.</> : "Review the findings and coverage below before preparing your final filing."}</p>
      </div>
      <div className="audit-verdict-score">
        <div><strong>{score.score}</strong><small> / 100</small></div>
        <span className="audit-label">Filing readiness score</span>
        <div className="audit-score-bar"><span style={{ width: score.score + "%" }} /></div>
        <p>Verdict band: {score.band.floor}–{score.band.ceiling}</p>
      </div>
      <dl className="audit-stats">{metrics.map(m => <div key={m.label} className="audit-stat"><dt><strong style={{ color: m.color }}>{m.count}</strong></dt><dd><span>{m.label}</span></dd></div>)}</dl>
      {score.incompleteCoverage && <p className="audit-coverage-note">{skippedCount} unperformed {skippedCount === 1 ? "check is" : "checks are"} excluded from the score. Review these separately before filing.</p>}
    </section>
  );
}
