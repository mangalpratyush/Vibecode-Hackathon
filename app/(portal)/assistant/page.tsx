import { getSessionUser } from "@/lib/auth/session";
import { listBundles } from "@/lib/store";
import { caseTypeById } from "@/lib/rulebook";
import { aiAvailable } from "@/lib/ai/provider";
import AssistantPanel from "@/components/assistant/AssistantPanel";
import PageHeader from "@/components/portal/PageHeader";

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
    <div className="space-y-7">
      <PageHeader
        eyebrow="Assistant"
        title="Ask PARAM"
        lead="Registry practice, paperbook requirements, limitation and condonation — answered in the language you ask in, and grounded in your own bundle when you pick one."
      />
      <AssistantPanel
        aiReady={aiAvailable()}
        initialBundleId={bundle ?? ""}
        bundles={bundles.map((b) => ({
          id: b.id,
          title: b.title,
          caseTypeCode: caseTypeById(b.caseTypeId)?.code ?? b.caseTypeId,
        }))}
      />
    </div>
  );
}
