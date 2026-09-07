import type { CaseType, FilingDates, LimitationResult } from "@/lib/types";

/**
 * The limitation computation, shown as working rather than as a verdict.
 *
 * An advocate cannot rely on a number they cannot check. Every step names the
 * provision it applied and the date it produced, so the whole chain can be read
 * against the bare Act in about thirty seconds — which is the difference
 * between a tool a lawyer uses and a tool a lawyer admires.
 */
export default function LimitationPanel({
  limitation,
  caseType,
  dates,
}: {
  limitation: LimitationResult;
  caseType: CaseType | null;
  /** Supplied so the panel can say which dates PARAM read for itself. */
  dates?: FilingDates;
}) {
  const l = limitation;
  // Dates PARAM lifted off the certified copy rather than being told.
  const readForUs = (
    [
      ["pronouncedOn", "pronouncement date"],
      ["copyAppliedOn", "certified copy applied on"],
      ["copyReadyOn", "certified copy ready on"],
    ] as const
  ).filter(([k]) => dates?.source?.[k] === "regex" || dates?.source?.[k] === "ai");

  if (!l.computed) {
    return (
      <section className="card p-6">
        <Header />
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">{l.reason}</p>
        {caseType?.limitationDays !== null && (
          <p className="mt-2 text-[12.5px] text-ink-soft/80">
            Add the missing dates to the bundle and re-run to get the computation.
          </p>
        )}
      </section>
    );
  }

  const barred = Boolean(l.barred);

  return (
    <section
      className={`rounded-xl border p-6 ${
        barred ? "border-fatal/30 bg-[var(--fatal-bg)]" : "border-pass/30 bg-[var(--pass-bg)]"
      }`}
    >
      <Header />

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="text-[19px] font-bold text-ink">
          {barred ? (
            <>
              Out of time by{" "}
              <span className="num text-fatal">
                {l.daysOverdue} day{l.daysOverdue === 1 ? "" : "s"}
              </span>
            </>
          ) : (
            <>
              <span className="num text-pass">
                {l.daysRemaining} day{l.daysRemaining === 1 ? "" : "s"}
              </span>{" "}
              remaining
            </>
          )}
        </div>
        <div className="num text-[13px] text-ink-soft">
          Limitation expires <strong className="font-semibold text-ink">{l.dueOn}</strong>
        </div>
      </div>

      {/* The working */}
      <ol className="mt-5 space-y-0 border-t border-black/10">
        {l.steps.map((s, i) => (
          <li
            key={i}
            className="grid gap-x-5 gap-y-1 border-b border-black/10 py-3 sm:grid-cols-[13rem_1fr_6rem]"
          >
            <div>
              <div className="text-[13px] font-semibold text-ink">{s.label}</div>
              {s.provision && (
                <div className="mt-0.5 text-[11.5px] leading-snug text-ink-soft">
                  {s.provision}
                </div>
              )}
            </div>
            <p className="text-[12.5px] leading-relaxed text-ink-soft">{s.detail}</p>
            <div className="num text-[12.5px] font-medium text-ink sm:text-right">
              {s.runningDate ?? ""}
            </div>
          </li>
        ))}
      </ol>

      {l.condonationNeeded && (
        <div
          className={`mt-5 rounded-lg px-4 py-3.5 ${
            l.condonationAvailable === false
              ? "border border-fatal/35 bg-white/60"
              : "bg-white/60"
          }`}
        >
          <p className="eyebrow">
            {l.condonationAvailable === false
              ? "Condonation is not available"
              : "Condonation required"}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{l.condonationNote}</p>
        </div>
      )}

      {readForUs.length > 0 && (
        <p className="mt-4 rounded-lg bg-white/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-soft">
          <strong className="font-semibold text-ink">Read from your documents:</strong>{" "}
          {provenanceSentence(readForUs.map(([, label]) => label))}
        </p>
      )}

      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-soft">
        Computed on the dates supplied. PARAM does not certify that a matter is or is
        not within time — limitation turns on facts beyond the four dates above,
        including acknowledgment (s.18), part payment (s.19) and time spent bona fide
        in a wrong court (s.14). Check the working before you rely on it.
      </p>
    </section>
  );
}

/**
 * Built as a string rather than as JSX.
 *
 * The JSX version of this sentence interleaved four singular/plural ternaries
 * with prose and lost a space between an expression and the text after it,
 * rendering "PARAM took theseoff the certified copy". Assembling the sentence
 * in one place makes the spacing explicit and the grammar checkable.
 */
function provenanceSentence(labels: string[]): string {
  const one = labels.length === 1;
  return (
    `${labels.join(", ")}. ` +
    `PARAM took ${one ? "this" : "these"} off the certified copy's own endorsement ` +
    `rather than asking you to type ${one ? "it" : "them"}. ` +
    `Check ${one ? "it" : "them"} against the copy before relying on the computation.`
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="eyebrow">
        Limitation
      </h2>
      <span className="text-[11px] text-ink-soft/70">Limitation Act, 1963</span>
    </div>
  );
}
