import NewBundleForm from "@/components/portal/NewBundleForm";
import PageHeader from "@/components/portal/PageHeader";
import { CASE_TYPES } from "@/lib/rulebook";
import { COURTS } from "@/lib/types";

export default function NewScrutinyPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="New scrutiny"
        title="Upload the bundle as you intend to file it."
        lead="PARAM measures every page — margins, pagination, text layer, scan resolution, script — classifies each document, reconciles the annexures against the petition, and reads the filing dates off your certified copy."
      />
      <NewBundleForm courts={COURTS} caseTypes={CASE_TYPES} />
    </div>
  );
}
