"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  FileText,
  FileWarning,
  Quote,
  Save,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/types";

interface DocRow {
  id: string;
  fileName: string;
  kind: DocKind;
  kindLabel: string;
  kindSource: string;
  kindConfidence: number;
  annexureMark: string | null;
  pageCount: number;
  hasTextLayer: boolean;
  preview: string;
}

const DATE_FIELDS = [
  {
    key: "pronouncedOn",
    label: "Order pronounced",
    note: "The day itself is excluded under section 12(1).",
  },
  {
    key: "copyAppliedOn",
    label: "Certified copy applied for",
    note: "The section 12(2) exclusion begins here.",
  },
  {
    key: "copyReadyOn",
    label: "Certified copy ready",
    note: "The copy preparation exclusion ends here.",
  },
  {
    key: "filingOn",
    label: "Intended filing date",
    note: "Used to measure the filing against the last permissible date.",
  },
] as const;

const KINDS = Object.keys(DOC_KIND_LABEL) as DocKind[];

export default function ExtractionReview({
  bundleId,
  documents: initialDocs,
  dates: initialDates,
  dateEvidence,
  confirmedAt,
  needsLimitationDates = true,
}: {
  bundleId: string;
  needsLimitationDates?: boolean;
  documents: DocRow[];
  dates: Record<string, string | undefined>;
  dateEvidence: Record<string, string | undefined>;
  confirmedAt: string | null;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocs);
  const [dates, setDates] = useState<Record<string, string>>(
    Object.fromEntries(DATE_FIELDS.map((field) => [field.key, initialDates[field.key] ?? ""]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const lowConfidence = docs.filter(
    (document) => document.kindConfidence < 78 || document.kind === "UNKNOWN"
  );
  const noTextLayer = docs.filter((document) => !document.hasTextLayer);
  const missingDates = DATE_FIELDS.filter(
    (field) => needsLimitationDates && field.key === "pronouncedOn" && !dates[field.key]
  );
  const issueCount = lowConfidence.length + noTextLayer.length + missingDates.length;

  function setKind(id: string, kind: DocKind) {
    setDocs((current) =>
      current.map((document) =>
        document.id === id
          ? {
              ...document,
              kind,
              kindLabel: DOC_KIND_LABEL[kind],
              kindSource: "user",
              kindConfidence: 100,
            }
          : document
      )
    );
    setDirty(true);
  }

  async function save(confirm: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/bundle/${bundleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmExtraction: confirm,
          dates: Object.fromEntries(
            DATE_FIELDS.map((field) => [field.key, dates[field.key] || null])
          ),
          documents: docs.map((document) => ({
            id: document.id,
            kind: document.kind,
            annexureMark: document.annexureMark,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Could not save those corrections.");
        return;
      }
      setDirty(false);
      if (confirm) router.push(`/case/${bundleId}/score`);
      else router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section
        className={`flex flex-col gap-4 rounded-[18px] border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${
          issueCount
            ? "border-objection/25 bg-[var(--objection-bg)]"
            : "border-pass/20 bg-[var(--pass-bg)]"
        }`}
      >
        <div className="flex items-start gap-3.5">
          <span
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/75 ${
              issueCount ? "text-objection" : "text-pass"
            }`}
          >
            {issueCount ? (
              <AlertTriangle className="h-[19px] w-[19px]" strokeWidth={2} />
            ) : (
              <CheckCircle2 className="h-[19px] w-[19px]" strokeWidth={2} />
            )}
          </span>
          <div>
            <h2 className="text-[14.5px] font-bold text-ink">
              {issueCount
                ? `${issueCount} ${issueCount === 1 ? "detail needs" : "details need"} your attention`
                : "PARAM found a complete, readable extraction"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-5 text-ink-soft">
              {issueCount
                ? "Review the highlighted fields below before you approve the filing for scrutiny."
                : "You should still compare the extracted details with the source documents before approval."}
            </p>
          </div>
        </div>

        {issueCount > 0 && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {lowConfidence.length > 0 && <IssuePill>{lowConfidence.length} classifications</IssuePill>}
            {noTextLayer.length > 0 && <IssuePill>{noTextLayer.length} scans need OCR review</IssuePill>}
            {missingDates.length > 0 && <IssuePill>{missingDates.length} missing dates</IssuePill>}
          </div>
        )}
      </section>

      {needsLimitationDates && <section className="workspace-card overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-5 sm:px-6">
          <div className="flex gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <CalendarDays className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="text-[18px] font-bold text-ink">Dates that determine limitation</h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-ink-soft">
                Confirm the order date and add other dates where applicable. An empty field is not an extracted date.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-[#ddcdaF] bg-[#fbf6ec] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.13em] text-[#8c6427]">
            Limitation Act, 1963
          </span>
        </header>

        <div className="grid gap-4 p-5 sm:p-6 xl:grid-cols-2">
          {DATE_FIELDS.map((field) => {
            const evidence = dateEvidence[field.key];
            const source = initialDates.source
              ? (initialDates.source as unknown as Record<string, string>)[field.key]
              : undefined;
            const missing = !dates[field.key];

            return (
              <article
                key={field.key}
                className={`rounded-2xl border p-4 transition ${
                  missing
                    ? "border-objection/35 bg-[var(--objection-bg)]/45"
                    : "border-rule bg-[#fbf8f3]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor={field.key} className="text-[14px] font-bold text-ink">
                    {field.label}
                  </label>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${
                      missing ? "bg-white text-objection" : "bg-[var(--pass-bg)] text-pass"
                    }`}
                  >
                    {missing ? (
                      <AlertTriangle className="h-3 w-3" strokeWidth={2.2} />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2.2} />
                    )}
                    {missing ? (field.key === "pronouncedOn" ? "Required" : "Not supplied") : source === "user" || dates[field.key] !== initialDates[field.key] ? "Entered" : evidence ? "Extracted" : "Supplied"}
                  </span>
                </div>

                <input
                  id={field.key}
                  type="date"
                  value={dates[field.key]}
                  onChange={(event) => {
                    setDates((current) => ({ ...current, [field.key]: event.target.value }));
                    setDirty(true);
                  }}
                  className="num mt-3 h-11 w-full rounded-xl border border-[#d8cdc3] bg-white px-3.5 text-[14px] font-medium text-ink outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/8"
                />
                <p className="mt-2 text-[11.5px] leading-5 text-ink-soft">{field.note}</p>

                <div className="mt-3 border-t border-rule pt-3">
                  {evidence ? (
                    <>
                      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-soft">
                        <Quote className="h-3 w-3 text-[var(--gold)]" strokeWidth={2} />
                        Source in bundle
                      </p>
                      <p className="mt-2 line-clamp-3 rounded-xl border-l-2 border-[var(--gold)] bg-white px-3 py-2 text-[11.5px] leading-[1.55] text-[#514842]">
                        {evidence}
                      </p>
                    </>
                  ) : source === "user" ? (
                    <p className="text-[12px] text-ink-soft">Supplied manually during intake.</p>
                  ) : (
                    <p className="text-[12px] leading-5 text-ink-soft/75">
                      No source line was found. Enter the date from the record if available.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>}

      <section className="workspace-card overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule px-5 py-5 sm:px-6">
          <div className="flex gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#edf2f6] text-[var(--navy)]">
              <FileCheck2 className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="text-[18px] font-bold text-ink">Bundle classification</h2>
              <p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-ink-soft">
                Confirm each document type. The scrutiny engine runs only the rules relevant to that type.
              </p>
            </div>
          </div>
          <span className="num rounded-full bg-[#f4efe8] px-3 py-1.5 text-[11px] font-semibold text-ink-soft">
            {docs.length} {docs.length === 1 ? "document" : "documents"}
          </span>
        </header>

        <ol className="divide-y divide-rule">
          {docs.map((document, index) => {
            const unsure = document.kindConfidence < 78 || document.kind === "UNKNOWN";
            return (
              <li
                key={document.id}
                className={`grid gap-4 px-5 py-4 transition hover:bg-[#fcfaf6] sm:px-6 lg:grid-cols-[minmax(0,1fr)_14rem] lg:items-center ${
                  unsure ? "bg-[var(--objection-bg)]/24" : ""
                }`}
              >
                <div className="flex min-w-0 gap-3.5">
                  <span className="num mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4efe8] text-[11px] font-bold text-ink-soft">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-[var(--brand)]" strokeWidth={1.8} />
                      <span className="max-w-full truncate text-[14px] font-semibold text-ink">
                        {document.fileName}
                      </span>
                      {!document.hasTextLayer && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--fatal-bg)] px-2 py-1 text-[10px] font-semibold text-fatal">
                          <ScanLine className="h-3 w-3" strokeWidth={2} />
                          No text layer
                        </span>
                      )}
                    </div>
                    <p className="num mt-1.5 text-[11.5px] text-ink-soft">
                      {document.pageCount} {document.pageCount === 1 ? "page" : "pages"}
                      <span className="mx-2 text-ink-soft/35">•</span>
                      {document.kindSource === "user" ? (
                        <span className="font-medium text-pass">Confirmed by you</span>
                      ) : (
                        <span className={unsure ? "font-medium text-objection" : ""}>
                          {document.kindConfidence}% classification confidence
                        </span>
                      )}
                    </p>
                    {document.preview && (
                      <p className="mt-1.5 line-clamp-1 text-[11.5px] italic text-ink-soft/70">
                        {document.preview}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-ink-soft">
                    Document type
                  </label>
                  <select
                    aria-label={`Document type for ${document.fileName}`}
                    value={document.kind}
                    onChange={(event) => setKind(document.id, event.target.value as DocKind)}
                    className={`h-10 w-full rounded-xl border bg-white px-3 text-[13px] font-medium outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/8 ${
                      unsure ? "border-objection/45 text-objection" : "border-[#d8cdc3] text-ink"
                    }`}
                  >
                    {KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {DOC_KIND_LABEL[kind]}
                      </option>
                    ))}
                  </select>
                  {document.kind === "ANNEXURE" && (
                    <p className="num mt-1.5 text-[11px] text-ink-soft">
                      Mark: {document.annexureMark ?? "Not detected"}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {error && (
        <p
          role="alert"
          className="flex items-center gap-2.5 rounded-xl border border-fatal/25 bg-[var(--fatal-bg)] px-4 py-3 text-[13px] font-medium text-fatal"
        >
          <FileWarning className="h-4 w-4 shrink-0" strokeWidth={2} />
          {error}
        </p>
      )}

      <div className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-[18px] border border-[#d9cec4] bg-[#fffdf9]/95 p-4 shadow-[0_18px_50px_-24px_rgba(36,31,30,.55)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
            <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.9} />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-ink">
              {confirmedAt ? "This extraction was previously approved" : "Ready for your approval"}
            </span>
            <span className="mt-0.5 block text-[11.5px] text-ink-soft">
              Approval records these inputs and starts Registry scrutiny.
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {dirty && (
            <button
              type="button"
              onClick={() => save(false)}
              disabled={busy}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-rule bg-white px-4 text-[13px] font-semibold text-ink transition hover:border-[var(--brand)]/35 disabled:opacity-60"
            >
              <Save className="h-4 w-4" strokeWidth={1.9} />
              Save changes
            </button>
          )}
          <button
            type="button"
            onClick={() => save(true)}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-[13px] font-semibold text-white shadow-[0_12px_24px_-16px_rgba(123,40,50,.9)] transition hover:-translate-y-0.5 hover:bg-[var(--brand-dark)] disabled:translate-y-0 disabled:opacity-60"
          >
            {busy ? "Running scrutiny…" : "Approve and run scrutiny"}
            {!busy && <ArrowRight className="h-4 w-4" strokeWidth={2.2} />}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssuePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-objection/20 bg-white/70 px-2.5 py-1 text-[10.5px] font-semibold text-objection">
      {children}
    </span>
  );
}
