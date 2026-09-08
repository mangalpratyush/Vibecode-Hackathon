import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { deleteBundle, getBundle, getResult, saveBundle, saveResult } from "@/lib/store";
import { runScrutiny } from "@/lib/scrutiny/run";
import { extractFilingDates } from "@/lib/docs/dates";
import { deleteBundleFiles } from "@/lib/storage/files";
import type { Bundle, DocKind, FilingDates } from "@/lib/types";
import { DOC_KIND_LABEL } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Read a bundle back with the extraction laid out for review.
 *
 * This is what the verification stage renders: every document PARAM classified,
 * how sure it was and on what basis, and every date it read together with the
 * exact line it read it from. The advocate is being asked to confirm the inputs
 * before the engine computes on them, which is the whole point of the stage.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  // Re-derive the evidence lines so the UI can quote the certified copy back.
  const evidence = extractFilingDates(bundle.documents).evidence;
  const result = await getResult(id);

  return NextResponse.json({
    id: bundle.id,
    title: bundle.title,
    court: bundle.court,
    caseTypeId: bundle.caseTypeId,
    dates: bundle.dates,
    dateEvidence: evidence,
    extractionConfirmedAt: bundle.extractionConfirmedAt ?? null,
    sealedAt: bundle.sealedAt ?? null,
    scrutinised: Boolean(result),
    verdict: result?.score?.verdict ?? null,
    documents: bundle.documents.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      kind: d.kind,
      kindLabel: DOC_KIND_LABEL[d.kind],
      kindSource: d.kindSource,
      kindConfidence: d.kindConfidence,
      annexureMark: d.annexureMark ?? null,
      pageCount: d.pageCount,
      hasTextLayer: d.hasTextLayer,
      sizeBytes: d.sizeBytes,
      /** First lines of the document, so the user can tell what it is at a glance. */
      preview: d.pagesText[0]?.replace(/\s+/g, " ").slice(0, 220) ?? "",
    })),
  });
}

const VALID_KINDS = new Set(Object.keys(DOC_KIND_LABEL) as DocKind[]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Apply the advocate's corrections and re-run.
 *
 * A correction always wins over what PARAM inferred, and is recorded as
 * `kindSource: "user"` / `source: "user"` so nothing downstream mistakes a
 * human decision for a machine guess. This is the step that removes PARAM's
 * worst failure mode: a misread pronouncement date silently producing a
 * confident and wrong limitation verdict.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    documents?: { id: string; kind?: string; annexureMark?: string | null }[];
    dates?: Partial<Record<keyof FilingDates, string | null>>;
    /** True when the advocate is signing off the extraction, not merely editing. */
    confirmExtraction?: boolean;
  };

  const changes: string[] = [];

  // ── Document classification ──────────────────────────────────────────────
  for (const patch of body.documents ?? []) {
    const doc = bundle.documents.find((d) => d.id === patch.id);
    if (!doc) continue;

    if (patch.kind && patch.kind !== doc.kind) {
      if (!VALID_KINDS.has(patch.kind as DocKind))
        return NextResponse.json(
          { error: `Unknown document type: ${patch.kind}` },
          { status: 400 }
        );
      changes.push(
        `${doc.fileName}: ${DOC_KIND_LABEL[doc.kind]} to ${DOC_KIND_LABEL[patch.kind as DocKind]}`
      );
      doc.kind = patch.kind as DocKind;
      doc.kindSource = "user";
      doc.kindConfidence = 100;
    }

    if (patch.annexureMark !== undefined) {
      const mark = normaliseMark(patch.annexureMark);
      if (mark !== doc.annexureMark) {
        changes.push(`${doc.fileName}: annexure mark set to ${mark ?? "none"}`);
        doc.annexureMark = mark;
      }
    }
  }

  // ── Dates ────────────────────────────────────────────────────────────────
  const dateKeys = ["pronouncedOn", "copyAppliedOn", "copyReadyOn", "filingOn"] as const;
  bundle.dates.source ??= {};
  for (const key of dateKeys) {
    if (!(key in (body.dates ?? {}))) continue;
    const raw = body.dates?.[key];
    const value = raw ? String(raw).trim() : "";

    if (value && !ISO.test(value))
      return NextResponse.json(
        { error: `${key} must be a date in YYYY-MM-DD form.` },
        { status: 400 }
      );

    if ((bundle.dates[key] ?? "") === value) continue;
    changes.push(`${key}: ${bundle.dates[key] ?? "blank"} to ${value || "blank"}`);
    bundle.dates[key] = value || undefined;
    // A date the advocate typed is theirs, even when they cleared one we read.
    bundle.dates.source[key] = value ? "user" : undefined;
  }

  // Ordering is the one thing worth refusing outright, because a copy that is
  // ready before it was applied for produces an exclusion that is nonsense.
  const { pronouncedOn, copyAppliedOn, copyReadyOn } = bundle.dates;
  if (copyAppliedOn && copyReadyOn && copyReadyOn < copyAppliedOn)
    return NextResponse.json(
      { error: "The certified copy cannot be ready before it was applied for." },
      { status: 400 }
    );
  if (pronouncedOn && copyAppliedOn && copyAppliedOn < pronouncedOn)
    return NextResponse.json(
      { error: "The certified copy cannot be applied for before the order was pronounced." },
      { status: 400 }
    );

  if (body.confirmExtraction) {
    bundle.extractionConfirmedAt = new Date().toISOString();
    changes.push("extraction confirmed");
  }

  await saveBundle(bundle as Bundle);

  // Re-run immediately: a correction that does not change the verdict on screen
  // would leave the user unsure whether it registered.
  const result = runScrutiny(bundle as Bundle);
  await saveResult(result);

  return NextResponse.json({ ok: true, changes, result });
}

/** "p7", "P - 7", "annexure p7" all mean the same mark. */
function normaliseMark(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const m = String(raw).match(/([A-Za-z]{1,2})\s*[-–]?\s*(\d{1,3})/);
  if (!m) return undefined;
  return `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`;
}

/**
 * Remove a filing and everything derived from it.
 *
 * The stored PDFs go too. A filing bundle is a client's court papers, so
 * "deleted" has to mean the bytes are off the disk, not merely that the row
 * stopped being listed.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id } = await params;
  const bundle = await getBundle(id);
  if (!bundle || bundle.ownerEmail !== user.email)
    return NextResponse.json({ error: "Bundle not found." }, { status: 404 });

  await deleteBundle(id, user.email);
  await deleteBundleFiles(id).catch(() => {});
  return NextResponse.json({ ok: true, deleted: id });
}
