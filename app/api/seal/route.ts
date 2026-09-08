import { getSessionUser } from "@/lib/auth/session";
import { getBundle, getResult, saveBundle } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import { sealBundle } from "@/lib/seal/seal";
import { sealCertificate } from "@/lib/seal/certificate";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Seal a scrutinised bundle.
 *
 *   GET /api/seal?bundleId=…            -> manifest + seal as JSON
 *   GET /api/seal?bundleId=…&format=pdf -> the certificate
 *
 * The seal is computed fresh from the stored files each time rather than cached,
 * so it always describes the bytes on disk right now. If someone replaced a
 * document after the last scrutiny, the new seal reflects that and the old
 * certificate stops verifying, which is exactly the behaviour we want.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Not signed in." }, 401);

  const url = new URL(req.url);
  const bundleId = url.searchParams.get("bundleId") ?? "";
  const bundle = await getBundle(bundleId);
  if (!bundle || bundle.ownerEmail !== user.email)
    return json({ error: "Bundle not found." }, 404);

  const result = (await getResult(bundleId)) ?? runScrutiny(bundle);
  if (!result.score) return json({ error: "This bundle has not been scored yet." }, 409);

  try {
    const seal = await sealBundle(bundle, result, result.score);

    // Record that a seal was issued, so the stepper can mark stage IV complete.
    // The seal itself is recomputed on every request rather than cached: it must
    // always describe the bytes on disk now, not the bytes at first issue.
    if (!bundle.sealedAt) {
      bundle.sealedAt = seal.manifest.sealedAt;
      await saveBundle(bundle);
    }

    if (url.searchParams.get("format") === "pdf") {
      const pdf = await sealCertificate(seal);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${slug(bundle.title)}-integrity-seal.pdf"`,
        },
      });
    }
    return json(seal);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Could not seal this bundle." },
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
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "bundle";
