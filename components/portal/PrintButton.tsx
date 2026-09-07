"use client";

/** Prints the defect memo. A memo that cannot leave the screen is half a tool. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-rule px-3.5 py-2 text-[12.5px] font-medium text-ink-soft transition hover:border-[var(--brand)]/35 hover:text-ink"
    >
      Print memo
    </button>
  );
}
