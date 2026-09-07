"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpenCheck,
  FilePlus2,
  Files,
  LogOut,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

/**
 * Portal navigation.
 *
 * A left rail rather than a top bar because this is a working tool, not a
 * marketing site: the four destinations are permanent, an advocate moves
 * between them constantly, and vertical space is what a defect memo needs least.
 *
 * The Assistant is a destination here, not a floating bubble. A chat that
 * hovers over the document you are reading is a support widget; a chat that
 * sits alongside the rulebook and the memo is part of the tool.
 */

const NAV = [
  {
    href: "/dashboard",
    label: "Bundles",
    hint: "Filings under scrutiny",
    icon: Files,
  },
  {
    href: "/new",
    label: "New scrutiny",
    hint: "Upload a bundle",
    icon: FilePlus2,
  },
  {
    href: "/rulebook",
    label: "Rulebook",
    hint: "Every rule and its source",
    icon: BookOpenCheck,
  },
  {
    href: "/assistant",
    label: "PARAM Assistant",
    hint: "Ask in any language",
    icon: MessagesSquare,
  },
];

export default function Sidebar({
  name,
  role,
  storageMode,
}: {
  name: string;
  role: string;
  storageMode: "mongodb" | "memory";
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard" || pathname.startsWith("/scrutiny")
      : pathname.startsWith(href);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <>
      {/* Mobile: the rail collapses to a bar with a toggle. */}
      <div className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-rule bg-[var(--shell)] px-4 py-3 lg:hidden">
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
        /*
          self-start matters: as a flex child the rail would otherwise stretch to
          the full height of the page, and a sticky element that is already as
          tall as its container has nothing to stick to. Constrained to one
          viewport, it pins while the memo scrolls past it.
        */
        className={`no-print z-30 w-[264px] shrink-0 flex-col border-r border-black/30 bg-[var(--shell)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start ${
          open ? "flex" : "hidden"
        }`}
      >
        <div className="hidden px-5 pb-1 pt-6 lg:block">
          <Wordmark />
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          {NAV.map(({ href, label, hint, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
                  active
                    ? "bg-white/[0.07] text-[var(--shell-ink)]"
                    : "text-[var(--shell-ink-soft)] hover:bg-white/[0.04] hover:text-[var(--shell-ink)]"
                }`}
              >
                {/* Active marker: a gold rule down the left edge. */}
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[#c8933f] transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon
                  className="mt-[1px] h-[17px] w-[17px] shrink-0"
                  style={{ color: active ? "#d3a052" : undefined }}
                  strokeWidth={1.8}
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium leading-tight">
                    {label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-[var(--shell-ink-soft)]/75">
                    {hint}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 px-4 py-4">
          {storageMode === "memory" && (
            <p
              title="No MONGODB_URI configured. Bundles live in memory and are lost when the server restarts."
              className="rounded-lg border border-[#c8933f]/30 bg-[#c8933f]/10 px-2.5 py-1.5 text-[10.5px] leading-snug text-[#e0bc7d]"
            >
              In-memory storage — bundles clear on restart
            </p>
          )}

          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-[12px] font-semibold text-[var(--shell-ink)]">
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

function Wordmark() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <Image
        src="/brand/param-mark.svg"
        alt=""
        width={34}
        height={34}
        className="rounded-[9px]"
      />
      <span className="leading-none">
        <span className="block text-[16px] font-black tracking-[0.16em] text-[var(--shell-ink)]">
          PARAM
        </span>
        <span className="mt-1 block text-[8.5px] font-semibold uppercase tracking-[0.17em] text-[#c8933f]">
          Pre Assessment Registry &amp; Audit Mitra
        </span>
      </span>
    </Link>
  );
}

function initials(name: string): string {
  const parts = name.replace(/^Adv\.?\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "PA";
}
