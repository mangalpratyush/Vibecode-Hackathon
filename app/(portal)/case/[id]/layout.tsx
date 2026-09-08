import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileStack, Landmark } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle } from "@/lib/store";
import { caseTypeById } from "@/lib/rulebook";
import { COURTS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The shell every stage of a filing sits in: cause title above, paperbook index
 * below, stage content under that. Keeping the cause title fixed across the
 * five stages is the point — it is how an advocate knows which matter they are
 * looking at, and it is what the Registry reads first.
 */
export default async function CaseLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email) notFound();

  const ct = caseTypeById(bundle.caseTypeId);
  const court = COURTS.find((c) => c.id === bundle.court);
  const pages = bundle.documents.reduce((s, d) => s + d.pageCount, 0);

  return (
    <div className="space-y-6">
      <header className="workspace-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <Link
          href="/filings"
          aria-label="Back to all filings"
          title="All filings"
          className="no-print grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-rule bg-white text-ink-soft transition hover:border-[var(--brand)]/30 hover:text-[var(--brand)]"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        </Link>

        <span className="hidden h-9 w-px bg-rule sm:block" />
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
          <Landmark className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-[0.17em] text-ink-soft">
            In the {court?.name ?? bundle.court}
          </p>
          <h1 className="mt-1 truncate font-serif text-[19px] font-semibold leading-tight tracking-[-0.012em] text-ink sm:text-[21px]">
            {bundle.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="rounded-full bg-[#f4efe8] px-3 py-1.5 text-[10.5px] font-semibold text-ink-soft">
            {ct?.code ?? "Filing"}
          </span>
          <span className="num inline-flex items-center gap-1.5 rounded-full bg-[#edf2f6] px-3 py-1.5 text-[10.5px] font-semibold text-[var(--navy)]">
            <FileStack className="h-3 w-3" strokeWidth={2} />
            {bundle.documents.length} docs · {pages} pages
          </span>
        </div>
      </header>

      {children}
    </div>
  );
}
