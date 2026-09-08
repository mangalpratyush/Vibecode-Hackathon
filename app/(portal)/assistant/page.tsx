import { getSessionUser } from "@/lib/auth/session";
import { listBundles } from "@/lib/store";
import { caseTypeById } from "@/lib/rulebook";
import { aiAvailable } from "@/lib/ai/provider";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import "@/components/assistant/assistant.css";

export const dynamic = "force-dynamic";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ bundle?: string }>;
}) {
  const user = (await getSessionUser())!;
  const { bundle } = await searchParams;
  const bundles = await listBundles(user.email);

  return (
    <div className="param-assistant">
      <header className="pa-page-heading">
        <div>
          <p className="pa-eyebrow">YOUR FILING COMPANION</p>
          <h1>PARAM Assistant</h1>
          <p>A little clarity before your next step.</p>
        </div>
        <Link className="pa-rulebook-link" href="/rulebook"><BookOpen size={17} /> Open rulebook <ArrowUpRight size={15} /></Link>
      </header>
      <AssistantPanel
        aiReady={aiAvailable()}
        initialBundleId={bundles.some((b) => b.id === bundle) ? bundle : ""}
        bundles={bundles.map((b) => ({
          id: b.id,
          title: b.title,
          caseTypeCode: caseTypeById(b.caseTypeId)?.code ?? b.caseTypeId,
        }))}
      />
    </div>
  );
}
