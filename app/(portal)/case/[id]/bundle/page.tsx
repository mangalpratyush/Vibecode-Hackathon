import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Files, HardDrive, Layers, PlusCircle, ScanLine } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle } from "@/lib/store";
import { DOC_KIND_LABEL } from "@/lib/types";
import BundleReview from "@/components/portal/BundleReview";

export const dynamic = "force-dynamic";

/**
 * Stage I. What PARAM received.
 *
 * This stage had no page of its own. The rail pointed both "Bundle" and
 * "Verification" at /case/<id>/extraction, so clicking back to stage I landed
 * on stage II and read as a redirect.
 *
 * They are genuinely different questions. Stage I asks "did my files arrive,
 * whole and readable"; stage II asks "is what PARAM read off them correct".
 * Only the second is something to agree or disagree with, so this page asserts
 * nothing about the matter. It shows the paperbook as a physical object: how
 * many sheets, which of them a machine can read, and where the bad ones sit.
 * That is the check an advocate actually does on receiving a bundle back from
 * the typist, and it is worth doing before any rule is applied to it.
 */
export default async function BundleStage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email) notFound();

  const docs = bundle.documents;
  const pages = docs.reduce((n, d) => n + d.pageCount, 0);
  const bytes = docs.reduce((n, d) => n + d.sizeBytes, 0);
  const unreadable = docs.reduce(
    (n, d) => n + d.pages.filter((p) => p.charCount === 0 && !p.isBlank).length,
    0
  );

  const received = new Date(bundle.createdAt).toLocaleString("en-IN", {
    day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  const metrics = [
    { icon: Files, value: String(docs.length), label: docs.length === 1 ? "Document received" : "Documents received" },
    { icon: Layers, value: String(pages), label: pages === 1 ? "Sheet in the paperbook" : "Sheets in the paperbook" },
    { icon: HardDrive, value: fileSize(bytes), label: "Total size" },
    { icon: ScanLine, value: String(unreadable), label: unreadable === 1 ? "Sheet a machine cannot read" : "Sheets a machine cannot read" },
  ];

  return (
    <div className="portal-enter space-y-7">
      <header className="max-w-[49rem]">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#7b2832]/15 bg-white/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)] shadow-sm">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--brand)] text-[9px] text-white">01</span>
          Bundle
        </span>
        <h1 className="mt-4 font-serif text-[clamp(2.2rem,3.7vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">
          Everything PARAM
          <span className="block text-[var(--brand)]">received from you.</span>
        </h1>
        <p className="mt-4 max-w-[46rem] text-[16px] leading-7 text-ink-soft">
          {docs.length === 1 ? "One document was" : docs.length + " documents were"} read on {received}.
          Nothing here has been altered. Satisfy yourself the paperbook is complete and legible,
          then move on to verify what was read off it.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Bundle summary">
        {metrics.map(({ icon: Icon, value, label }, i) => (
          <div key={label} className="workspace-card flex items-center gap-3.5 px-4 py-3.5">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${i === 3 && unreadable > 0 ? "bg-[var(--objection-bg)] text-objection" : "bg-[#f4efe8] text-[var(--brand)]"}`}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span>
              <span className="num block text-[20px] font-bold leading-none text-ink">{value}</span>
              <span className="mt-1 block text-[11.5px] font-medium text-ink-soft">{label}</span>
            </span>
          </div>
        ))}
      </section>

      <BundleReview
        documents={docs.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          kindLabel: DOC_KIND_LABEL[d.kind],
          kindSource: d.kindSource,
          kindConfidence: d.kindConfidence,
          annexureMark: d.annexureMark ?? null,
          pageCount: d.pageCount,
          sizeBytes: d.sizeBytes,
          hasTextLayer: d.hasTextLayer,
          preview: d.pagesText[0]?.replace(/\s+/g, " ").slice(0, 320) ?? "",
          pages: d.pages.map((p) => ({
            pageNo: p.pageNo,
            charCount: p.charCount,
            wordCount: p.wordCount,
            isBlank: p.isBlank,
            script: p.script,
            effectiveDpi: p.effectiveDpi ?? null,
            printedPageNo: p.printedPageNo,
          })),
        }))}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/case/${bundle.id}/extraction`}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-3 text-[13.5px] font-semibold text-white shadow-[0_8px_18px_-12px_rgba(108,30,44,0.9)] transition hover:brightness-110"
        >
          Verify what PARAM read
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
        <Link
          href="/new"
          className="inline-flex items-center gap-2 rounded-xl border border-rule bg-paper-raised px-5 py-3 text-[13.5px] font-semibold text-ink transition hover:bg-[#f7f2eb]"
        >
          <PlusCircle className="h-4 w-4" strokeWidth={1.9} />
          Start another filing
        </Link>
      </div>
    </div>
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  const kb = bytes / 1024;
  if (kb < 1024) return Math.round(kb) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}
