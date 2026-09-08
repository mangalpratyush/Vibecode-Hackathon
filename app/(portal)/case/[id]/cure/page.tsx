import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle, getRedlines, getResult } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import CurePanel from "@/components/portal/CurePanel";
import "@/components/portal/audit.css";

export const dynamic = "force-dynamic";

export default async function CureStage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/");
  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email) notFound();
  const result = (await getResult(id)) ?? runScrutiny(bundle);
  const score = result.score ?? runScrutiny(bundle).score!;
  const set = await getRedlines(id);
  return (
    <div className="audit-page portal-enter">
      <header className="audit-heading">
        <div><p className="audit-kicker"><span>04 / FILING WORKSPACE</span>Cure &amp; seal</p><h2 className="audit-title">Bring the filing together.</h2><p className="audit-intro">Prepare the paperbook, review proposed corrections and preserve a verifiable record of your documents.</p></div>
        <Link href={`/case/${id}/score`} className="audit-btn no-print"><ArrowLeft />Back to findings</Link>
      </header>
      <CurePanel bundleId={id} barred={Boolean(result.limitation.computed && result.limitation.barred)} limitationComputed={result.limitation.computed} initialRedlines={set?.redlines ?? []} initialDeclined={set?.declined ?? []} verdict={score.headline} score={score.score} documentCount={bundle.documents.length} sealedAt={bundle.sealedAt} />
    </div>
  );
}
