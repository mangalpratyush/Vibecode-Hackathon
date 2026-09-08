import { notFound, redirect } from "next/navigation";
import { CalendarClock, Files, ScanText, ShieldAlert } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle } from "@/lib/store";
import { extractFilingDates } from "@/lib/docs/dates";
import { DOC_KIND_LABEL } from "@/lib/types";
import ExtractionReview from "@/components/portal/ExtractionReview";
import { caseTypeById } from "@/lib/rulebook";

export const dynamic = "force-dynamic";

export default async function ExtractionStage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email) notFound();

  const { evidence } = extractFilingDates(bundle.documents);
  const needsLimitationDates = caseTypeById(bundle.caseTypeId)?.limitationDays != null;
  const pages = bundle.documents.reduce((sum, document) => sum + document.pageCount, 0);
  const readable = bundle.documents.filter((document) => document.hasTextLayer).length;
  const attention = bundle.documents.filter(
    (document) => document.kindConfidence < 78 || document.kind === "UNKNOWN" || !document.hasTextLayer
  ).length;
  const metrics = [
    { icon: Files, value: bundle.documents.length, label: "Documents received" },
    { icon: ScanText, value: pages, label: "Pages inspected" },
    { icon: CalendarClock, value: needsLimitationDates ? Object.values(evidence).filter(Boolean).length : "N/A", label: needsLimitationDates ? "Dates found in source" : "Fixed limitation period" },
    { icon: ShieldAlert, value: attention, label: attention === 1 ? "Item needs review" : "Items need review" },
  ];

  return (
    <div className="portal-enter space-y-7">
      <header className="max-w-[49rem]">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#7b2832]/15 bg-white/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)] shadow-sm">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--brand)] text-[9px] text-white">02</span>
          Verification desk
        </span>
        <h1 className="mt-4 font-serif text-[clamp(2.2rem,3.7vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">
          Verify the facts that
          <span className="block text-[var(--brand)]">drive the audit.</span>
        </h1>
        <p className="mt-4 max-w-[46rem] text-[16px] leading-7 text-ink-soft">
          Review document types and source evidence before scrutiny begins. Limitation date fields appear only when this case type needs them.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Bundle summary">
        {metrics.map(({ icon: Icon, value, label }, index) => (
          <div key={label} className="workspace-card flex items-center gap-3.5 px-4 py-3.5">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${index === 3 && attention > 0 ? "bg-[var(--objection-bg)] text-objection" : "bg-[#f4efe8] text-[var(--brand)]"}`}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span>
              <span className="num block text-[20px] font-bold leading-none text-ink">{value}</span>
              <span className="mt-1 block text-[11.5px] font-medium text-ink-soft">{label}</span>
            </span>
          </div>
        ))}
      </section>

      {readable < bundle.documents.length && (
        <p className="sr-only">{readable} of {bundle.documents.length} documents contain readable text.</p>
      )}

      <ExtractionReview
        bundleId={bundle.id}
        needsLimitationDates={needsLimitationDates}
        confirmedAt={bundle.extractionConfirmedAt ?? null}
        dates={bundle.dates as unknown as Record<string, string | undefined>}
        dateEvidence={evidence as Record<string, string | undefined>}
        documents={bundle.documents.map((d) => ({
          id: d.id,
          fileName: d.fileName,
          kind: d.kind,
          kindLabel: DOC_KIND_LABEL[d.kind],
          kindSource: d.kindSource,
          kindConfidence: d.kindConfidence,
          annexureMark: d.annexureMark ?? null,
          pageCount: d.pageCount,
          hasTextLayer: d.hasTextLayer,
          preview: d.pagesText[0]?.replace(/\s+/g, " ").slice(0, 220) ?? "",
        }))}
      />
    </div>
  );
}
