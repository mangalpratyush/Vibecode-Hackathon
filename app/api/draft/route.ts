import { getSessionUser } from "@/lib/auth/session";
import { getBundle, getResult } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import { draftCondonationApplication } from "@/lib/draft/condonation";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Draft the cure for a defect PARAM raised.
 *
 * Only the s.5 condonation application so far, because it is the one cure that
 * is genuinely mechanical: the days are already computed and the court's
 * requirement — account for every one of them — is a chart, not an argument.
 * The reason for the delay is left blank for counsel; see lib/draft/condonation.
 *
 *   GET /api/draft?bundleId=…&kind=condonation[&reason=…]
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Not signed in." }, 401);

  const url = new URL(req.url);
  const bundleId = url.searchParams.get("bundleId") ?? "";
  const kind = url.searchParams.get("kind") ?? "condonation";
  const reason = url.searchParams.get("reason") ?? undefined;

  if (kind !== "condonation")
    return json({ error: `No draft of kind "${kind}" is available.` }, 400);

  const bundle = await getBundle(bundleId);
  if (!bundle || bundle.ownerEmail !== user.email)
    return json({ error: "Bundle not found." }, 404);

  // Use the stored scrutiny if there is one; otherwise compute it now, so the
  // draft can never be built on a limitation figure that was never displayed.
  const result = (await getResult(bundleId)) ?? runScrutiny(bundle);

  try {
    const pdf = await draftCondonationApplication({
      bundle,
      limitation: result.limitation,
      reason,
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${slug(bundle.title)}-condonation-application.pdf"`,
      },
    });
  } catch (e) {
    // Refusing to draft is a real answer here: if the matter is within time, or
    // beyond what any court may condone, the application is the wrong document.
    return json(
      { error: e instanceof Error ? e.message : "Could not draft the application." },
      422
    );
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) ||
  "bundle";
