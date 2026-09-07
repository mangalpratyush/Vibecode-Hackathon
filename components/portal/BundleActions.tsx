"use client";

import { useState } from "react";

/**
 * The two things PARAM can do about a defect memo, rather than just report it:
 * rebuild the bundle, and draft the s.5 application.
 *
 * Both preview before they produce anything. The repair says how many pages it
 * would stamp and — more importantly — which pages it CANNOT renumber, because
 * PARAM can add text to a PDF but cannot remove text already in it. The draft
 * refuses outright when the filing is in time or the delay is past condoning,
 * and shows the refusal rather than hiding the button: knowing that no
 * application is needed is itself the answer.
 */

interface RepairPreview {
  totalPages: number;
  contents: { fileName: string; label: string; from: number; to: number }[];
  missing: string[];
  stamped: number;
  needsManualRepagination: { page: number; carries: number; shouldBe: number }[];
}

export default function BundleActions({
  bundleId,
  barred,
}: {
  bundleId: string;
  /** From the limitation computation, so the draft button reads honestly. */
  barred: boolean;
}) {
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [busy, setBusy] = useState<"repair" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function checkRepair() {
    setBusy("repair");
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not build the repair.");
      else setPreview(data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * Downloads go through a blob rather than a bare link so a 422 can be read
   * and shown. A plain <a href> would navigate the browser to a JSON error the
   * user has no way to interpret.
   */
  async function download(url: string, kind: "repair" | "draft", fallback: string) {
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? fallback);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        "param.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      setNote(`Downloaded ${a.download}.`);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="no-print card p-6">
      <h2 className="eyebrow">
        Act on this memo
      </h2>
      <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-ink-soft">
        PARAM will rebuild what is mechanical and draft what is formulaic. It will
        not touch translations, signatures, court fee or certified copies — those
        are defects only you can cure, and a file you have not read is not a file
        you should be filing.
      </p>

      <div className="mt-4 flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={checkRepair}
          disabled={busy !== null}
          className="rounded-lg border border-rule bg-paper px-4 py-2 text-[13px] font-medium text-ink transition hover:border-[var(--brand)]/40 disabled:opacity-50"
        >
          {busy === "repair" && !preview ? "Checking…" : "Preview repair"}
        </button>

        <button
          type="button"
          onClick={() =>
            download(
              `/api/fix?bundleId=${encodeURIComponent(bundleId)}`,
              "repair",
              "Could not build the repaired bundle."
            )
          }
          disabled={busy !== null}
          className="rounded-lg bg-[var(--brand)] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          {busy === "repair" ? "Working…" : "Download repaired bundle"}
        </button>

        <button
          type="button"
          onClick={() =>
            download(
              `/api/draft?bundleId=${encodeURIComponent(bundleId)}&kind=condonation`,
              "draft",
              "Could not draft the application."
            )
          }
          disabled={busy !== null}
          title={
            barred
              ? "Drafts the s.5 application with the day-by-day computation"
              : "On the dates supplied this filing is within time — PARAM will explain rather than draft"
          }
          className="rounded-lg border border-rule bg-paper px-4 py-2 text-[13px] font-medium text-ink transition hover:border-[var(--brand)]/40 disabled:opacity-50"
        >
          {busy === "draft" ? "Drafting…" : "Draft condonation application"}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-objection/30 bg-[var(--objection-bg)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-objection"
        >
          {error}
        </p>
      )}
      {note && (
        <p className="mt-4 rounded-lg border border-pass/30 bg-[var(--pass-bg)] px-3.5 py-2.5 text-[12.5px] text-pass">
          {note}
        </p>
      )}

      {preview && (
        <div className="mt-5 rounded-lg border border-rule bg-paper p-4">
          <p className="num text-[12.5px] text-ink">
            <strong className="font-semibold text-ink">{preview.totalPages} pages</strong>{" "}
            in paperbook order, index rebuilt from {preview.contents.length} documents
            {preview.stamped > 0 ? `, ${preview.stamped} page(s) newly numbered` : ""}.
          </p>

          {preview.missing.length > 0 && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-objection">
              Could not read back: {preview.missing.join(", ")}.
            </p>
          )}

          {preview.needsManualRepagination.length > 0 && (
            <div className="mt-3 rounded-lg bg-[var(--objection-bg)] px-3.5 py-3">
              <p className="text-[12px] font-semibold text-objection">
                {preview.needsManualRepagination.length} page(s) must be repaginated by
                hand
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                These pages already carry a printed number that no longer matches
                where they sit — the generated index sheet shifts the sequence.
                PARAM can add text to a PDF but cannot remove text already in it;
                stamping a second number would leave two in the footer and the
                bundle would still fail scrutiny. Renumber these at source:{" "}
                <span className="num">
                  {preview.needsManualRepagination
                    .slice(0, 12)
                    .map((p) => `sheet ${p.page}: carries ${p.carries}, should be ${p.shouldBe}`)
                    .join(", ")}
                  {preview.needsManualRepagination.length > 12 ? " …" : ""}
                </span>
              </p>
            </div>
          )}

          <ol className="mt-3 divide-y divide-rule overflow-hidden rounded-lg border border-rule">
            {preview.contents.map((c) => (
              <li
                key={c.fileName}
                className="flex items-center gap-3 bg-paper-raised px-3.5 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                  <span className="font-medium text-ink">{c.label}</span> — {c.fileName}
                </span>
                <span className="num shrink-0 text-[12px] text-ink-soft">
                  {c.from === c.to ? `p ${c.from}` : `pp ${c.from}–${c.to}`}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
