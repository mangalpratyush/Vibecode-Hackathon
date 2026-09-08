import type {
  FilingScore,
  LimitationResult,
  ScrutinyResult,
  Severity,
  Verdict,
} from "../types";

export type { FilingScore, Verdict };

/**
 * The Registry Filing Score.
 *
 * A single number is what people remember, so it is worth having. But the
 * obvious way to compute one is wrong here, and wrong in a way that costs the
 * user the exact thing PARAM promises to save.
 *
 * A weighted average would score a bundle missing its vakalatnama at around 82
 * because eleven other checks passed. That reads as "nearly ready". It is not
 * nearly ready: the counter hands it straight back, and the advocate loses the
 * days we said we would save. Registry scrutiny is not a gradient. It is a gate.
 *
 * So the score is GATED, not averaged. A fatal defect caps the number and forces
 * the verdict, however much else passed. The number moves within the band the
 * verdict allows; it never crosses into a band the filing has not earned.
 *
 * The verdict is the headline. The number is the detail.
 */

/**
 * Ceilings, not weights.
 *
 * Each verdict owns a band. The computed number is squeezed into the band its
 * worst finding allows, so the headline and the number can never disagree.
 */
const BANDS: Record<Verdict, { floor: number; ceiling: number }> = {
  WILL_BE_RETURNED: { floor: 5, ceiling: 49 },
  LIKELY_OBJECTIONS: { floor: 50, ceiling: 79 },
  READY_WITH_NOTES: { floor: 80, ceiling: 94 },
  CLEAR: { floor: 95, ceiling: 100 },
};

const HEADLINE: Record<Verdict, string> = {
  WILL_BE_RETURNED: "Will be returned",
  LIKELY_OBJECTIONS: "Expect objections",
  READY_WITH_NOTES: "Ready, with notes",
  CLEAR: "Clear to file",
};

/** What each severity costs inside its band. */
const COST: Record<Severity, number> = {
  FATAL: 14,
  REGISTRY_OBJECTION: 6,
  ADVISORY: 2,
};

export function scoreFiling(
  result: Pick<ScrutinyResult, "defects" | "passed" | "skipped"> & {
    limitation: LimitationResult;
  }
): FilingScore {
  const fatal = result.defects.filter((d) => d.severity === "FATAL");
  const objections = result.defects.filter(
    (d) => d.severity === "REGISTRY_OBJECTION"
  );
  const advisories = result.defects.filter((d) => d.severity === "ADVISORY");

  // Limitation is not just another fatal defect. A time-barred filing is the
  // one failure the court raises on its own motion under s.3, so it decides the
  // verdict by itself even if every other check passed.
  const barred = result.limitation.computed && Boolean(result.limitation.barred);
  const condonationUnavailable =
    barred && result.limitation.condonationAvailable === false;

  const verdict: Verdict =
    fatal.length > 0 || barred
      ? "WILL_BE_RETURNED"
      : objections.length > 0
        ? "LIKELY_OBJECTIONS"
        : advisories.length > 0
          ? "READY_WITH_NOTES"
          : "CLEAR";

  const band = BANDS[verdict];

  /*
    Coverage.

    Checks PARAM could not perform are not passes. Counting them as passes
    would let a bundle score higher precisely because less of it was examined,
    which is exactly backwards. They are excluded from the denominator and they
    forbid a perfect score.
  */
  const examined = result.passed.length + result.defects.length;
  const incompleteCoverage = result.skipped.length > 0;

  const penalty =
    fatal.length * COST.FATAL +
    objections.length * COST.REGISTRY_OBJECTION +
    advisories.length * COST.ADVISORY +
    (barred ? COST.FATAL : 0);

  // Start at the top of the band and work down, floored so the number stays
  // inside the band its verdict earned.
  let score = band.ceiling - penalty;
  if (examined === 0) score = band.floor;
  score = Math.max(band.floor, Math.min(band.ceiling, Math.round(score)));

  // A filing PARAM could not fully examine is never a perfect one.
  if (incompleteCoverage && score === 100) score = 97;

  const cappedBy = fatal.length
    ? `${fatal.length} fatal defect${fatal.length === 1 ? "" : "s"} — the Registry will not number this filing until ${fatal.length === 1 ? "it is" : "they are"} cured`
    : barred
      ? condonationUnavailable
        ? "the filing is out of time and beyond what any court may condone"
        : "the filing is out of time and must carry an application under s.5"
      : objections.length
        ? `${objections.length} registry objection${objections.length === 1 ? "" : "s"} likely to come back`
        : null;

  const breakdown = [
    { label: "Fatal defects", count: fatal.length, delta: -(fatal.length * COST.FATAL) },
    {
      label: "Registry objections",
      count: objections.length,
      delta: -(objections.length * COST.REGISTRY_OBJECTION),
    },
    { label: "Advisories", count: advisories.length, delta: -(advisories.length * COST.ADVISORY) },
    { label: "Out of time", count: barred ? 1 : 0, delta: barred ? -COST.FATAL : 0 },
  ].filter((r) => r.count > 0);

  return {
    score,
    verdict,
    headline: HEADLINE[verdict],
    cappedBy,
    band,
    breakdown,
    incompleteCoverage,
  };
}

/** One line an advocate can read without opening the memo. */
export function scoreSummary(s: FilingScore, checksPassed: number): string {
  if (s.verdict === "CLEAR")
    return `Passes all ${checksPassed} checks PARAM runs for this court and case type.`;
  if (s.verdict === "READY_WITH_NOTES")
    return "Nothing that should stop the filing, but there are advisories worth reading.";
  if (s.verdict === "LIKELY_OBJECTIONS")
    return "No fatal defect, but the Registry is likely to raise objections and send this back.";
  return "This filing will not be numbered as it stands.";
}
