import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, FileStack, Plus, ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getResult, listBundles } from "@/lib/store";
import { caseTypeById, rulebookStats } from "@/lib/rulebook";
import { COURTS } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Guard here rather than trusting the layout: Next renders layout and page
  // in parallel, so this component can evaluate before the layout's redirect
  // takes effect, and a non-null assertion would throw on a signed-out request.
  const user = await getSessionUser();
  if (!user) redirect("/");

  const bundles = await listBundles(user.email);
  const stats = rulebookStats();

  // The list is short and the read is cheap, so each row can carry its verdict
  // rather than making the user open every bundle to find the one that is on fire.
  const rows = await Promise.all(
    bundles.map(async (b) => ({ bundle: b, result: await getResult(b.id) }))
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0 max-w-2xl">
          <p className="eyebrow">Workspace</p>
          <h1 className="mt-2 font-serif text-[30px] leading-[1.12] tracking-[-0.02em] text-ink">
            {greeting()}, {user.name.replace(/^Adv\.?\s+/i, "")}.
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
            Scrutinise a bundle against the court&apos;s own checkslip before the
            Registry does it for you.
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} />
          New scrutiny
        </Link>
      </header>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2.5">
          {rows.map(({ bundle: b, result }) => {
            const ct = caseTypeById(b.caseTypeId);
            const court = COURTS.find((c) => c.id === b.court);
            const pages = b.documents.reduce((s, d) => s + d.pageCount, 0);
            return (
              <li key={b.id}>
                <Link
                  href={`/scrutiny/${b.id}`}
                  className="card group flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 transition hover:border-[var(--brand)]/35"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f4efe8] text-ink-soft">
                    <FileStack className="h-[18px] w-[18px]" strokeWidth={1.7} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">
                      {b.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-soft">
                      {ct?.code ?? b.caseTypeId} · {court?.name ?? b.court} ·{" "}
                      <span className="num">
                        {b.documents.length} documents, {pages} pages
                      </span>
                    </span>
                  </span>

                  <Verdict result={result} />

                  <ArrowUpRight
                    className="h-[16px] w-[16px] shrink-0 text-ink-soft/40 transition group-hover:text-[var(--brand)]"
                    strokeWidth={1.9}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="flex items-start gap-2.5 border-t border-rule pt-6 text-[12.5px] leading-relaxed text-ink-soft">
        <ShieldCheck
          className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[var(--gold)]"
          strokeWidth={1.8}
        />
        <span>
          Checked against{" "}
          <Link
            href="/rulebook"
            className="font-medium text-ink underline decoration-[var(--rule)] underline-offset-2 hover:decoration-[var(--brand)]"
          >
            {stats.verified} verified rules
          </Link>{" "}
          drawn from {stats.sources} primary sources across {stats.courts} courts. Every
          defect links back to the rule it came from.
        </span>
      </footer>
    </div>
  );
}

function Verdict({
  result,
}: {
  result: Awaited<ReturnType<typeof getResult>>;
}) {
  if (!result)
    return (
      <span className="shrink-0 rounded-full border border-rule px-2.5 py-1 text-[11px] text-ink-soft">
        Not yet scrutinised
      </span>
    );

  const { fatal, objections } = result.stats;
  const barred = result.limitation.computed && result.limitation.barred;

  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1.5">
      {barred && <Pill tone="fatal">Out of time</Pill>}
      {fatal > 0 && (
        <Pill tone="fatal">
          {fatal} fatal
        </Pill>
      )}
      {objections > 0 && (
        <Pill tone="objection">
          {objections} objection{objections === 1 ? "" : "s"}
        </Pill>
      )}
      {fatal === 0 && objections === 0 && !barred && <Pill tone="pass">Clean</Pill>}
    </span>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "fatal" | "objection" | "pass";
  children: React.ReactNode;
}) {
  const map = {
    fatal: "border-fatal/25 bg-[var(--fatal-bg)] text-fatal",
    objection: "border-objection/25 bg-[var(--objection-bg)] text-objection",
    pass: "border-pass/25 bg-[var(--pass-bg)] text-pass",
  } as const;
  return (
    <span
      className={`num rounded-full border px-2.5 py-1 text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="card px-8 py-14 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f4efe8] text-ink-soft">
        <FileStack className="h-[22px] w-[22px]" strokeWidth={1.6} />
      </span>
      <h2 className="mt-4 font-serif text-[20px] text-ink">No bundles yet.</h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-soft">
        Upload the PDFs you are about to file — the petition, the certified copy, the
        vakalatnama, the affidavit, the annexures — and PARAM will run the court&apos;s
        checkslip over them before the Registry can.
      </p>
      <Link
        href="/new"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-dark)]"
      >
        <Plus className="h-[15px] w-[15px]" strokeWidth={2.2} />
        Start a scrutiny
      </Link>
    </div>
  );
}

function greeting(): string {
  // Server-rendered, so this is the server's clock — close enough for a
  // greeting, and it avoids a hydration mismatch from doing it on the client.
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
