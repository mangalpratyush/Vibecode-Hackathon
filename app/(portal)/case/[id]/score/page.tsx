import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, ArrowLeft, BookOpenCheck } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle, getResult, saveResult } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import { caseTypeById } from "@/lib/rulebook";
import VerdictStamp from "@/components/portal/VerdictStamp";
import FindingsReview from "@/components/portal/FindingsReview";
import LimitationPanel from "@/components/portal/LimitationPanel";
import PrintButton from "@/components/portal/PrintButton";
import "@/components/portal/audit.css";

export const dynamic = "force-dynamic";

export default async function ScoreStage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email) notFound();
  let result = await getResult(id);
  if (!result) { result = runScrutiny(bundle); await saveResult(result); }
  const score = result.score ?? runScrutiny(bundle).score!;
  return (
    <div className="audit-page portal-enter">
      <header className="audit-heading">
        <div><p className="audit-kicker"><span>03 / FILING WORKSPACE</span> Registry scrutiny</p>
          <h2 className="audit-title">Your filing, under review.</h2>
          <p className="audit-intro">A complete view of the findings, filing deadlines and corrections that need your attention.</p>
        </div>
        <div className="audit-actions no-print"><PrintButton /><Link href={`/case/${id}/cure`} className="audit-btn audit-btn-primary">Cure &amp; seal <ArrowRight /></Link></div>
      </header>
      <VerdictStamp score={score} passedCount={result.passed.length} skippedCount={result.skipped.length} />
      <LimitationPanel limitation={result.limitation} caseType={caseTypeById(bundle.caseTypeId) ?? null} dates={bundle.dates} />
      <FindingsReview defects={result.defects.map(d => ({ ...d, documentName: bundle.documents.find(doc => doc.id === d.documentId)?.fileName }))} passed={result.passed} skipped={result.skipped} />
      <footer className="audit-footer no-print">
        <Link href={`/case/${id}/extraction`} className="audit-btn"><ArrowLeft />Review extracted details</Link>
        <div className="audit-note text-right"><Link href="/rulebook" className="inline-flex items-center gap-2 underline underline-offset-4"><BookOpenCheck size={14} />View the verified rulebook</Link><p>Assessed {new Date(result.ranAt).toLocaleString("en-IN")}</p></div>
      </footer>
    </div>
  );
}
