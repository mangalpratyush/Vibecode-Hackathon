"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SealImpression from "./SealImpression";
import {
  AlertCircle, ArrowDown, ArrowUpRight, Check, CheckCircle2, Copy, Download,
  Eye, FileCheck2, FilePenLine, Files, Hash, ListOrdered, Loader2, Scale,
  ShieldCheck, WandSparkles, X,
} from "lucide-react";

interface Redline {
  id: string; ruleId: string; documentName?: string; title: string;
  before: string; after: string; why: string; confidence: "high" | "medium" | "low";
  status: "proposed" | "accepted" | "rejected"; editedAfter?: string;
}
interface Declined { ruleId: string; title: string; reason: string }
interface RepairPreview {
  totalPages: number;
  indexPages: number;
  normalizedPages: number;
  warnings: { code: string; message: string; fileNames?: string[] }[];
  contents: { fileName: string; label: string; from: number; to: number }[];
  missing: string[]; stamped: number;
  /** Files that already print their own page numbers, kept for disclosure. */
  carryOwnPagination: { fileName: string; pages: number }[];
}
interface SealData {
  manifest: {
    sealedAt: string; bundleDigest: string;
    documents: { fileName: string; sha256: string; pages: number }[];
    rulebook: { version: string; verifiedRules: number };
    scrutiny: { verdict: string; score: number };
  };
  seal: string; algorithm: string;
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default function CurePanel({
  bundleId, barred, limitationComputed, initialRedlines, initialDeclined,
  verdict, score, documentCount, sealedAt,
}: {
  bundleId: string; barred: boolean; limitationComputed: boolean;
  initialRedlines: Redline[]; initialDeclined: Declined[];
  verdict: string; score: number; documentCount: number; sealedAt?: string;
}) {
  const [redlines, setRedlines] = useState(initialRedlines);
  const [declined, setDeclined] = useState(initialDeclined);
  const [preview, setPreview] = useState<RepairPreview | null>(null);
  const [seal, setSeal] = useState<SealData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [generated, setGenerated] = useState(initialRedlines.length > 0 || initialDeclined.length > 0);
  const pending = redlines.filter(r => r.status === "proposed");
  const accepted = redlines.filter(r => r.status === "accepted");
  const rejected = redlines.filter(r => r.status === "rejected");

  async function request(key: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(key); setError(null); setNote(null);
    try { await action(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not reach the server. Please try again."); }
    finally { setBusy(null); }
  }

  async function jsonResponse(response: Response) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
    return data;
  }

  function generate() {
    return request("redline", async () => {
      const data = await jsonResponse(await fetch("/api/redline", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleId }),
      }));
      setRedlines(data.redlines.redlines); setDeclined(data.redlines.declined); setGenerated(true);
      setNote("Correction review is ready. Review each proposal before recording your decision.");
    });
  }

  function decide(id: string, status: "accepted" | "rejected") {
    return request(id, async () => {
      await jsonResponse(await fetch("/api/redline", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId, redlineId: id, status }),
      }));
      setRedlines(current => current.map(r => r.id === id ? { ...r, status } : r));
      setNote(status === "accepted" ? "Decision saved. Apply the accepted wording to your source document." : "Rejection saved.");
    });
  }

  function previewRepair() {
    return request("preview", async () => {
      const data = await jsonResponse(await fetch("/api/fix", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleId }),
      }));
      setPreview(data);
    });
  }

  function download(url: string, key: string, fallback: string) {
    return request(key, async () => {
      if (key === "repair") {
        const plan = await jsonResponse(await fetch("/api/fix", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bundleId }),
        }));
        setPreview(plan);
      }
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? fallback);
      }
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "param.pdf";
      saveBlob(await res.blob(), name);
      setNote("Downloaded " + name + "." + (res.headers.get("X-Param-Review-Required") === "true" ? " Review the assembly notices below before filing." : ""));
    });
  }

  function issueSeal() {
    return request("seal", async () => {
      const data = await jsonResponse(await fetch("/api/seal?bundleId=" + encodeURIComponent(bundleId)));
      setSeal(data); setNote("Integrity seal issued for the stored documents and their recorded scrutiny result.");
    });
  }

  const repairUrl = "/api/fix?bundleId=" + encodeURIComponent(bundleId);
  const draftUrl = "/api/draft?bundleId=" + encodeURIComponent(bundleId) + "&kind=condonation";
  const certificateUrl = "/api/seal?bundleId=" + encodeURIComponent(bundleId) + "&format=pdf";

  // A seal is never cached: it is recomputed from the bytes on disk every time,
  // so the manifest does not survive a page reload even though the bundle
  // remembers that a seal was issued. Fetch it back quietly on return, or an
  // advocate who reloads sees their sealed filing reported as unsealed.
  useEffect(() => {
    if (!sealedAt) return;
    let live = true;
    fetch("/api/seal?bundleId=" + encodeURIComponent(bundleId))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d?.seal) setSeal(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [bundleId, sealedAt]);

  // Eight hex characters is what a person can actually read back over a phone
  // and compare against a certificate, so that is what the seal face carries.
  const digest = seal?.manifest.bundleDigest;
  const shortCode = digest ? `${digest.slice(0, 4)} · ${digest.slice(4, 8)}`.toUpperCase() : undefined;
  const issuedOn = seal ? new Date(seal.manifest.sealedAt) : sealedAt ? new Date(sealedAt) : null;
  const issuedLabel = issuedOn
    ? issuedOn.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "Not yet";

  return (
    <>
      <nav className="audit-task-nav no-print" aria-label="Cure and seal sections">
        <a href="#repair"><span>01</span>Prepare the bundle<ArrowDown /></a>
        <a href="#corrections"><span>02</span>Review corrections<ArrowDown /></a>
        <a href="#integrity"><span>03</span>Record integrity<ArrowDown /></a>
      </nav>
      {error && <div role="alert" className="audit-notice" data-tone="error"><AlertCircle /><span>{error}</span></div>}
      {note && <div role="status" className="audit-notice" data-tone="success"><CheckCircle2 /><span>{note}</span></div>}
      <div className="audit-split">
        <div className="audit-stack">
          <section className="audit-panel" id="repair">
            <header className="audit-panel-head">
              <div className="flex items-center gap-3"><span className="audit-icon"><Files /></span><div><h3 className="audit-panel-title">Prepare your paperbook</h3><p className="audit-sub">Rebuild the mechanical parts of your filing.</p></div></div>
              <span className="audit-badge">Document repair</span>
            </header>
            <div className="audit-repair-body">
              <div className="audit-repair-options">
                <div><Files /><span><strong>Document order</strong><p>Arrange the files in paperbook order.</p></span></div>
                <div><ListOrdered /><span><strong>Fresh index</strong><p>Generate an index from the actual pages.</p></span></div>
                <div><Hash /><span><strong>Consistent pagination</strong><p>Match the index, PDF pages and printed numbers.</p></span></div>
              </div>
              <div className="audit-actions">
                <button type="button" className="audit-btn" onClick={previewRepair} disabled={busy !== null}>{busy === "preview" ? <Loader2 className="animate-spin" /> : <Eye />}{busy === "preview" ? "Preparing preview…" : "Preview repair"}</button>
                <button type="button" className="audit-btn audit-btn-primary" onClick={() => download(repairUrl, "repair", "Could not prepare the repaired bundle.")} disabled={busy !== null}>{busy === "repair" ? <Loader2 className="animate-spin" /> : <Download />}{busy === "repair" ? "Preparing PDF…" : "Download repaired bundle"}</button>
              </div>
              <p className="audit-note">A4 pages, a linked index and document bookmarks. Source text and visible signature appearances are retained in a separate copy. This does not complete forms or certify filing readiness.</p>
            </div>
            {preview && <div className="audit-preview">
              {(preview.warnings?.length ?? 0) > 0 && <div className="audit-notice mb-4" role="status"><AlertCircle /><div><strong>Review before filing</strong><ul className="mt-2 space-y-3">{preview.warnings.map(w => <li key={w.code}>{w.message}{w.fileNames?.length ? <span className="block mt-1 text-[12px]">{w.fileNames.join(", ")}</span> : null}</li>)}</ul></div></div>}
              <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="audit-panel-title">Repair preview</h4><span className="audit-badge" data-tone="pass">{preview.totalPages} pages · {preview.stamped} newly numbered</span></div>
              {preview.missing.length > 0 && <div className="audit-notice mt-4" data-tone="error"><AlertCircle /><span>Files could not be read: {preview.missing.join(", ")}.</span></div>}
              <p className="audit-sub mt-3">{preview.indexPages} index {preview.indexPages === 1 ? "page" : "pages"} included in the numbering. All page ranges match the PDF page positions. {preview.normalizedPages} source pages placed on an A4 canvas.</p>
              {(preview.carryOwnPagination?.length ?? 0) > 0 && <details className="mt-4 audit-notice block"><summary className="cursor-pointer font-semibold">{preview.carryOwnPagination.length} documents already carry printed numbers</summary><p className="mt-2">Original numbering is preserved inside the source page. The separate header carries the continuous paperbook number, including the index.</p><ul className="mt-2 space-y-1">{preview.carryOwnPagination.map(f => <li key={f.fileName}>{f.fileName} · {f.pages} pages</li>)}</ul></details>}
              <table className="audit-table"><caption className="sr-only">Repaired paperbook contents</caption><thead><tr><th>Document</th><th className="text-right">Pages</th></tr></thead><tbody>{preview.contents.map((c,i) => <tr key={c.fileName + i}><td><strong className="font-semibold">{c.label}</strong><span className="block mt-1 text-ink-soft">{c.fileName}</span></td><td className="text-right whitespace-nowrap">{c.from === c.to ? c.from : c.from + "–" + c.to}</td></tr>)}</tbody></table>
            </div>}
            <div className="audit-draft"><Scale size={21} color="#a78147" /><div><h4>Condonation application</h4><p>{!limitationComputed ? "Eligibility depends on completing the limitation calculation." : barred ? "Request a draft with the delay calculation, subject to eligibility." : "The supplied dates are within time. PARAM will explain if a draft is unnecessary."}</p></div>
              <button type="button" className="audit-btn" disabled={busy !== null} onClick={() => download(draftUrl, "draft", "Could not prepare the application.")}>{busy === "draft" ? <Loader2 className="animate-spin" /> : <FilePenLine />}{busy === "draft" ? "Drafting…" : "Request draft"}</button>
            </div>
          </section>

          <section className="audit-panel" id="corrections">
            <header className="audit-panel-head">
              <div className="flex items-center gap-3"><span className="audit-icon"><FilePenLine /></span><div><h3 className="audit-panel-title">Corrections for your review</h3><p className="audit-sub">Compare proposed wording and record your decision.</p></div></div>
              <button type="button" className="audit-btn" onClick={generate} disabled={busy !== null}>{busy === "redline" ? <Loader2 className="animate-spin" /> : <WandSparkles />}{busy === "redline" ? "Reviewing…" : generated ? "Refresh proposals" : "Propose corrections"}</button>
            </header>
            {generated && <div className="audit-review-summary"><span><strong>{pending.length}</strong>Awaiting review</span><span><strong>{accepted.length}</strong>Accepted</span><span><strong>{rejected.length}</strong>Rejected</span></div>}
            {!redlines.length && <div className="audit-empty"><FilePenLine /><h3>{generated ? "No wording changes proposed" : "Your review starts here"}</h3><p>{generated ? "See any items requiring manual work below. You can refresh proposals after reviewing the filing." : "PARAM will compare the filing with the findings and propose specific corrections for you to approve."}</p></div>}
            {[...pending, ...accepted, ...rejected].map(r => <RedlineCard key={r.id} redline={r} onDecide={decide} busy={busy} />)}
            {declined.length > 0 && <div className="audit-preview"><h4 className="audit-panel-title">Requires manual work</h4><p className="audit-sub">These items could not be drafted automatically.</p><ul className="mt-4 space-y-4">{declined.map((d,i) => <li key={d.ruleId + i}><p className="text-[14px] font-semibold">{d.title}</p><p className="audit-sub">{d.reason}</p></li>)}</ul></div>}
            <p className="audit-note px-6 py-4 border-t border-rule">Accepting a proposal records your decision. Apply it to your source document before filing. Signatures, translations, court fee and certified copies require your attention.</p>
          </section>
          {seal && <SealRegister seal={seal} />}
        </div>

        <aside className="audit-stack" id="integrity">
          <section className="audit-seal" data-sealed={seal ? "yes" : "no"}>
            <header className="audit-seal-head">
              <p className="audit-kicker">Filing integrity</p>
              <span className="audit-seal-state">{seal ? "Issued" : sealedAt ? "Reissue" : "Not issued"}</span>
            </header>
            <SealImpression sealed={Boolean(seal)} busy={busy === "seal" || (Boolean(sealedAt) && !seal)} code={shortCode} />
            <h3>{seal ? "A record you can verify." : "Preserve the record."}</h3>
            <p>{seal
              ? "These files, as they stand now, are fixed to the assessment below. Any later edit will fail verification."
              : "Fix the exact documents and their scrutiny result in a form that makes later changes detectable."}</p>
            <dl className="audit-seal-facts">
              <div><dt>Documents</dt><dd>{documentCount} covered</dd></div>
              <div><dt>Assessment</dt><dd>{verdict.replaceAll("_", " ").toLowerCase()} · {score}/100</dd></div>
              <div><dt>Algorithm</dt><dd>{seal ? seal.algorithm : "HMAC-SHA256"}</dd></div>
              <div><dt>{seal ? "Issued" : "Last issued"}</dt><dd>{issuedLabel}</dd></div>
            </dl>
            <button type="button" className="audit-btn audit-btn-gold" disabled={busy !== null} onClick={issueSeal}>{busy === "seal" ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{busy === "seal" ? "Issuing seal…" : seal ? "Reissue seal" : "Issue integrity seal"}</button>
            {(seal || sealedAt) && <div className="audit-seal-actions">
              <button type="button" className="audit-btn audit-btn-quiet" disabled={busy !== null} onClick={() => download(certificateUrl, "cert", "Could not render the certificate.")}>{busy === "cert" ? <Loader2 className="animate-spin" /> : <FileCheck2 />}Certificate</button>
              {seal && <button type="button" className="audit-btn audit-btn-quiet" onClick={() => { saveBlob(new Blob([JSON.stringify(seal, null, 2)], { type: "application/json" }), "param-integrity-manifest.json"); setNote("Manifest downloaded. Use it with the original files on the verification page."); }} disabled={busy !== null}><Download />Manifest</button>}
            </div>}
            <Link href="/verify" target="_blank" className="audit-seal-link">Open public verification<ArrowUpRight /></Link>
            <p className="audit-note">This is an integrity seal. It proves the documents have not changed since sealing. It does not cure a defect and it is not a digital signature.</p>
          </section>
          <div className="audit-side-note"><strong>Working on a corrected version?</strong>Upload it as a new bundle and rerun the review. Downloads and approved wording do not replace the files stored in this case.<Link href="/new" className="inline-flex mt-3 items-center gap-1 font-semibold text-[var(--brand)]">Upload corrected bundle<ArrowUpRight size={14} /></Link></div>
        </aside>
      </div>
    </>
  );
}

function RedlineCard({ redline: r, onDecide, busy }: {
  redline: Redline;
  onDecide: (id: string, status: "accepted" | "rejected") => Promise<void>;
  busy: string | null;
}) {
  return (
    <article className="audit-redline">
      <div className="flex flex-wrap justify-between items-center gap-2"><span className="audit-badge" data-tone={r.status === "accepted" ? "pass" : r.status === "proposed" ? "advisory" : undefined}>{r.status === "proposed" ? "Awaiting your approval" : r.status === "accepted" ? "Accepted" : "Rejected"}</span><span className="audit-note">{r.confidence} confidence · {r.ruleId}</span></div>
      <h4>{r.title}</h4>
      {r.documentName && <p className="flex items-center gap-1.5"><Files size={13} />{r.documentName}</p>}
      {r.why && <p>{r.why}</p>}
      <div className="audit-diff">
        <div><h5>Current wording</h5><del>{r.before || "No existing wording"}</del></div>
        <div><h5>Proposed correction</h5><ins>{r.editedAfter ?? r.after}</ins></div>
      </div>
      {r.status === "proposed" ? <div className="audit-actions">
        <button type="button" className="audit-btn audit-btn-primary" disabled={busy !== null} onClick={() => onDecide(r.id, "accepted")}>{busy === r.id ? <Loader2 className="animate-spin" /> : <Check />}Accept correction</button>
        <button type="button" className="audit-btn" disabled={busy !== null} onClick={() => onDecide(r.id, "rejected")}><X />Reject</button>
      </div> : <p className="flex items-center gap-2">{r.status === "accepted" ? <><CheckCircle2 size={16} color="#3c7952" />Accepted. Apply the correction to your source document.</> : <><X size={16} />This proposal was rejected.</>}</p>}
    </article>
  );
}

/**
 * The register of what was sealed.
 *
 * The earlier version printed both hashes as one wall of hex, which is the
 * least useful way to show a fingerprint: nobody reads 64 characters, they
 * compare the first few and the last few against a certificate. So each row
 * shows the head and tail of its digest with the middle elided, and copies the
 * whole thing when asked.
 */
function SealRegister({ seal }: { seal: SealData }) {
  const m = seal.manifest;
  return (
    <section className="audit-panel audit-register" aria-label="Sealed document register">
      <header className="audit-panel-head">
        <div className="flex items-center gap-3">
          <span className="audit-icon audit-icon-gold"><ShieldCheck /></span>
          <div>
            <h3 className="audit-panel-title">Sealed on {new Date(m.sealedAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}</h3>
            <p className="audit-sub">{m.documents.length} documents fixed against {m.rulebook.version}, {m.rulebook.verifiedRules} verified rules.</p>
          </div>
        </div>
        <span className="audit-badge" data-tone="pass"><ShieldCheck />Recorded</span>
      </header>

      <div className="audit-register-top">
        <Fingerprint label="Bundle digest" value={m.bundleDigest} />
        <Fingerprint label={"Seal (" + seal.algorithm + ")"} value={seal.seal} />
      </div>

      <table className="audit-table">
        <caption className="sr-only">Document fingerprints recorded in this seal</caption>
        <thead><tr><th>Document</th><th>Fingerprint (SHA-256)</th><th className="text-right">Pages</th></tr></thead>
        <tbody>{m.documents.map((d) => (
          <tr key={d.fileName}>
            <td><strong className="font-semibold">{d.fileName}</strong></td>
            <td><Fingerprint value={d.sha256} compact /></td>
            <td className="text-right whitespace-nowrap">{d.pages}</td>
          </tr>
        ))}</tbody>
      </table>

      <p className="audit-note px-6 py-4 border-t border-rule">Anyone holding these files can reproduce every fingerprint above. A single changed byte changes the digest, which is how alteration is detected.</p>
    </section>
  );
}

/** One digest, abbreviated for reading and copyable in full. */
function Fingerprint({ value, label, compact }: { value: string; label?: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const shown = value.length > 24 ? value.slice(0, 10) + "…" + value.slice(-10) : value;
  return (
    <div className="audit-print" data-compact={compact ? "yes" : undefined}>
      {label && <span className="audit-print-label">{label}</span>}
      <code>{shown}</code>
      <button type="button" className="audit-print-copy" aria-label={"Copy " + (label ?? "fingerprint")}
        onClick={() => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
  );
}
