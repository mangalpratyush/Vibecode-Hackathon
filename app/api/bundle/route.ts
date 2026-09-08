import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { analysePdf } from "@/lib/docs/pdf-forensics";
import { classifyDocument, readAnnexureMark } from "@/lib/docs/classify";
import { extractFilingDates } from "@/lib/docs/dates";
import { detectMatter, suggestedTitle } from "@/lib/docs/detect";
import { caseTypeById } from "@/lib/rulebook";
import { listBundles, saveBundle } from "@/lib/store";
import { saveDocumentFile } from "@/lib/storage/files";
import type { Bundle, BundleDocument, CourtId, FilingDates } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Ingest a filing bundle: parse every PDF, measure it, classify it, store it. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await req.formData();
  // Everything about the matter is OPTIONAL on the form. If the advocate left a
  // field blank, PARAM reads it off the documents; anything they typed wins.
  const askedCourt = str(form.get("court")) as CourtId | undefined;
  const askedCaseType = str(form.get("caseTypeId"));
  const askedTitle = str(form.get("title"));

  const dates: FilingDates = {
    pronouncedOn: str(form.get("pronouncedOn")),
    copyAppliedOn: str(form.get("copyAppliedOn")),
    copyReadyOn: str(form.get("copyReadyOn")),
    filingOn: str(form.get("filingOn")),
    source: {},
  };

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length)
    return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });

  // Allocated up front so each uploaded file can be written under it as we go.
  const bundleId = rid("bnd");

  const documents: BundleDocument[] = [];
  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer());
    const isPdf = /\.pdf$/i.test(file.name);

    let pageCount = 0;
    let hasTextLayer = false;
    let hasBookmarks = false;
    let pages: BundleDocument["pages"] = [];
    let pagesText: string[] = [];

    if (isPdf) {
      try {
        const f = await analysePdf(buf);
        pageCount = f.pageCount;
        hasTextLayer = f.hasTextLayer;
        hasBookmarks = f.hasBookmarks;
        pages = f.pages;
        pagesText = f.pageTexts;
      } catch {
        // An unreadable PDF is a valid state, not a crash. It will surface as
        // a "no text layer" defect rather than vanishing from the bundle.
      }
    }

    const text = pagesText.join("\n");
    const cls = classifyDocument(file.name, text);
    const docId = rid("doc");

    // Keep the original bytes. Scrutiny only needs the measurements, but
    // repagination, index rebuilding and export all need the file itself back.
    if (isPdf) {
      try {
        await saveDocumentFile(bundleId, docId, buf);
      } catch (e) {
        console.error(
          "[bundle] could not persist file:",
          e instanceof Error ? e.message : e
        );
      }
    }

    documents.push({
      id: docId,
      fileName: file.name,
      sizeBytes: buf.length,
      kind: cls.kind,
      kindSource: cls.source,
      kindConfidence: cls.confidence,
      annexureMark:
        cls.kind === "ANNEXURE" ? readAnnexureMark(file.name, text) : undefined,
      pageCount,
      hasTextLayer,
      hasBookmarks,
      pages,
      pagesText,
      text,
    });
  }

  /*
    Read what the documents themselves say, and fill only the gaps the advocate
    left blank. A date typed on the form always wins — the person filing knows
    their own matter, and silently overriding them with something scraped off a
    scan would be the wrong kind of clever. Provenance is recorded either way so
    the memo can show where each date came from.
  */
  /*
    Read the matter out of the filing.

    Requiring the court and case type up front made PARAM look like it only
    worked for two courts, and made the advocate retype what is printed on the
    first page of their own petition. Detection is far wider than the rulebook:
    an unrecognised court is recorded by name and scrutinised only against the
    checks that do not depend on a rule we have not verified.
  */
  const detected = detectMatter(documents);

  const detectedCourtId = detected.court?.value.id;
  const court: CourtId =
    askedCourt && askedCourt !== "OTHER"
      ? askedCourt
      : detectedCourtId === "SUPREME_COURT" || detectedCourtId === "DELHI_HIGH_COURT"
        ? detectedCourtId
        : "OTHER";

  const detectedCaseTypeId = detected.caseType?.value.id ?? undefined;
  const caseTypeId =
    (askedCaseType && caseTypeById(askedCaseType) ? askedCaseType : undefined) ??
    (detectedCaseTypeId && caseTypeById(detectedCaseTypeId) ? detectedCaseTypeId : undefined) ??
    "";

  const title =
    askedTitle ?? suggestedTitle(detected) ?? "Untitled filing";

  const found = extractFilingDates(documents);
  for (const key of ["pronouncedOn", "copyAppliedOn", "copyReadyOn"] as const) {
    if (dates[key]) {
      dates.source![key] = "user";
    } else if (found.dates[key]) {
      dates[key] = found.dates[key];
      dates.source![key] = "regex";
    }
  }

  const bundle: Bundle = {
    id: bundleId,
    ownerEmail: user.email,
    title,
    court,
    caseTypeId,
    createdAt: new Date().toISOString(),
    documents,
    dates,
    courtFeePaid: num(form.get("courtFeePaid")),
    valuation: num(form.get("valuation")),
    courtName: detected.court?.value.name ?? undefined,
    caseNumber: detected.caseNumber?.value,
    detected,
  };

  await saveBundle(bundle);
  return NextResponse.json({
    ok: true,
    bundleId: bundle.id,
    // So a caller can tell the advocate "we read these off your certified copy".
    datesReadFromDocuments: found.evidence,
    detected,
  });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const bundles = await listBundles(user.email);
  return NextResponse.json({
    bundles: bundles.map((b) => ({
      id: b.id,
      title: b.title,
      court: b.court,
      caseTypeId: b.caseTypeId,
      createdAt: b.createdAt,
      documents: b.documents.length,
      pages: b.documents.reduce((s, d) => s + d.pageCount, 0),
    })),
  });
}

const str = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s || undefined;
};
const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const rid = (p: string) =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
