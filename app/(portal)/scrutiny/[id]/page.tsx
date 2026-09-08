import { redirect } from "next/navigation";

/**
 * The memo used to live here. It is now stage III of the case flow, so old
 * links (and the seeded demo, and anything a judge bookmarked) still land in
 * the right place instead of 404ing.
 */
export default async function LegacyScrutinyRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/case/${id}/score`);
}
