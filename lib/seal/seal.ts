import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Bundle, ScrutinyResult } from "../types";
import { rulebookStats } from "../rulebook";
import { readDocumentFile } from "../storage/files";
import type { FilingScore } from "../scrutiny/score";

/**
 * The Filing Integrity Seal.
 *
 * This answers a question a practitioner will ask within ten seconds of seeing
 * the memo: "how do I know the bundle you filed is the bundle PARAM cleared?"
 *
 * It is deliberately NOT a digital signature. A signature under s.3 of the IT
 * Act, or an Aadhaar eSign, is a legal instrument issued against a certificate
 * from a licensed CA. We do not have one and simulating one on a court document
 * would be a genuinely bad thing to put on a screen. What this does instead is
 * narrower and completely honest: it hashes every document, records what PARAM
 * checked and when, and signs that record with a key only the server holds, so
 * any later alteration of any page is detectable by anyone.
 *
 * The wording in the UI and on the certificate says exactly that.
 */

export const SEAL_ALGORITHM = "HMAC-SHA256";
export const MANIFEST_VERSION = "param-manifest-1";

export interface SealedDocument {
  fileName: string;
  kind: string;
  pages: number;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  version: typeof MANIFEST_VERSION;
  scope?: "FINAL_PAPERBOOK";
  bundleId: string;
  title: string;
  court: string;
  caseType: string;
  sealedAt: string;
  rulebook: { version: string; verifiedRules: number };
  scrutiny: {
    ranAt: string;
    verdict: string;
    score: number;
    fatal: number;
    objections: number;
    advisories: number;
    passed: number;
    notChecked: number;
    limitation: string;
  };
  documents: SealedDocument[];
  /** sha256 over the ordered document hashes, so page order is covered too. */
  bundleDigest: string;
}

export interface Seal {
  manifest: Manifest;
  /** HMAC over the canonical manifest, hex. */
  seal: string;
  algorithm: typeof SEAL_ALGORITHM;
}

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/**
 * Canonical JSON: keys sorted at every level.
 *
 * The seal is computed over a string, so two encodings of the same manifest
 * must produce the same string or verification fails for no reason. Sorting
 * removes any dependence on property insertion order.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

function sealKey(): Buffer {
  // A dedicated secret when one is set, otherwise the session secret. Either
  // way it never leaves the server, which is the whole point: a seal anyone
  // could recompute would prove nothing.
  const secret = process.env.SEAL_SECRET || process.env.AUTH_SECRET;
  if (!secret)
    throw new Error(
      "Cannot seal a bundle: set AUTH_SECRET (or SEAL_SECRET) in .env.local."
    );
  return Buffer.from(secret, "utf8");
}

export function signManifest(manifest: Manifest): string {
  return createHmac("sha256", sealKey()).update(canonical(manifest)).digest("hex");
}

/**
 * Build and sign the manifest for a scrutinised bundle.
 *
 * Hashes are taken from the stored originals rather than from anything held in
 * memory, so the seal covers the bytes that were actually filed.
 */
export async function sealBundle(
  bundle: Bundle,
  result: ScrutinyResult,
  score: FilingScore
): Promise<Seal> {
  const ordered = [...bundle.documents].sort((a, b) =>
    a.fileName.localeCompare(b.fileName)
  );

  const documents: SealedDocument[] = [];
  for (const doc of ordered) {
    const bytes = await readDocumentFile(bundle.id, doc.id);
    if (!bytes)
      throw new Error(
        `Cannot seal this bundle: ${doc.fileName} could not be read back from disk.`
      );
    documents.push({
      fileName: doc.fileName,
      kind: doc.kind,
      pages: doc.pageCount,
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }

  const l = result.limitation;
  const stats = rulebookStats();

  const manifest: Manifest = {
    version: MANIFEST_VERSION,
    bundleId: bundle.id,
    title: bundle.title,
    court: bundle.court,
    caseType: bundle.caseTypeId,
    sealedAt: new Date().toISOString(),
    rulebook: { version: "v1", verifiedRules: stats.verified },
    scrutiny: {
      ranAt: result.ranAt,
      verdict: score.verdict,
      score: score.score,
      fatal: result.stats.fatal,
      objections: result.stats.objections,
      advisories: result.stats.advisories,
      passed: result.passed.length,
      notChecked: result.skipped.length,
      limitation: !l.computed
        ? "not computed"
        : l.barred
          ? `out of time by ${l.daysOverdue} day(s), expired ${l.dueOn}`
          : `within time, ${l.daysRemaining} day(s) remaining, expires ${l.dueOn}`,
    },
    documents,
    // Order-sensitive: reordering the bundle changes the digest.
    bundleDigest: sha256(documents.map((d) => d.sha256).join("")),
  };

  return { manifest, seal: signManifest(manifest), algorithm: SEAL_ALGORITHM };
}

// ── Verification ────────────────────────────────────────────────────────────

export interface VerifyInput {
  manifest: Manifest;
  seal: string;
  /** File name to bytes, as re-uploaded by whoever is checking. */
  files: { fileName: string; bytes: Buffer }[];
}

export interface VerifyResult {
  sealValid: boolean;
  documentsMatch: boolean;
  verdict: "VERIFIED" | "ALTERED" | "SEAL_INVALID";
  /** Per document, so an alteration is named rather than merely reported. */
  documents: {
    fileName: string;
    status: "match" | "altered" | "missing" | "unexpected";
    expected?: string;
    actual?: string;
  }[];
  summary: string;
}

export function verifySeal({ manifest, seal, files }: VerifyInput): VerifyResult {
  // 1. Is the manifest itself untampered? Compared in constant time so the
  //    endpoint cannot be used to guess a seal byte by byte.
  let sealValid = false;
  try {
    const expected = Buffer.from(signManifest(manifest), "hex");
    const given = Buffer.from(seal, "hex");
    sealValid = expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    sealValid = false;
  }

  // 2. Do the files still hash to what the manifest recorded?
  const byName = new Map(files.map((f) => [f.fileName, f.bytes]));
  const documents: VerifyResult["documents"] = [];

  for (const d of manifest.documents) {
    const bytes = byName.get(d.fileName);
    if (!bytes) {
      documents.push({ fileName: d.fileName, status: "missing", expected: d.sha256 });
      continue;
    }
    byName.delete(d.fileName);
    const actual = sha256(bytes);
    documents.push({
      fileName: d.fileName,
      status: actual === d.sha256 ? "match" : "altered",
      expected: d.sha256,
      actual,
    });
  }
  // Anything left over was added after sealing.
  for (const fileName of byName.keys())
    documents.push({ fileName, status: "unexpected" });

  const documentsMatch = documents.every((d) => d.status === "match");
  const verdict: VerifyResult["verdict"] = !sealValid
    ? "SEAL_INVALID"
    : documentsMatch
      ? "VERIFIED"
      : "ALTERED";

  const altered = documents.filter((d) => d.status !== "match");
  const summary = !sealValid
    ? "The seal does not match this manifest. The manifest has been edited, or it was not issued by this PARAM instance."
    : documentsMatch
      ? `All ${manifest.documents.length} documents are byte for byte what PARAM sealed on ${manifest.sealedAt.slice(0, 10)}.`
      : `${altered.length} of ${manifest.documents.length} documents no longer match the seal: ${altered
          .map((d) => `${d.fileName} (${d.status})`)
          .join(", ")}.`;

  return { sealValid, documentsMatch, verdict, documents, summary };
}
