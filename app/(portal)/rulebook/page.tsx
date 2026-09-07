import { RULES, rulebookStats } from "@/lib/rulebook";
import { CHECKS, MANUAL_ONLY, NON_DETERMINISTIC } from "@/lib/scrutiny/checks";
import { COURTS } from "@/lib/types";
import type { Rule } from "@/lib/types";
import PageHeader from "@/components/portal/PageHeader";

/**
 * The rulebook, browsable.
 *
 * This page exists for one question, and it is the question a practitioner
 * always asks: "where does that objection come from?" Every row carries its
 * primary source, the date we last checked it, and — honestly — whether PARAM
 * can actually test it. A rule we have encoded but cannot automate is shown as
 * such rather than quietly dropped, because a coverage gap the user can see is
 * safe and a coverage gap they cannot is not.
 */

function automation(rule: Rule): { label: string; tone: string } {
  if (MANUAL_ONLY.has(rule.check))
    return { label: "Manual — needs your eye", tone: "text-ink-soft" };
  if (rule.check === "limitation")
    return { label: "Computed", tone: "text-pass" };
  if (NON_DETERMINISTIC.has(rule.check))
    return { label: "AI-assisted", tone: "text-advisory" };
  if (CHECKS[rule.check]) return { label: "Automated", tone: "text-pass" };
  return { label: "Not yet implemented", tone: "text-objection" };
}

export default function RulebookPage() {
  const stats = rulebookStats();

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Authority"
        title="Where every objection comes from."
        lead="Each defect PARAM raises resolves to one row below, and every row names the primary source it came from. Rows we could not verify against that source are marked and excluded from scrutiny — PARAM does not guess at a rule."
      />

      <div>
        <dl className="num flex flex-wrap gap-8 border-y border-rule py-5">
          <S n={stats.verified} label="verified rules" />
          <S n={stats.unverified} label="unverified, excluded" />
          <S n={stats.sources} label="primary sources" />
          <S n={stats.courts} label="courts" />
        </dl>
      </div>

      {COURTS.map((court) => {
        const rules = RULES.filter((r) => r.court === court.id);
        if (!rules.length) return null;
        return (
          <section key={court.id} className="space-y-3">
            <h2 className="eyebrow border-b border-rule pb-2">
              {court.name} · {rules.length} rules
            </h2>
            {rules.map((r) => {
              const auto = automation(r);
              return (
                <article key={r.id} className="card p-5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className={`sev-${r.severity} rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide`}
                      style={{ background: "var(--sev-bg)", color: "var(--sev)" }}
                    >
                      {r.severity === "REGISTRY_OBJECTION"
                        ? "Objection"
                        : r.severity === "FATAL"
                          ? "Fatal"
                          : "Advisory"}
                    </span>
                    <span className={`text-[11.5px] font-medium ${auto.tone}`}>
                      {auto.label}
                    </span>
                    {r.status === "unverified" && (
                      <span className="rounded-full border border-objection/35 px-2.5 py-0.5 text-[11px] font-medium text-objection">
                        Unverified — excluded from scrutiny
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[11px] text-ink-soft/70">
                      {r.id}
                    </span>
                  </div>

                  <p className="mt-3 font-serif text-[16px] leading-relaxed text-ink">
                    &ldquo;{r.text}&rdquo;
                  </p>

                  {r.why && (
                    <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{r.why}</p>
                  )}

                  <p className="mt-3 text-[11.5px] text-ink-soft">
                    {r.source} ·{" "}
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-[var(--brand)]"
                    >
                      primary source
                    </a>{" "}
                    · verified <span className="num">{r.verifiedOn}</span>
                    {r.caseTypes.length > 0 && ` · ${r.caseTypes.join(", ")}`}
                  </p>
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function S({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <dt className="font-serif text-[26px] leading-none text-ink">{n}</dt>
      <dd className="mt-0.5 text-[11.5px] text-ink-soft">{label}</dd>
    </div>
  );
}
