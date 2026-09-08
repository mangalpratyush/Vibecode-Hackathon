"use client";

import { useState } from "react";
import { AlertOctagon, CheckCircle2, FileWarning, ShieldCheck } from "lucide-react";

/**
 * The verifier, for someone who has the filing and the seal and no account.
 *
 * The result is deliberately blunt. There are three outcomes and they mean very
 * different things, so each gets its own stamp rather than a shared banner with
 * a colour swap: verified, altered, or the seal itself does not check out. The
 * third is the one people miss, and it is the most serious, because it means
 * the record of what was cleared has itself been edited.
 */

interface DocResult {
  fileName: string;
  status: "match" | "altered" | "missing" | "unexpected";
  expected?: string;
  actual?: string;
}

interface Result {
  verdict: "VERIFIED" | "ALTERED" | "SEAL_INVALID";
  sealValid: boolean;
  documentsMatch: boolean;
  documents: DocResult[];
  summary: string;
}

const STATUS_LABEL: Record<DocResult["status"], string> = {
  match: "unchanged",
  altered: "ALTERED",
  missing: "not supplied",
  unexpected: "not in the seal",
};

export default function VerifyForm() {
  const [manifest, setManifest] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!manifest) {
      setError("Add the seal file first.");
      return;
    }
    if (!files.length) {
      setError("Add the bundle documents to check against the seal.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("manifest", await manifest.text());
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/verify", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not verify that.");
      else setResult(data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card space-y-5 p-6">
        <div>
          <label className="text-[12.5px] font-semibold text-ink">
            1 · The seal
            <span className="ml-2 font-normal text-ink-soft">
              the JSON PARAM issued when it sealed the bundle
            </span>
          </label>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              setManifest(e.target.files?.[0] ?? null);
              setResult(null);
            }}
            className="mt-2 block w-full text-[12.5px] text-ink-soft file:mr-3 file:rounded-lg file:border file:border-rule file:bg-white file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-ink hover:file:border-[var(--brand)]/40"
          />
        </div>

        <div>
          <label className="text-[12.5px] font-semibold text-ink">
            2 · The bundle
            <span className="ml-2 font-normal text-ink-soft">
              every document the seal covers
            </span>
          </label>
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setResult(null);
            }}
            className="mt-2 block w-full text-[12.5px] text-ink-soft file:mr-3 file:rounded-lg file:border file:border-rule file:bg-white file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-ink hover:file:border-[var(--brand)]/40"
          />
          {files.length > 0 && (
            <p className="num mt-2 text-[11.5px] text-ink-soft">
              {files.length} document{files.length === 1 ? "" : "s"} selected
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-fatal/30 bg-[var(--fatal-bg)] px-3.5 py-2.5 text-[12.5px] text-fatal"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          <ShieldCheck className="h-[15px] w-[15px]" strokeWidth={2} />
          {busy ? "Checking…" : "Verify"}
        </button>
      </form>

      {result && <Outcome result={result} />}
    </div>
  );
}

function Outcome({ result }: { result: Result }) {
  const tone =
    result.verdict === "VERIFIED"
      ? { colour: "var(--pass)", wash: "var(--pass-bg)", Icon: CheckCircle2, label: "Verified" }
      : result.verdict === "ALTERED"
        ? { colour: "var(--fatal)", wash: "var(--fatal-bg)", Icon: FileWarning, label: "Altered" }
        : {
            colour: "var(--fatal)",
            wash: "var(--fatal-bg)",
            Icon: AlertOctagon,
            label: "Seal invalid",
          };

  return (
    <section
      className="rounded-2xl border px-6 py-6"
      style={{ background: tone.wash, borderColor: `color-mix(in srgb, ${tone.colour} 30%, transparent)` }}
    >
      <div className="flex flex-wrap items-center gap-5">
        <span style={{ color: tone.colour }}>
          <span className="stamp text-[15px]">{tone.label}</span>
        </span>
        <tone.Icon
          className="h-6 w-6 shrink-0"
          style={{ color: tone.colour }}
          strokeWidth={1.8}
        />
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-ink">
          {result.summary}
        </p>
      </div>

      {result.verdict === "SEAL_INVALID" && (
        <p className="mt-4 border-t pt-4 text-[12.5px] leading-relaxed text-ink-soft"
           style={{ borderColor: `color-mix(in srgb, ${tone.colour} 25%, transparent)` }}>
          This is the serious one. It does not mean a document changed, it means the record
          of what PARAM cleared has itself been edited, or the seal came from somewhere
          else. Treat the certificate as unreliable.
        </p>
      )}

      <ul className="mt-5 divide-y divide-black/5 border-y border-black/5">
        {result.documents.map((d) => (
          <li
            key={d.fileName + d.status}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
              {d.fileName}
            </span>
            <span
              className="num text-[11px] font-semibold uppercase tracking-wide"
              style={{
                color: d.status === "match" ? "var(--pass)" : "var(--fatal)",
              }}
            >
              {STATUS_LABEL[d.status]}
            </span>
            {d.status === "altered" && (
              <span className="num w-full break-all font-mono text-[10.5px] text-ink-soft">
                sealed {d.expected?.slice(0, 24)}… · now {d.actual?.slice(0, 24)}…
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
