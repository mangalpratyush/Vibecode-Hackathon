import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle, getResult, saveResult } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import { caseTypeById } from "@/lib/rulebook";
import { COURTS, DOC_KIND_LABEL } from "@/lib/types";
import type { Defect, Severity } from "@/lib/types";
import LimitationPanel from "@/components/portal/LimitationPanel";
import PrintButton from "@/components/portal/PrintButton";
import BundleActions from "@/components/portal/BundleActions";
import { ArrowLeft, MessagesSquare } from "lucide-react";

export const dynamic = "force-dynamic";

const SEV_LABEL: Record<Severity, string> = {
  FATAL: "Fatal",
  REGISTRY_OBJECTION: "Registry objection",
  ADVISORY: "Advisory",
};

export default async function ScrutinyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // See the note in dashboard/page.tsx: the layout's redirect is not a
  // guarantee that this component never runs signed-out.
  const user = await getSessionUser();
  if (!user) redirect("/");
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email) notFound();

  // Re-run rather than trust a stale result: the rulebook may have moved on.
  let result = await getResult(id);
  if (!result) {
    result = runScrutiny(bundle);
    await saveResult(result);
  }

  const ct = caseTypeById(bundle.caseTypeId);
  const court = COURTS.find((c) => c.id === bundle.court);
  const { stats } = result;
  const clean = result.defects.length === 0;

  return (
    <div className="space-y-7">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-2xl">
          <Link
            href="/dashboard"
            className="no-print inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-soft transition hover:text-[var(--brand)]"
          >
            <ArrowLeft className="h-[13px] w-[13px]" strokeWidth={2} />
            All bundles
          </Link>
          <h1 className="mt-2.5 font-serif text-[28px] leading-[1.15] tracking-[-0.02em] text-ink">
            {bundle.title}
          </h1>
          <p className="mt-2 text-[12.5px] text-ink-soft">
            {ct?.code} {ct?.name} · {court?.name} ·{" "}
            <span className="num">
              {stats.documents} documents, {stats.pages} pages
            </span>
          </p>
        </div>
        <div className="no-print flex shrink-0 gap-2">
          <Link
            href={`/assistant?bundle=${bundle.id}`}
            className="inline-flex items-center gap-2 rounded-xl border border-rule bg-white px-3.5 py-2 text-[12.5px] font-medium text-ink transition hover:border-[var(--brand)]/40 hover:text-[var(--brand)]"
          >
            <MessagesSquare className="h-[14px] w-[14px]" strokeWidth={1.8} />
            Ask about this
          </Link>
          <PrintButton />
        </div>
      </header>

      {/* ── Verdict strip ── */}
      <section
        className={`rounded-2xl border px-6 py-5 ${
          stats.fatal > 0
            ? "border-fatal/30 bg-[var(--fatal-bg)]"
            : stats.objections > 0
              ? "border-objection/30 bg-[var(--objection-bg)]"
              : "border-pass/30 bg-[var(--pass-bg)]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="eyebrow">Consolidated defect memo</div>
            <div className="mt-1.5 font-serif text-[21px] leading-tight text-ink">
              {clean
                ? "No defects found against the encoded checkslip."
                : `${result.defects.length} defect${result.defects.length === 1 ? "" : "s"} to cure before filing`}
            </div>
          </div>
          <dl className="num ml-auto flex gap-7">
            <Stat n={stats.fatal} label="Fatal" tone="text-fatal" />
            <Stat n={stats.objections} label="Objections" tone="text-objection" />
            <Stat n={stats.advisories} label="Advisory" tone="text-advisory" />
            <Stat n={result.passed.length} label="Passed" tone="text-pass" />
          </dl>
        </div>
        {clean && (
          <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-soft">
            This means the bundle passes the {result.passed.length} checks PARAM
            encodes for this court and case type. It is not a guarantee that the
            Registry will raise nothing — see the {result.skipped.length} checks
            PARAM could not perform, listed at the foot of this memo.
          </p>
        )}
      </section>

      {/* ── Limitation ── */}
      <LimitationPanel
        limitation={result.limitation}
        caseType={ct ?? null}
        dates={bundle.dates}
      />

      {/* ── Defects ── */}
      {result.defects.length > 0 && (
        <section className="space-y-3">
          <h2 className="eyebrow">Defects</h2>
          {result.defects.map((d, i) => (
            <DefectCard key={`${d.ruleId}-${i}`} defect={d} bundle={bundle} />
          ))}
        </section>
      )}

      {/* ── Act on it ── */}
      <BundleActions bundleId={bundle.id} barred={Boolean(result.limitation.barred)} />

      {/* ── Documents as classified ── */}
      <section className="card p-6">
        <h2 className="eyebrow">Bundle as PARAM read it</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
          If a document is mis-classified, the checks that depend on it will be
          wrong. Confidence is shown so you can tell a certainty from a guess.
        </p>
        <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-lg border border-rule">
          {bundle.documents.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-paper px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                {d.fileName}
              </span>
              <span className="rounded-full bg-[#f4efe8] px-2.5 py-0.5 text-[11.5px] font-medium text-ink">
                {DOC_KIND_LABEL[d.kind]}
                {d.annexureMark ? ` ${d.annexureMark}` : ""}
              </span>
              <span className="num w-20 text-right text-[12px] text-ink-soft">
                {d.pageCount} pp
              </span>
              <span
                className={`num w-24 text-right text-[12px] ${
                  d.kindConfidence >= 78 ? "text-ink-soft" : "text-objection"
                }`}
                title={`Classified from ${d.kindSource}`}
              >
                {d.kindConfidence}% conf.
              </span>
              <span
                className={`w-24 text-right text-[12px] ${
                  d.hasTextLayer ? "text-ink-soft" : "text-fatal"
                }`}
              >
                {d.hasTextLayer ? "text layer" : "no text layer"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Coverage: passed and skipped ── */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="eyebrow">Checks passed · {result.passed.length}</h2>
          <ul className="mt-3 space-y-2">
            {result.passed.map((p) => (
              <li key={p.ruleId} className="flex gap-2.5 text-[12.5px] leading-relaxed">
                <span className="mt-0.5 shrink-0 text-pass">✓</span>
                <span className="text-ink-soft">{p.text}</span>
              </li>
            ))}
            {!result.passed.length && (
              <li className="text-[12.5px] text-ink-soft">None.</li>
            )}
          </ul>
        </div>

        <div className="card p-6">
          <h2 className="eyebrow">Not checked · {result.skipped.length}</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            The boundary of this scrutiny. These still need your eye.
          </p>
          <ul className="mt-3 space-y-2.5">
            {result.skipped.map((s) => (
              <li key={s.ruleId} className="text-[12.5px] leading-relaxed">
                <span className="text-ink">{s.text}</span>
                <span className="mt-0.5 block text-ink-soft/80">{s.reason}</span>
              </li>
            ))}
            {!result.skipped.length && (
              <li className="text-[12.5px] text-ink-soft">Nothing skipped.</li>
            )}
          </ul>
        </div>
      </section>

      <p className="border-t border-rule pt-5 text-[12px] leading-relaxed text-ink-soft">
        Scrutiny run {new Date(result.ranAt).toLocaleString("en-IN")} against PARAM&apos;s{" "}
        <Link href="/rulebook" className="font-medium text-ink underline underline-offset-2 hover:text-[var(--brand)]">
          rulebook
        </Link>
        . PARAM reports what it can measure in the files you uploaded. It does not
        replace the Registry&apos;s scrutiny and is not legal advice.
      </p>
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className="text-center">
      <dt className={`font-serif text-[27px] leading-none ${n > 0 ? tone : "text-ink-soft/30"}`}>{n}</dt>
      <dd className="mt-0.5 text-[11px] text-ink-soft">{label}</dd>
    </div>
  );
}

function DefectCard({
  defect,
  bundle,
}: {
  defect: Defect;
  bundle: { documents: { id: string; fileName: string }[] };
}) {
  const doc = bundle.documents.find((d) => d.id === defect.documentId);
  return (
    <article className={`sev-${defect.severity} card overflow-hidden p-0`}>
      <div className="h-[3px] w-full" style={{ background: "var(--sev)" }} />
      <div className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--sev-bg)", color: "var(--sev)" }}
        >
          {SEV_LABEL[defect.severity]}
        </span>
        <h3 className="text-[15px] font-semibold text-ink">{defect.title}</h3>
        {defect.aiAssisted && (
          <span
            title="Inferred by an AI-assisted check rather than measured from the file. Confirm by eye."
            className="rounded-full border border-advisory/35 px-2 py-0.5 text-[10.5px] font-medium text-advisory"
          >
            AI-assisted · verify
          </span>
        )}
      </div>

      <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink">{defect.detail}</p>

      {(doc || defect.pageNo) && (
        <p className="num mt-2 text-[12px] text-ink-soft">
          {doc ? doc.fileName : ""}
          {doc && defect.pageNo ? " · " : ""}
          {defect.pageNo ? `page ${defect.pageNo}` : ""}
        </p>
      )}

      <div className="mt-3.5 rounded-xl border border-rule bg-[#fcfaf7] px-4 py-3">
        <p className="eyebrow">As the Registry words it</p>
        <p className="mt-1.5 font-serif text-[14.5px] leading-relaxed text-ink">
          &ldquo;{defect.registryWording}&rdquo;
        </p>
        <p className="mt-2 text-[11.5px] text-ink-soft">
          {defect.source} ·{" "}
          <a
            href={defect.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-[var(--brand)]"
          >
            source
          </a>{" "}
          · <span className="font-mono">{defect.ruleId}</span>
        </p>
      </div>

      {defect.fix && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
          <strong className="font-semibold text-ink">
            {defect.fix.auto ? "Fix: " : "To cure: "}
          </strong>
          {defect.fix.guidance}
        </p>
      )}
      </div>
    </article>
  );
}
