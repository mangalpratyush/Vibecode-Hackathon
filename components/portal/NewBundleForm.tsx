"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  FileUp,
  ScanSearch,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { CaseType, CourtId } from "@/lib/types";

/**
 * Upload, and nothing else required.
 *
 * The form used to demand a title, a court and a case type before it would take
 * a single file. That made PARAM look like it only worked for two courts, and
 * it asked an advocate to retype what is already printed on the first page of
 * their own petition.
 *
 * The documents are the input now. PARAM reads the court, the case number, the
 * cause title and the filing dates off them, and the advocate confirms all of
 * it at stage II against the exact line each value came from. The overrides
 * below stay available, collapsed, for a bundle that is unusual or a scan that
 * cannot be read.
 */

const UPLOAD_LIMIT = 4.4 * 1024 * 1024;

export default function NewBundleForm({
  courts,
  caseTypes,
}: {
  courts: { id: CourtId; name: string; short: string }[];
  caseTypes: CaseType[];
}) {
  const router = useRouter();
  const [court, setCourt] = useState<CourtId | "">("");
  const [caseTypeId, setCaseTypeId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);

  const forCourt = useMemo(
    () => (court ? caseTypes.filter((c) => c.court === court) : caseTypes),
    [caseTypes, court]
  );

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      return [...prev, ...incoming.filter((f) => !names.has(f.name))];
    });
    setError(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    if (!files.length) {
      setError("Add at least one PDF from the filing.");
      return;
    }
    /*
      The whole filing goes up in one request, and the host rejects a body over
      4.5 MB before the route ever runs. Caught here it is a sentence naming the
      files; caught there it is an opaque failure at the worst moment.
    */
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    if (totalBytes > UPLOAD_LIMIT) {
      setError(
        `That is ${(totalBytes / 1048576).toFixed(1)} MB of PDFs and the limit for one upload is ` +
          `${(UPLOAD_LIMIT / 1048576).toFixed(1)} MB. Upload the core filing first, then add the ` +
          `heavier annexures as a second filing.`
      );
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
      // Straight to verification. The scrutiny deliberately does not run yet:
      // the advocate confirms what PARAM read before anything computes on it.
      router.push(`/case/${data.bundleId}/extraction`);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  const totalMb = files.reduce((s, f) => s + f.size, 0) / (1024 * 1024);

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* ── The bundle. The only thing actually required. ── */}
      <section className="workspace-card overflow-hidden p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <FileText className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span>
              <span className="block text-[17px] font-bold text-ink">Your filing bundle</span>
              <span className="mt-0.5 block text-[12.5px] text-ink-soft">PDF documents in the order you intend to file them</span>
            </span>
          </div>
          <span className="hidden rounded-full border border-rule bg-[#fbf8f3] px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-soft sm:inline-flex">
            PDF only
          </span>
        </div>

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
          className={`group block cursor-pointer rounded-[18px] border-2 border-dashed px-6 py-9 text-center transition sm:py-10 ${
            dragging
              ? "scale-[1.01] border-[var(--brand)] bg-[var(--brand-soft)] shadow-[inset_0_0_0_1px_rgba(123,40,50,.08)]"
              : "border-[#d8ccc0] bg-[linear-gradient(145deg,#fbf7f1,#fffdfa)] hover:border-[var(--brand)]/45 hover:bg-[var(--brand-soft)]/45"
          }`}
        >
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-[var(--brand)] shadow-[0_12px_24px_-16px_rgba(82,36,40,.65)] ring-1 ring-[#dbcfc5] transition group-hover:-translate-y-0.5">
            <FileUp className="h-6 w-6" strokeWidth={1.8} />
          </span>
          <span className="mt-4 block font-serif text-[24px] font-semibold tracking-[-0.02em] text-ink">
            Drop the complete filing here
          </span>
          <span className="mx-auto mt-2 block max-w-lg text-[13.5px] leading-6 text-ink-soft">
            Petition, certified copy, vakalatnama, affidavit and every annexure.
          </span>
          <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_20px_-14px_rgba(123,40,50,.8)] transition group-hover:bg-[var(--brand-dark)]">
            Choose PDF files
            <FileUp className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="mt-3 block text-[11.5px] text-ink-soft/75">Multiple files supported · Keep annexure names as marked</span>
        </label>

        {files.length > 0 && (
          <div className="mt-5 rounded-2xl border border-rule bg-white p-2">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-[13px] font-semibold text-ink">
                {files.length} document{files.length === 1 ? "" : "s"}
              </span>
              <span className="num rounded-full bg-[#f4efe8] px-2.5 py-1 text-[11.5px] font-medium text-ink-soft">{totalMb.toFixed(1)} MB total</span>
            </div>
            <ul className="mt-1 space-y-1">
              {files.map((f) => (
                <li key={f.name} className="flex items-center gap-3 rounded-xl bg-[#faf7f2] px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[var(--brand)] ring-1 ring-rule">
                    <FileText className="h-4 w-4" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{f.name}</span>
                  <span className="num shrink-0 text-[12px] text-ink-soft">
                    {(f.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((x) => x.name !== f.name))}
                    aria-label={`Remove ${f.name}`}
                    className="shrink-0 rounded p-0.5 text-ink-soft transition hover:text-fatal"
                  >
                    <X className="h-[14px] w-[14px]" strokeWidth={2} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 grid overflow-hidden rounded-2xl border border-rule bg-[#f8f4ee] sm:grid-cols-4">
          {["Court", "Cause title", "Key dates", "Document types"].map((item) => (
            <span key={item} className="flex items-center gap-2 border-b border-rule px-3 py-3 text-[11.5px] font-medium text-ink-soft last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
              <Check className="h-3.5 w-3.5 shrink-0 text-pass" strokeWidth={2.3} />
              {item}
            </span>
          ))}
        </div>

        <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#fdf7ec] px-3.5 py-3 text-[12.5px] leading-5 text-ink-soft">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--gold)]" strokeWidth={2} />
          PARAM extracts these details first. Nothing is computed until you verify them on the next screen.
        </p>
      </section>

      {/* ── Overrides, for the awkward bundle. ── */}
      <section className="workspace-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowOverrides((v) => !v)}
          aria-expanded={showOverrides}
          className="flex w-full items-center gap-3.5 px-5 py-4.5 text-left transition hover:bg-[#fcfaf7] sm:px-6"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4efe8] text-ink-soft">
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span className="flex-1">
            <span className="block text-[14px] font-semibold text-ink">
              Manual details
            </span>
            <span className="mt-0.5 block text-[12px] text-ink-soft">
              Optional overrides for unusual or unreadable scans
            </span>
          </span>
          <ChevronDown
            className={`h-[16px] w-[16px] shrink-0 text-ink-soft transition-transform ${
              showOverrides ? "rotate-180" : ""
            }`}
            strokeWidth={2}
          />
        </button>

        {showOverrides && (
          <div className="space-y-4 border-t border-rule px-6 py-5">
            <label className="block">
              <span className="text-[12.5px] font-medium text-ink">Title</span>
              <input
                name="title"
                placeholder="Left blank, PARAM builds it from the cause title"
                className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2.5 text-[14px] outline-none transition placeholder:text-ink-soft/55 focus:border-[var(--brand)]/45"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-[12.5px] font-medium text-ink">Court</span>
                <select
                  name="court"
                  value={court}
                  onChange={(e) => {
                    setCourt(e.target.value as CourtId | "");
                    setCaseTypeId("");
                  }}
                  className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand)]/45"
                >
                  <option value="">Read it from the documents</option>
                  {courts
                    .filter((c) => c.id !== "OTHER")
                    .map((c) => (
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
                  className="mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2.5 text-[14px] outline-none transition focus:border-[var(--brand)]/45"
                >
                  <option value="">Read it from the documents</option>
                  {forCourt.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <p className="text-[12.5px] font-medium text-ink">Dates</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                Left blank, PARAM reads these off the certified copy&apos;s own
                endorsement. The applied-for and ready pair drives the s.12(2)
                exclusion, and time the court took before you applied is not
                excludable, so both matter.
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <DateField name="pronouncedOn" label="Impugned order pronounced" />
                <DateField name="filingOn" label="Intended date of filing" />
                <DateField name="copyAppliedOn" label="Certified copy applied for" />
                <DateField name="copyReadyOn" label="Certified copy ready" />
              </div>
            </div>
          </div>
        )}
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-fatal/30 bg-[var(--fatal-bg)] px-4 py-3 text-[13px] text-fatal"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <button
          type="submit"
          disabled={busy || !files.length}
          className="inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl bg-[var(--brand)] px-6 py-3 text-[14px] font-semibold text-white shadow-[0_14px_28px_-18px_rgba(123,40,50,.9)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-dark)] disabled:translate-y-0 disabled:opacity-50"
        >
          {busy ? "Reading the filing…" : "Analyse and verify bundle"}
          {!busy && <ArrowRight className="h-4 w-4" strokeWidth={2.2} />}
        </button>
        {busy && (
          <span className="flex items-center gap-2 text-[12.5px] text-ink-soft">
            <ScanSearch className="h-4 w-4 animate-pulse text-[var(--gold)]" strokeWidth={1.8} />
            Measuring every page. A large bundle takes a moment.
          </span>
        )}
      </div>
    </form>
  );
}

function DateField({ name, label }: { name: string; label: string }) {
  return (
    <label className="block">
      <span className="text-[12px] text-ink-soft">{label}</span>
      <input
        type="date"
        name={name}
        className="num mt-1 w-full rounded-lg border border-rule bg-white px-3 py-2 text-[13.5px] outline-none transition focus:border-[var(--brand)]/45"
      />
    </label>
  );
}
