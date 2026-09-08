"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpenCheck,
  FolderClosed,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

/**
 * The rail IS the filing.
 *
 * The five stages are the navigation; everything else (all filings, the
 * rulebook) is secondary and sits below a rule.
 *
 * The rail deliberately does NOT report progress. It carried a green tick on
 * every stage it considered complete, and that reads as a claim the rail
 * cannot honestly make: going back to stage II to correct a date leaves the
 * later ticks standing, so the sidebar says the scrutiny is done when the
 * thing it scrutinised has since changed. A stage the advocate has not opened
 * looked different from one they had, which invited the same misreading in
 * reverse. So it is a plain set of tabs: the one you are on is highlighted,
 * the rest are identical. Progress belongs on the page that can state it
 * precisely, not on a permanent tick in the corner of the eye.
 */

const STAGES = [
  { n: "I", label: "Bundle", slug: "bundle" },
  { n: "II", label: "Verification", slug: "extraction" },
  { n: "III", label: "Registry scrutiny", slug: "score" },
  { n: "IV", label: "Cure and seal", slug: "cure" },
  { n: "V", label: "PARAM Assistant", slug: "assistant" },
] as const;

interface CaseState {
  /** Which bundle this describes, so a stale fetch cannot label the wrong case. */
  id: string;
  title: string;
}

export default function Sidebar({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [state, setState] = useState<CaseState | null>(null);

  /*
    The case in the URL, if any.

    Two shapes carry it: /case/<id>/... for stages I to IV, and /assistant?bundle=<id>
    for stage V. Reading only the path left the Assistant showing an empty rail
    even though it is a stage of the very filing being discussed.
  */
  const bundleId =
    pathname.match(/^\/case\/([^/]+)/)?.[1] ??
    (pathname.startsWith("/assistant") ? searchParams.get("bundle") : null);

  useEffect(() => {
    if (!bundleId) return;
    let live = true;
    fetch(`/api/bundle/${bundleId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d) return;
        setState({ id: bundleId, title: d.title });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Re-read on every navigation within the case: the title is detected from
    // the documents, so it can change under the rail without a reload.
  }, [bundleId, pathname]);

  /*
    Derived, not stored. Clearing this with setState inside the effect would be
    a state write during render-commit, and it would also show the previous
    case's title for a frame when moving between filings. Comparing the id is
    both cheaper and more correct.
  */
  const current = state && state.id === bundleId ? state : null;
  const started = Boolean(bundleId);

  const activeIndex = pathname.includes("/assistant")
    ? 4
    : !started
      ? 0
      : pathname.includes("/cure")
        ? 3
        : pathname.includes("/score")
          ? 2
          : pathname.includes("/bundle")
            ? 0
            : 1;

  const hrefFor = (i: number) => {
    if (STAGES[i].slug === "assistant") return bundleId ? `/assistant?bundle=${bundleId}` : "/assistant";
    // Nothing to show for a stage of a filing that does not exist yet.
    if (!started) return "/new";
    return `/case/${bundleId}/${STAGES[i].slug}`;
  };

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <div className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-black/30 bg-[var(--shell)] px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Hide navigation" : "Show navigation"}
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--shell-ink-soft)] transition hover:bg-white/10 hover:text-[var(--shell-ink)]"
        >
          {open ? (
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.8} />
          ) : (
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.8} />
          )}
        </button>
        <Wordmark />
      </div>

      <aside
        className={`no-print z-30 w-[268px] shrink-0 flex-col border-r border-black/30 bg-[var(--shell)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start ${
          open ? "flex" : "hidden"
        }`}
      >
        <div className="hidden px-5 pb-5 pt-6 lg:block">
          <Wordmark />
        </div>

        {/* ── The filing ── */}
        <div className="px-4">
          <p className="px-2 text-[9.5px] font-bold uppercase tracking-[0.2em] text-[var(--shell-ink-soft)]/70">
            {started ? "This filing" : "New filing"}
          </p>
          {current?.title && (
            <p className="mt-2 line-clamp-2 px-2 text-[11.5px] leading-snug text-[var(--shell-ink)]/85">
              {current.title}
            </p>
          )}
        </div>

        <nav aria-label="Filing stages" className="mt-3 px-3">
          <ol className="space-y-0.5">
            {STAGES.map((s, i) => {
              const active = i === activeIndex;
              /*
                Never locked. An advocate who wants to look ahead at what the
                scrutiny will check, or jump back to fix a date, should not be
                walled into a corridor. Before anything is uploaded every stage
                points at the upload screen, which is where the work has to
                start anyway.
              */
              return (
                <li key={s.n}>
                  <Link
                    href={hrefFor(i)}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition ${
                      active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-[#c8933f] transition-opacity ${
                        active ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    <span
                      className={`w-6 shrink-0 font-serif text-[12.5px] leading-none ${
                        active ? "text-[#d3a052]" : "text-[var(--shell-ink-soft)]/60"
                      }`}
                    >
                      {s.n}
                    </span>
                    <span
                      className={`flex-1 text-[13px] font-medium leading-tight ${
                        active ? "text-[var(--shell-ink)]" : "text-[var(--shell-ink-soft)]/80"
                      }`}
                    >
                      {s.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* ── Secondary ── */}
        <div className="mt-6 space-y-0.5 border-t border-white/10 px-3 pt-4">
          <Secondary href="/filings" icon={FolderClosed} label="All filings" pathname={pathname} />
          <Secondary href="/rulebook" icon={BookOpenCheck} label="Rulebook" pathname={pathname} />
        </div>

        <div className="mt-auto border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[11.5px] font-semibold text-[var(--shell-ink)]">
              {initials(name)}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-medium text-[var(--shell-ink)]">
                {name}
              </span>
              <span className="block text-[11px] text-[var(--shell-ink-soft)]">{role}</span>
            </span>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
              title="Sign out"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--shell-ink-soft)] transition hover:bg-white/10 hover:text-[var(--shell-ink)] disabled:opacity-50"
            >
              <LogOut className="h-[15px] w-[15px]" strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Secondary({
  href,
  icon: Icon,
  label,
  pathname,
}: {
  href: string;
  icon: typeof FolderClosed;
  label: string;
  pathname: string;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition ${
        active
          ? "bg-white/[0.06] text-[var(--shell-ink)]"
          : "text-[var(--shell-ink-soft)] hover:bg-white/[0.04] hover:text-[var(--shell-ink)]"
      }`}
    >
      <Icon className="h-[15px] w-[15px] shrink-0" strokeWidth={1.8} />
      {label}
    </Link>
  );
}

function Wordmark() {
  return (
    <Link href="/new" className="flex items-center gap-2.5">
      <Image src="/brand/param-mark.svg" alt="" width={34} height={34} className="rounded-[9px]" />
      <span className="leading-none">
        <span className="block text-[16px] font-black tracking-[0.16em] text-[var(--shell-ink)]">
          PARAM
        </span>
        <span className="mt-1 block text-[8px] font-semibold uppercase leading-[1.35] tracking-[0.11em] text-[#c8933f]">
          <span className="block">Pre Assessment Registry</span>
          <span className="block">and Audit Mitra</span>
        </span>
      </span>
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.replace(/^Adv\.?\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "PA";
}
