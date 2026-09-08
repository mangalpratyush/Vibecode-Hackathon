import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getBundle, getRedlines, getResult, saveRedlines } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import { proposeRedlines, type RedlineStatus } from "@/lib/scrutiny/redlines";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Read whatever proposals already exist for a bundle. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const bundleId = new URL(req.url).searchParams.get("bundleId") ?? "";
  const bundle = await getBundle(bundleId);
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  return NextResponse.json({ redlines: await getRedlines(bundleId) });
}

/** Generate proposals for the substantive defects on this bundle. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { bundleId } = await req.json().catch(() => ({ bundleId: "" }));
  const bundle = await getBundle(String(bundleId ?? ""));
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  const result = (await getResult(bundle.id)) ?? runScrutiny(bundle);

  // Keep decisions the advocate has already made. Regenerating should not
  // quietly resurrect a proposal they rejected a minute ago.
  const previous = await getRedlines(bundle.id);
  const decided = new Map(
    (previous?.redlines ?? [])
      .filter((r) => r.status !== "proposed")
      .map((r) => [r.ruleId + r.before, r])
  );

  const set = await proposeRedlines(bundle, result.defects);
  set.redlines = set.redlines.map((r) => decided.get(r.ruleId + r.before) ?? r);

  await saveRedlines(set);
  return NextResponse.json({ ok: true, redlines: set });
}

/** Accept, edit or reject one proposal. */
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    bundleId?: string;
    redlineId?: string;
    status?: RedlineStatus;
    editedAfter?: string;
  };

  const bundle = await getBundle(String(body.bundleId ?? ""));
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  const set = await getRedlines(bundle.id);
  const redline = set?.redlines.find((r) => r.id === body.redlineId);
  if (!set || !redline)
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });

  if (body.status && !["proposed", "accepted", "rejected"].includes(body.status))
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });

  if (body.status) redline.status = body.status;
  if (typeof body.editedAfter === "string")
    redline.editedAfter = body.editedAfter.slice(0, 4000);

  await saveRedlines(set);
  return NextResponse.json({ ok: true, redline });
}
