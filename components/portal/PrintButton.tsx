"use client";

import { Printer } from "lucide-react";

/** Prints the defect memo. A memo that cannot leave the screen is half a tool. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-11 items-center gap-2 rounded-xl border border-rule bg-white/80 px-4 text-[13px] font-semibold text-ink-soft shadow-sm transition hover:border-[var(--brand)]/35 hover:text-[var(--brand)]"
    >
      <Printer className="h-4 w-4" strokeWidth={1.8} />
      Print memo
    </button>
  );
}
