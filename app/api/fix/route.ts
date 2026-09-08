import { getSessionUser } from "@/lib/auth/session";
import { getBundle } from "@/lib/store";
import { repairBundle } from "@/lib/fix/repair";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Return a repaired copy of the bundle: paginated end to end, with a rebuilt
 * index. The original upload is never modified — this streams a new PDF for
 * the advocate to check and file.
 *
 *   GET /api/fix?bundleId=…&paginate=1&index=1
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Not signed in." }, 401);

  const url = new URL(req.url);
  const bundleId = url.searchParams.get("bundleId") ?? "";
  const bundle = await getBundle(bundleId);
  if (!bundle || bundle.ownerEmail !== user.email)
    return json({ error: "Bundle not found." }, 404);

  const paginate = url.searchParams.get("paginate") !== "0";
  const index = url.searchParams.get("index") !== "0";

  try {
    const result = await repairBundle(bundle, { paginate, index });
    const reviewRequired = result.warnings.some(w => w.code !== "SOURCE_SIGNATURES");
    const name = reviewRequired ? "document-compilation-review.pdf" : `${slug(bundle.title)}-paperbook.pdf`;
    return new Response(new Uint8Array(result.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        // So a caller can report what happened without parsing the PDF.
        "X-Param-Pages": String(result.totalPages),
        "X-Param-Missing": String(result.missing.length),
        "X-Param-Stamped": String(result.stamped),
        "X-Param-Own-Pagination": String(result.carryOwnPagination.length),
        "X-Param-Index-Pages": String(result.indexPages),
        "X-Param-Review-Required": String(result.warnings.some(w => w.code !== "SOURCE_SIGNATURES")),
      },
    });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Could not repair the bundle." },
      422
    );
  }
}

/** Build and validate the same assembly as the download, returning its plan. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Not signed in." }, 401);

  const { bundleId } = await req.json().catch(() => ({ bundleId: "" }));
  const bundle = await getBundle(String(bundleId ?? ""));
  if (!bundle || bundle.ownerEmail !== user.email)
    return json({ error: "Bundle not found." }, 404);

  try {
    const r = await repairBundle(bundle);
    return json({
      ok: true,
      totalPages: r.totalPages,
      contents: r.contents,
      missing: r.missing,
      stamped: r.stamped,
      /*
        Documents that print their own internal pagination. Not a defect: a
        paperbook routinely contains judgments footed "Page 3 of 10". Reported
        so the advocate is not surprised to see two numbers on a page and knows
        the top-right stamp is the paperbook's.
      */
      carryOwnPagination: r.carryOwnPagination,
      indexPages: r.indexPages,
      normalizedPages: r.normalizedPages,
      warnings: r.warnings,
      signatureAppearancesPreserved: r.signatureAppearancesPreserved,
    });
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Could not repair the bundle." },
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
