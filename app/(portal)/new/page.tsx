import { redirect } from "next/navigation";
import {
  BookOpenCheck,
  Fingerprint,
  LockKeyhole,
  Ruler,
  ScanSearch,
  Scale,
  ShieldCheck,
} from "lucide-react";
import NewBundleForm from "@/components/portal/NewBundleForm";
import { getSessionUser } from "@/lib/auth/session";
import { CASE_TYPES, rulebookStats } from "@/lib/rulebook";
import { COURTS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Stage I.
 *
 * The five stages live in the sidebar, so this screen does not repeat them.
 *
 * The right column is not filler. An advocate about to hand over a client's
 * filing wants to know what is going to be done to it and against what
 * authority, and answering that on the upload screen is what makes the upload
 * feel like the start of a process rather than a file picker.
 */

const CHECKS = [
  {
    icon: Ruler,
    title: "Page forensics",
    body: "Margins, pagination, OCR, scan quality and portal size are measured on every page.",
  },
  {
    icon: ScanSearch,
    title: "Bundle reconciliation",
    body: "Every annexure mentioned in the petition is matched to the documents supplied.",
  },
  {
    icon: Scale,
    title: "Limitation working",
    body: "Dates are read from the record and the full statutory calculation is shown.",
  },
  {
    icon: Fingerprint,
    title: "Verifiable clearance",
    body: "The final bundle is hashed and sealed so its cleared state can be verified later.",
  },
];

export default async function NewScrutinyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const stats = rulebookStats();

  return (
    <div className="portal-enter space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[47rem]">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#7b2832]/15 bg-white/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)] shadow-sm">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--brand)] text-[9px] text-white">01</span>
            Bundle intake
          </span>
          <h1 className="mt-4 max-w-[43rem] font-serif text-[clamp(2.25rem,4vw,3.45rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
            Begin with the filing.
            <span className="block text-[var(--brand)]">PARAM reads the rest.</span>
          </h1>
          <p className="mt-4 max-w-[44rem] text-[16px] leading-7 text-ink-soft">
            Upload the complete set exactly as you intend to file it. Court, cause title,
            dates and document types are extracted from the papers and presented for your review.
          </p>
        </div>

        <div className="hidden items-center gap-3 rounded-2xl border border-white/80 bg-white/65 px-4 py-3 shadow-[0_12px_30px_-24px_rgba(36,31,30,.5)] backdrop-blur md:flex">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf5f0] text-pass">
            <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-ink">Evidence-led review</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-soft">No manual case setup required</span>
          </span>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,.82fr)]">
        <NewBundleForm courts={COURTS} caseTypes={CASE_TYPES} />

        <aside className="space-y-4 lg:sticky lg:top-7 lg:self-start">
          <section className="workspace-dark overflow-hidden p-6">
            <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#e2b461]">
              <BookOpenCheck className="h-4 w-4" strokeWidth={1.9} />
              One complete pre-check
            </p>
            <h2 className="mt-3 font-serif text-[25px] leading-tight text-white">
              What PARAM examines
            </h2>
            <p className="mt-2 text-[13.5px] leading-6 text-white/65">
              The same filing, seen through the Registry&apos;s checkslip before submission.
            </p>

            <ol className="mt-5 divide-y divide-white/10 border-y border-white/10">
              {CHECKS.map(({ icon: Icon, title, body }, index) => (
                <li key={title} className="flex gap-3.5 py-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#d6a453]/25 bg-[#d6a453]/10 text-[#efc477]">
                    <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[14px] font-semibold text-white/95">
                      {title}
                      <span className="text-[9px] font-medium text-white/30">0{index + 1}</span>
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-5 text-white/58">{body}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-5 rounded-2xl border border-[#ddb565]/20 bg-white/[0.055] p-4">
              <p className="num text-[14px] font-semibold text-[#efc477]">
                {stats.verified} verified rules · {stats.sources} primary sources
              </p>
              <p className="mt-1 text-[12px] leading-5 text-white/55">
                Every finding names and links to its authority. Unverified rules are excluded.
              </p>
            </div>
          </section>

          <section className="workspace-card flex gap-3.5 p-4.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">
              <LockKeyhole className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </span>
            <span>
              <span className="block text-[13px] font-semibold text-ink">Private to this workspace</span>
              <span className="mt-1 block text-[12px] leading-5 text-ink-soft">
                Files are used only to scrutinise and seal this filing.
              </span>
            </span>
          </section>
        </aside>
      </div>
    </div>
  );
}
