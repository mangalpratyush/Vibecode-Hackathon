import { verifySeal, type Manifest } from "@/lib/seal/seal";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Verify a sealed bundle. Deliberately PUBLIC: no session required.
 *
 * The point of the seal is that the person you hand the filing to can check it,
 * and they do not have an account here. They post the manifest and the files;
 * PARAM re-hashes everything and re-checks the HMAC.
 *
 * Nothing is stored. The uploaded bytes are hashed in memory and dropped, so
 * verifying somebody's court filing does not put it on our disk.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Send the manifest and the bundle as multipart form data." }, 400);
  }

  const raw = String(form.get("manifest") ?? "");
  if (!raw) return json({ error: "No manifest supplied." }, 400);

  let parsed: { manifest?: Manifest; seal?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: "That manifest is not valid JSON." }, 400);
  }

  const manifest = parsed.manifest;
  const seal = parsed.seal;
  if (!manifest?.documents || !seal)
    return json(
      { error: "That file does not look like a PARAM seal. Expected a manifest and a seal." },
      400
    );

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return json({ error: "No documents uploaded to check." }, 400);

  const loaded = await Promise.all(
    files.map(async (f) => ({
      fileName: f.name,
      bytes: Buffer.from(await f.arrayBuffer()),
    }))
  );

  return json(verifySeal({ manifest, seal, files: loaded }));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
