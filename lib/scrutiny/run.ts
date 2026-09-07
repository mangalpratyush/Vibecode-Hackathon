import type { Bundle, Defect, ScrutinyResult } from "../types";
import { activeRules, caseTypeById } from "../rulebook";
import { aiAvailable } from "../ai/provider";
import { CHECKS, MANUAL_ONLY, NON_DETERMINISTIC } from "./checks";
import { computeLimitation } from "./limitation";

/**
 * Scrutiny orchestrator.
 *
 * Walks the rules that apply to this court and case type, runs the check each
 * one names, and collects what came back. The shape of the output matters as
 * much as the defects themselves: we report what PASSED and what was SKIPPED
 * alongside what failed, because an advocate needs to know the boundary of the
 * check they just ran. A tool that only ever shows problems leaves the user
 * unable to tell "clean" from "not looked at".
 */

const SEVERITY_ORDER = { FATAL: 0, REGISTRY_OBJECTION: 1, ADVISORY: 2 } as const;

export function runScrutiny(bundle: Bundle): ScrutinyResult {
  const caseType = caseTypeById(bundle.caseTypeId);
  const rules = activeRules(bundle.court, bundle.caseTypeId);

  const defects: Defect[] = [];
  const passed: ScrutinyResult["passed"] = [];
  const skipped: ScrutinyResult["skipped"] = [];

  // ── Limitation, by its own engine ─────────────────────────────────────────
  const limitation = caseType
    ? computeLimitation(caseType, bundle.dates, bundle.court)
    : {
        computed: false,
        reason: "Unknown case type; limitation cannot be computed.",
        steps: [],
      };

  for (const rule of rules) {
    // Objections a machine cannot honestly test.
    if (MANUAL_ONLY.has(rule.check)) {
      skipped.push({
        ruleId: rule.id,
        text: rule.text,
        reason: "Requires physical inspection — PARAM cannot verify this from the file.",
      });
      continue;
    }

    // Limitation is handled above; surface it here as a defect if it bites.
    if (rule.check === "limitation") {
      if (limitation.computed && limitation.barred) {
        const overdue = limitation.daysOverdue ?? 0;
        defects.push({
          ruleId: rule.id,
          severity: "FATAL",
          title: `Out of time by ${overdue} day${overdue === 1 ? "" : "s"}`,
          detail:
            `On the dates supplied, limitation expired on ${limitation.dueOn}. ` +
            (limitation.condonationAvailable === false
              ? limitation.condonationNote ?? ""
              : `The filing must be accompanied by an application under s.5 of the Limitation Act explaining every one of the ${overdue} days.`),
          registryWording: rule.text,
          source: limitation.prescribedSource ?? rule.source,
          sourceUrl: rule.sourceUrl,
          fix: rule.fix,
        });
      } else if (!limitation.computed) {
        skipped.push({
          ruleId: rule.id,
          text: rule.text,
          reason: limitation.reason ?? "Not enough information to compute limitation.",
        });
      } else {
        passed.push({
          ruleId: rule.id,
          text: `Within time — ${limitation.daysRemaining} day(s) remain, expiring ${limitation.dueOn}.`,
        });
      }
      continue;
    }

    // AI-assisted checks: honestly skipped when there is no key, never faked.
    if (NON_DETERMINISTIC.has(rule.check)) {
      skipped.push({
        ruleId: rule.id,
        text: rule.text,
        reason: aiAvailable()
          ? "AI-assisted check — run it from the defect memo to review this one."
          : "Needs an AI provider key. The deterministic scrutiny above is unaffected.",
      });
      continue;
    }

    const fn = CHECKS[rule.check];
    if (!fn) {
      skipped.push({
        ruleId: rule.id,
        text: rule.text,
        reason: "No automated check is implemented for this rule yet.",
      });
      continue;
    }

    let found: Defect[] = [];
    try {
      found = fn({ bundle, rule });
    } catch (e) {
      // A crashing check must never take the whole scrutiny down, and must
      // never be silently reported as "passed".
      skipped.push({
        ruleId: rule.id,
        text: rule.text,
        reason: `Check failed to run: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    if (found.length) defects.push(...found);
    else passed.push({ ruleId: rule.id, text: rule.text });
  }

  defects.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.ruleId.localeCompare(b.ruleId)
  );

  return {
    bundleId: bundle.id,
    ranAt: new Date().toISOString(),
    court: bundle.court,
    caseTypeId: bundle.caseTypeId,
    defects,
    limitation,
    passed,
    skipped,
    stats: {
      documents: bundle.documents.length,
      pages: bundle.documents.reduce((s, d) => s + d.pageCount, 0),
      fatal: defects.filter((d) => d.severity === "FATAL").length,
      objections: defects.filter((d) => d.severity === "REGISTRY_OBJECTION").length,
      advisories: defects.filter((d) => d.severity === "ADVISORY").length,
    },
  };
}
