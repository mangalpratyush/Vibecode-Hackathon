import type { CaseType, FilingDates, LimitationResult, LimitationStep } from "../types";
import { isCourtClosed, nextWorkingDay } from "../rulebook/holidays";

/**
 * Limitation engine.
 *
 * The six limitation calculators already on the Indian market are dropdown
 * widgets: pick an Article, type one date, read a number. This one computes
 * from the documents — in particular it applies s.12(2) using the certified
 * copy's own applied-on and ready-on endorsement, which is the step that
 * actually decides most appeals and which no dropdown can perform.
 *
 * Every step is recorded and shown to the advocate. That is deliberate: an
 * advocate must be able to check our arithmetic against the bare Act before
 * relying on it. A number with no working is not usable in practice.
 *
 * We never say a matter "is not time-barred". We say what the computation
 * gives on the dates supplied, and what it depends on.
 */

const DAY = 24 * 60 * 60 * 1000;

const toDate = (s?: string): Date | null => {
  if (!s) return null;
  const d = new Date(s + (s.length === 10 ? "T00:00:00Z" : ""));
  return isNaN(d.getTime()) ? null : d;
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const diffDays = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY);

/**
 * The Supreme Court's COVID exclusion. In Re: Cognizance for Extension of
 * Limitation, SMW(C) No. 3/2020, order dated 10.01.2022: the period from
 * 15.03.2020 to 28.02.2022 is excluded in computing limitation under any
 * general or special law, and where the balance remaining is less than 90 days,
 * 90 days from 01.03.2022 are available.
 *
 * This still governs any cause of action whose limitation was running during
 * that window, which is why it belongs in a tool used in 2026 and not in a
 * history note.
 */
const COVID_FROM = new Date("2020-03-15T00:00:00Z");
const COVID_TO = new Date("2022-02-28T00:00:00Z");
const COVID_RESTART = new Date("2022-03-01T00:00:00Z");
const COVID_FLOOR_DAYS = 90;

