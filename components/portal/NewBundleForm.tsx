"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseType, CourtId } from "@/lib/types";

/**
 * Bundle intake.
 *
 * The date fields are deliberately prominent and explained. The certified copy
 * applied-on / ready-on pair is the input almost every limitation calculator
 * omits, and it is the one that decides most appeals — so the form says why it
 * is asking, rather than presenting three unlabelled date boxes.
 */

export default function NewBundleForm({
  courts,
  caseTypes,
}: {
  courts: { id: CourtId; name: string; short: string }[];
  caseTypes: CaseType[];
}) {
  const router = useRouter();
  const [court, setCourt] = useState<CourtId>("SUPREME_COURT");
  const [caseTypeId, setCaseTypeId] = useState("SLP_CIVIL");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const forCourt = useMemo(
    () => caseTypes.filter((c) => c.court === court),
    [caseTypes, court]
  );
  const active = caseTypes.find((c) => c.id === caseTypeId);

  function pickCourt(id: CourtId) {
    setCourt(id);
    const first = caseTypes.find((c) => c.court === id);
    if (first) setCaseTypeId(first.id);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!files.length) {
      setError("Add at least one PDF to scrutinise.");
      return;
    }
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    fd.delete("files");
    for (const f of files) fd.append("files", f);

    try {
      const res = await fetch("/api/bundle", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        setBusy(false);
        return;
      }
      await fetch("/api/scrutiny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: data.bundleId }),
      });
      router.push(`/scrutiny/${data.bundleId}`);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  const totalMb = files.reduce((s, f) => s + f.size, 0) / (1024 * 1024);

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* ── Matter ── */}
      <section className="card space-y-4 p-6">
        <h2 className="eyebrow">
          The matter
        </h2>

        <label className="block">
          <span className="text-[12.5px] font-medium text-ink">Title</span>
          <input
            name="title"
            required
            placeholder="Sharma v. State of Delhi — SLP against judgment dt. 12.05.2026"
            className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand)]/45"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12.5px] font-medium text-ink">Court</span>
            <select
              name="court"
              value={court}
              onChange={(e) => pickCourt(e.target.value as CourtId)}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand)]/45"
            >
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[12.5px] font-medium text-ink">Case type</span>
            <select
              name="caseTypeId"
              value={caseTypeId}
              onChange={(e) => setCaseTypeId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand)]/45"
            >
              {forCourt.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {active && (
          <p className="rounded-lg bg-[var(--brand)]/5 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-soft">
            {active.limitationDays === null ? (
              <>No fixed period of limitation. {active.limitationSource}</>
            ) : (
              <>
                Prescribed period{" "}
                <strong className="num font-semibold text-ink">
                  {active.limitationDays} days
                </strong>
                . {active.limitationSource}
                {active.outerLimitNote ? ` ${active.outerLimitNote}` : ""}
              </>
            )}
          </p>
        )}
      </section>

      {/* ── Dates ── */}
      <section className="card space-y-4 p-6">
        <div>
          <h2 className="eyebrow">
            Dates
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            <strong className="font-medium text-ink">All optional.</strong> Leave a
            field blank and PARAM reads it off the certified copy&apos;s own
            endorsement; anything you type here wins over what it finds. The
            certified copy pair drives the s.12(2) exclusion — time the court took to
            prepare the order <em>before</em> you applied is not excludable, so both
            dates matter.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <DateField
            name="pronouncedOn"
            label="Impugned order pronounced on"
            hint="Excluded under s.12(1)."
          />
          <DateField
            name="filingOn"
            label="Intended date of filing"
            hint="Defaults to today."
          />
          <DateField
            name="copyAppliedOn"
            label="Certified copy applied for on"
            hint="Exclusion runs from here."
          />
          <DateField
            name="copyReadyOn"
            label="Certified copy ready on"
            hint="Exclusion runs to here."
          />
        </div>
      </section>

      {/* ── Files ── */}
      <section className="card space-y-4 p-6">
        <h2 className="eyebrow">
          The bundle
        </h2>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`block cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging ? "border-[var(--brand)] bg-[var(--brand-soft)]" : "border-rule bg-paper hover:border-[var(--brand)]/40"
          }`}
        >
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <p className="text-[14px] font-medium text-ink">
            Drop the filing PDFs here, or click to choose
          </p>
          <p className="mt-1.5 text-[12.5px] text-ink-soft">
            Petition, certified copy, vakalatnama, affidavit, synopsis, annexures —
            name annexure files as you mark them (Annexure P-3.pdf) and PARAM will
            reconcile them against the petition.
          </p>
        </label>

        {files.length > 0 && (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[12.5px] font-medium text-ink">
                {files.length} file{files.length === 1 ? "" : "s"}
              </span>
              <span className="num text-[12px] text-ink-soft">
                {totalMb.toFixed(1)} MB
              </span>
            </div>
            <ul className="divide-y divide-rule overflow-hidden rounded-lg border border-rule">
              {files.map((f) => (
                <li
                  key={f.name}
                  className="flex items-center gap-3 bg-paper px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {f.name}
                  </span>
                  <span className="num shrink-0 text-[12px] text-ink-soft">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((prev) => prev.filter((x) => x.name !== f.name))
                    }
                    aria-label={`Remove ${f.name}`}
                    className="shrink-0 rounded px-1.5 text-ink-soft transition hover:text-fatal"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-fatal/25 bg-[var(--fatal-bg)] px-4 py-3 text-[13px] text-fatal"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--brand)] px-5 py-2.5 text-[13.5px] font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          {busy ? "Scrutinising…" : "Run scrutiny"}
        </button>
        {busy && (
          <span className="text-[12.5px] text-ink-soft">
            Measuring every page — this takes a moment on a large bundle.
          </span>
        )}
      </div>
    </form>
  );
}

function DateField({
  name,
  label,
  hint,
}: {
  name: string;
  label: string;
  hint: string;
}) {
  return (
    <label className="block">
      <span className="text-[12.5px] font-medium text-ink">{label}</span>
      <input
        type="date"
        name={name}
        className="num mt-1 w-full rounded-lg border border-rule bg-paper px-3 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand)]/45"
      />
      <span className="mt-1 block text-[11.5px] text-ink-soft">{hint}</span>
    </label>
  );
}
