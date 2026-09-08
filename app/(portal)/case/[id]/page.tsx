import { redirect } from "next/navigation";

/** A bare case URL opens at stage I, the same place the rail starts. */
export default async function CaseIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/case/${id}/bundle`);
}