export function computeLimitation(
  caseType: CaseType,
  dates: FilingDates,
  courtId: string
): LimitationResult {
  const steps: LimitationStep[] = [];

  if (caseType.limitationDays === null) {
    return {
      computed: false,
      reason:
        caseType.limitationSource ??
        "No fixed period of limitation is prescribed for this case type.",
      steps: [],
      condonationAvailable: caseType.condonationAvailable,
    };
  }

  const pronounced = toDate(dates.pronouncedOn);
  if (!pronounced) {
    return {
      computed: false,
      reason:
        "The date the impugned judgment or order was pronounced has not been supplied, and PARAM could not read it from the certified copy. Limitation cannot be computed without it.",
      steps: [],
      prescribedDays: caseType.limitationDays,
      prescribedSource: caseType.limitationSource,
      condonationAvailable: caseType.condonationAvailable,
    };
  }

  const filingOn = toDate(dates.filingOn) ?? new Date(iso(new Date()) + "T00:00:00Z");

  // ── s.12(1): exclude the day of pronouncement ────────────────────────────
  const running = addDays(pronounced, 1);
  steps.push({
    label: "Time begins to run",
    provision: "Limitation Act, 1963, s.12(1)",
    detail: `The impugned order was pronounced on ${iso(pronounced)}. The day on which the judgment complained of was pronounced is excluded, so time begins to run from ${iso(running)}.`,
    runningDate: iso(running),
  });

  // ── The prescribed period ────────────────────────────────────────────────
  let due = addDays(running, caseType.limitationDays - 1);
  steps.push({
    label: `Prescribed period: ${caseType.limitationDays} days`,
    provision: caseType.limitationSource,
    detail: `Adding the prescribed period of ${caseType.limitationDays} days gives ${iso(due)}, before any exclusion.`,
    runningDate: iso(due),
    days: caseType.limitationDays,
  });

  // ── s.12(2): time requisite for obtaining the certified copy ─────────────
  if (caseType.certifiedCopyExclusion) {
    const applied = toDate(dates.copyAppliedOn);
    const ready = toDate(dates.copyReadyOn);
    if (applied && ready && ready >= applied) {
      // Only time AFTER the application is "time requisite". Any delay by the
      // court in preparing the decree BEFORE the copy was applied for is not
      // excluded — this is the distinction advocates most often get wrong.
      const requisite = diffDays(ready, applied);
      due = addDays(due, requisite);
      steps.push({
        label: `Certified copy: ${requisite} days excluded`,
        provision: "Limitation Act, 1963, s.12(2)",
        detail: `The certified copy was applied for on ${iso(applied)} and was ready on ${iso(ready)}. The time requisite for obtaining it — ${requisite} days — is excluded, moving the expiry to ${iso(due)}. Note that any time the court took to prepare the order BEFORE the copy was applied for is not excludable.`,
        runningDate: iso(due),
        days: requisite,
      });
    } else {
      steps.push({
        label: "Certified copy exclusion not applied",
        provision: "Limitation Act, 1963, s.12(2)",
        detail: applied
          ? "The date the certified copy became ready has not been supplied, so no time has been excluded under s.12(2). Supplying it will usually move the due date later."
          : "The certified copy application and delivery dates have not been supplied, so no time has been excluded under s.12(2). This exclusion is available for appeals, revisions and reviews and is often decisive.",
      });
    }
  }

  // ── COVID exclusion, where the period was running in the window ──────────
  if (due >= COVID_FROM && running <= COVID_TO) {
    const overlapStart = running > COVID_FROM ? running : COVID_FROM;
    const excluded = diffDays(COVID_TO, overlapStart) + 1;
    if (excluded > 0) {
      const shifted = addDays(due, excluded);
      const floor = addDays(COVID_RESTART, COVID_FLOOR_DAYS - 1);
      due = shifted > floor ? shifted : floor;
      steps.push({
        label: `COVID exclusion: ${excluded} days`,
        provision:
          "In Re: Cognizance for Extension of Limitation, SMW(C) No. 3/2020, order dt. 10.01.2022",
        detail: `Limitation was running during the excluded period 15.03.2020 to 28.02.2022, so ${excluded} days are excluded. Where the balance remaining is less than 90 days, 90 days from 01.03.2022 are available. Expiry moves to ${iso(due)}.`,
        runningDate: iso(due),
        days: excluded,
      });
    }
  }

  // ── s.4: court closed on the day of expiry ───────────────────────────────
  if (isCourtClosed(courtId, due)) {
    const reopened = nextWorkingDay(courtId, due);
    steps.push({
      label: "Expiry falls on a day the court is closed",
      provision: "Limitation Act, 1963, s.4",
      detail: `${iso(due)} is not a working day for this court. Where the prescribed period expires on a day when the court is closed, the proceeding may be instituted on the day the court reopens — ${iso(reopened)}.`,
      runningDate: iso(reopened),
    });
    due = reopened;
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  const daysRemaining = diffDays(due, filingOn);
  const barred = daysRemaining < 0;
  const daysOverdue = barred ? -daysRemaining : 0;

  steps.push({
    label: barred ? "Out of time" : "Within time",
    detail: barred
      ? `On an intended filing date of ${iso(filingOn)}, the filing is out of time by ${daysOverdue} day${daysOverdue === 1 ? "" : "s"}. Limitation expired on ${iso(due)}.`
      : `On an intended filing date of ${iso(filingOn)}, ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remain. Limitation expires on ${iso(due)}.`,
    runningDate: iso(due),
  });

  // ── Condonation: is it even available? ───────────────────────────────────
  let condonationAvailable = caseType.condonationAvailable;
  let condonationNote: string | undefined;

  if (caseType.outerLimitDays && barred) {
    // The Arbitration s.34(3) trap. Telling an advocate to file a condonation
    // application here, when no court may condone, would be wrong advice.
    const totalElapsed = diffDays(filingOn, pronounced);
    if (totalElapsed > caseType.outerLimitDays) {
      condonationAvailable = false;
      condonationNote = `${caseType.outerLimitNote} ${totalElapsed} days have elapsed, which is beyond the outer limit of ${caseType.outerLimitDays} days. On these dates the challenge appears to be beyond what any court may condone — this needs senior advice immediately, not a condonation application.`;
    } else {
      condonationNote = caseType.outerLimitNote;
    }
  } else if (barred) {
    condonationNote = `An application under s.5 of the Limitation Act must accompany the filing, and it must explain every single day of the ${daysOverdue}-day delay. Courts require a day-by-day account, not a general explanation.`;
  }

  return {
    computed: true,
    prescribedDays: caseType.limitationDays,
    prescribedSource: caseType.limitationSource,
    steps,
    dueOn: iso(due),
    daysRemaining: barred ? 0 : daysRemaining,
    daysOverdue,
    barred,
    condonationNeeded: barred,
    condonationAvailable,
    condonationNote,
  };
}
