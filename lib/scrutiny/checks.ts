import type { Bundle, Defect, DocKind, Rule } from "../types";
import { DOC_KIND_LABEL } from "../types";

/**
 * The deterministic checks.
 *
 * Each function measures the bundle and returns the defects it actually found,
 * or an empty array. None of them consult a model. That is the point: when
 * PARAM says "Annexure P-7 is cited at page 14 and is not in the bundle", a
 * judge can open page 14 and see it. A finding you can check on the spot is
 * worth more than a paragraph of confident prose.
 *
 * Every check receives the Rule it is implementing, so the defect it emits
 * carries that rule's citation. No check invents its own authority.
 */

export interface CheckContext {
  bundle: Bundle;
  rule: Rule;
}

type CheckFn = (ctx: CheckContext) => Defect[];

/** Build a defect that inherits its citation from the rule being applied. */
function defect(
  rule: Rule,
  title: string,
  detail: string,
  extra: Partial<Defect> = {}
): Defect {
  return {
    ruleId: rule.id,
    severity: rule.severity,
    title,
    detail,
    registryWording: rule.text,
    source: rule.source,
    sourceUrl: rule.sourceUrl,
    fix: rule.fix,
    ...extra,
  };
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
/** Agreeing verb for a count, so findings read as English and not as templating. */
const verb = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Compress [1,2,3,7,9,10] into "1–3, 7, 9–10" for readable page references. */
function pageRanges(nums: number[]): string {
  if (!nums.length) return "";
  const s = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  let start = s[0];
  let prev = s[0];
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === prev + 1) {
      prev = s[i];
      continue;
    }
    out.push(start === prev ? `${start}` : `${start}–${prev}`);
    if (i < s.length) {
      start = s[i];
      prev = s[i];
    }
  }
  return out.join(", ");
}

// ── D10: a mandatory document is missing from the bundle ────────────────────

const missing_document: CheckFn = ({ bundle, rule }) => {
  const want = rule.params?.docKind as DocKind | undefined;
  if (!want) return [];
  const found = bundle.documents.some((d) => d.kind === want);
  if (found) return [];
  return [
    defect(
      rule,
      `${DOC_KIND_LABEL[want]} is not in the bundle`,
      `PARAM classified all ${plural(bundle.documents.length, "document")} in this bundle and found nothing that reads as a ${DOC_KIND_LABEL[want].toLowerCase()}. If it is present but PARAM has mis-classified it, reassign the document type and re-run the scrutiny.`
    ),
  ];
};

// ── D6: annexure cross-reference, both directions ───────────────────────────

/**
 * The single highest-value check in PARAM.
 *
 * An advocate proof-reads the petition and proof-reads the annexures, but
 * almost nobody reconciles one against the other. The Registry does, and it
 * costs a round of scrutiny every time.
 */
const annexure_cross_reference: CheckFn = ({ bundle, rule }) => {
  const petition = bundle.documents.find(
    (d) => d.kind === "PETITION" || d.kind === "SYNOPSIS_LIST_OF_DATES"
  );
  if (!petition) return [];

  // "Annexure P-7", "Annexure P7", "Annexure  R-3", "ANNEXURE A-1"
  const re = /annexure\s*[-–:]?\s*([A-Z]{1,2})\s*[-–]?\s*(\d{1,3})/gi;
  const citedPages = new Map<string, number[]>();

  // Walk page-wise so we can report WHERE the broken reference sits.
  const pageTexts = petition.pagesText ?? [];
  const scan = (text: string, pageNo: number | null) => {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, "gi");
    while ((m = r.exec(text)) !== null) {
      const mark = `${m[1].toUpperCase()}-${parseInt(m[2], 10)}`;
      const arr = citedPages.get(mark) ?? [];
      if (pageNo !== null && !arr.includes(pageNo)) arr.push(pageNo);
      citedPages.set(mark, arr);
    }
  };
  if (pageTexts.length) pageTexts.forEach((t, i) => scan(t, i + 1));
  else scan(petition.text, null);

  const present = new Set(
    bundle.documents
      .filter((d) => d.kind === "ANNEXURE" && d.annexureMark)
      .map((d) => d.annexureMark!.toUpperCase())
  );

  const out: Defect[] = [];

  // Cited in the petition, absent from the bundle.
  for (const [mark, pages] of citedPages) {
    if (present.has(mark)) continue;
    const where = pages.length
      ? ` It is referred to at ${pages.length === 1 ? "page" : "pages"} ${pageRanges(pages)} of the ${DOC_KIND_LABEL[petition.kind].toLowerCase()}.`
      : "";
    out.push(
      defect(
        rule,
        `Annexure ${mark} is relied on but is not in the bundle`,
        `The petition relies on Annexure ${mark}, and no such annexure was found among the uploaded documents.${where} Either file it, or correct the reference.`,
        { documentId: petition.id, pageNo: pages[0] }
      )
    );
  }

  // In the bundle, never referred to.
  for (const mark of present) {
    if (citedPages.has(mark)) continue;
    out.push(
      defect(
        rule,
        `Annexure ${mark} is filed but never referred to`,
        `Annexure ${mark} forms part of the bundle but the petition does not cite it anywhere. An annexure that no pleading relies on invites the question of why it is on the record.`,
        { severity: "ADVISORY" }
      )
    );
  }

  return out;
};

// ── D4: pagination continuity ───────────────────────────────────────────────

const pagination_continuity: CheckFn = ({ bundle, rule }) => {
  const out: Defect[] = [];
  for (const doc of bundle.documents) {
    const numbered = doc.pages.filter((p) => p.printedPageNo !== null);
    // Fewer than half the pages carry a printed number: treat as unpaginated.
    if (doc.pages.length >= 4 && numbered.length < doc.pages.length / 2) {
      out.push(
        defect(
          rule,
          `${doc.fileName} is not paginated`,
          `Only ${numbered.length} of ${doc.pages.length} pages carry a printed page number. The paperbook must be consecutively paginated throughout.`,
          { documentId: doc.id }
        )
      );
      continue;
    }
    if (numbered.length < 2) continue;

    const breaks: number[] = [];
    const dupes: number[] = [];
    const seen = new Set<number>();
    let prev: number | null = null;
    for (const p of numbered) {
      const n = p.printedPageNo!;
      if (seen.has(n)) dupes.push(p.pageNo);
      seen.add(n);
      if (prev !== null && n !== prev + 1) breaks.push(p.pageNo);
      prev = n;
    }
    if (breaks.length)
      out.push(
        defect(
          rule,
          `Pagination breaks in ${doc.fileName}`,
          `The printed page numbers are not consecutive. The sequence breaks at ${breaks.length === 1 ? "sheet" : "sheets"} ${pageRanges(breaks)} of the file.`,
          { documentId: doc.id, pageNo: breaks[0] }
        )
      );
    if (dupes.length)
      out.push(
        defect(
          rule,
          `Repeated page numbers in ${doc.fileName}`,
          `The same printed page number appears more than once, at ${pageRanges(dupes)}.`,
          { documentId: doc.id, pageNo: dupes[0] }
        )
      );
  }
  return out;
};

// ── D3: left margin ─────────────────────────────────────────────────────────

const left_margin: CheckFn = ({ bundle, rule }) => {
  const minCm = Number(rule.params?.minCm ?? 4);
  // Allow 0.25 cm of measurement tolerance: text is measured to its glyph
  // origin, and we would rather miss a borderline page than cry wolf.
  const floor = minCm - 0.25;
  const out: Defect[] = [];
  for (const doc of bundle.documents) {
    const bad = doc.pages.filter(
      (p) => p.leftMarginCm !== null && p.leftMarginCm < floor
    );
    if (!bad.length) continue;
    const worst = bad.reduce((a, b) => (a.leftMarginCm! < b.leftMarginCm! ? a : b));
    out.push(
      defect(
        rule,
        `Left margin below ${minCm} cm in ${doc.fileName}`,
        `${plural(bad.length, "page")} ${verb(bad.length, "measures", "measure")} less than ${minCm} cm on the left. The narrowest is page ${worst.pageNo} at ${worst.leftMarginCm} cm. Affected pages: ${pageRanges(bad.map((p) => p.pageNo))}.`,
        { documentId: doc.id, pageNo: worst.pageNo }
      )
    );
  }
  return out;
};

// ── D7: vernacular pages with no translation filed ──────────────────────────

const vernacular_without_translation: CheckFn = ({ bundle, rule }) => {
  const out: Defect[] = [];
  const hasTranslation = bundle.documents.some((d) =>
    /translat/i.test(d.fileName) || /english translation/i.test(d.text.slice(0, 3000))
  );
  if (hasTranslation) return [];

  for (const doc of bundle.documents) {
    const indic = doc.pages.filter((p) => p.script === "devanagari");
    if (!indic.length) continue;
    out.push(
      defect(
        rule,
        `Untranslated vernacular pages in ${doc.fileName}`,
        `${plural(indic.length, "page")} ${verb(indic.length, "is", "are")} in a vernacular script and no English translation was found in the bundle. Affected pages: ${pageRanges(indic.map((p) => p.pageNo))}.`,
        { documentId: doc.id, pageNo: indic[0].pageNo }
      )
    );
  }
  return out;
};

// ── D8: dim / illegible annexures ───────────────────────────────────────────

const dim_annexure: CheckFn = ({ bundle, rule }) => {
  const MIN_DPI = 200;
  const out: Defect[] = [];
  for (const doc of bundle.documents) {
    const dim = doc.pages.filter(
      (p) =>
        typeof p.effectiveDpi === "number" &&
        p.effectiveDpi > 0 &&
        p.effectiveDpi < MIN_DPI &&
        p.charCount < 40
    );
    if (!dim.length) continue;
    const worst = dim.reduce((a, b) => (a.effectiveDpi! < b.effectiveDpi! ? a : b));
    out.push(
      defect(
        rule,
        `Low-resolution scanned pages in ${doc.fileName}`,
        `${plural(dim.length, "page")} ${verb(dim.length, "is an", "are")} image-only scan${verb(dim.length, "", "s")} below ${MIN_DPI} DPI, the range the Registry treats as dim. The worst is page ${worst.pageNo} at about ${worst.effectiveDpi} DPI. Affected pages: ${pageRanges(dim.map((p) => p.pageNo))}.`,
        { documentId: doc.id, pageNo: worst.pageNo }
      )
    );
  }
  return out;
};

// ── D1: OCR text layer ──────────────────────────────────────────────────────

const text_layer: CheckFn = ({ bundle, rule }) => {
  const bad = bundle.documents.filter((d) => !d.hasTextLayer && d.pageCount > 0);
  if (!bad.length) return [];
  return bad.map((d) =>
    defect(
      rule,
      `${d.fileName} has no searchable text layer`,
      `This file is an image-only scan across all ${plural(d.pageCount, "page")}. It looks correct on screen, which is why this defect survives an advocate's own proof-read, but the Registry's systems cannot read it.`,
      { documentId: d.id }
    )
  );
};

// ── D2: portal file-size cap ────────────────────────────────────────────────

const file_size: CheckFn = ({ bundle, rule }) => {
  const maxMb = Number(rule.params?.maxMb ?? 100);
  const totalBytes = bundle.documents.reduce((s, d) => s + d.sizeBytes, 0);
  const totalMb = totalBytes / (1024 * 1024);
  if (totalMb <= maxMb) return [];
  return [
    defect(
      rule,
      `Bundle exceeds the ${maxMb} MB e-filing cap`,
      `The bundle totals ${totalMb.toFixed(1)} MB against a cap of ${maxMb} MB. The portal will reject this before any human sees it.`
    ),
  ];
};

// ── Bookmarks ───────────────────────────────────────────────────────────────

const bookmarks: CheckFn = ({ bundle, rule }) => {
  const minPages = Number(rule.params?.minPagesToRequire ?? 25);
  const out: Defect[] = [];
  for (const d of bundle.documents) {
    if (d.pageCount < minPages || d.hasBookmarks) continue;
    out.push(
      defect(
        rule,
        `${d.fileName} has no bookmarks`,
        `A ${d.pageCount}-page document with no bookmark tree is hard for the bench to navigate on screen.`,
        { documentId: d.id }
      )
    );
  }
  return out;
};

// ── Blank pages ─────────────────────────────────────────────────────────────

const blank_pages: CheckFn = ({ bundle, rule }) => {
  const out: Defect[] = [];
  for (const d of bundle.documents) {
    const blanks = d.pages.filter((p) => p.isBlank);
    if (!blanks.length) continue;
    out.push(
      defect(
        rule,
        `Blank pages in ${d.fileName}`,
        `${plural(blanks.length, "page")} ${verb(blanks.length, "carries", "carry")} no content: ${pageRanges(blanks.map((p) => p.pageNo))}. Blank pages inflate the pagination and push the index out of step with the bundle.`,
        { documentId: d.id, pageNo: blanks[0].pageNo }
      )
    );
  }
  return out;
};

// ── Mixed page sizes / single-sided ─────────────────────────────────────────

const one_side_foolscap: CheckFn = ({ bundle, rule }) => {
  const out: Defect[] = [];
  for (const d of bundle.documents) {
    const sizes = new Set(d.pages.map((p) => `${p.widthPt}x${p.heightPt}`));
    if (sizes.size <= 1) continue;
    out.push(
      defect(
        rule,
        `Mixed page sizes in ${d.fileName}`,
        `This file contains ${sizes.size} different page sizes. A paperbook is prepared on uniform paper, single-sided, so it can be bound and annotated.`,
        { documentId: d.id }
      )
    );
  }
  return out;
};

// ── D11 / D12: signatures, attestation, welfare stamp ───────────────────────

const SIGN_RE =
  /\b(sd\/-|signature|signed|advocate for|counsel for|through\s+counsel|advocate-on-record|aor\b)/i;
const ATTEST_RE =
  /\b(oath commissioner|notary|notarial|attested|sworn|solemnly affirm|deponent)\b/i;
const WELFARE_RE =
  /\b(welfare\s*stamp|advocates?'?\s*welfare|welfare\s*fund)\b/i;

function docSignalCheck(
  kind: DocKind,
  re: RegExp,
  title: (f: string) => string,
  detail: string
): CheckFn {
  return ({ bundle, rule }) => {
    const wanted = (rule.params?.docKind as DocKind) ?? kind;
    const docs = bundle.documents.filter((d) => d.kind === wanted);
    const out: Defect[] = [];
    for (const d of docs) {
      // A scan with no text layer cannot be tested for a signature; saying
      // "unsigned" there would be a false accusation, so we stay silent and
      // the text-layer defect covers it.
      if (!d.hasTextLayer) continue;
      if (re.test(d.text)) continue;
      out.push(defect(rule, title(d.fileName), detail, { documentId: d.id }));
    }
    return out;
  };
}

const signature_missing = docSignalCheck(
  "PETITION",
  SIGN_RE,
  (f) => `No signature block found in ${f}`,
  "PARAM found no signature or counsel's stamp in the text of this document. If it is signed in ink on a scanned page, this check cannot see it — confirm by eye before filing."
);

const attestation_missing = docSignalCheck(
  "AFFIDAVIT",
  ATTEST_RE,
  (f) => `No attestation found in ${f}`,
  "PARAM found no attestation clause, Oath Commissioner or Notary endorsement in this affidavit. An unattested affidavit is not a sworn statement."
);

const welfare_stamp: CheckFn = ({ bundle, rule }) => {
  const vak = bundle.documents.filter((d) => d.kind === "VAKALATNAMA");
  const out: Defect[] = [];
  for (const d of vak) {
    if (!d.hasTextLayer) continue;
    if (WELFARE_RE.test(d.text)) continue;
    out.push(
      defect(
        rule,
        `Welfare stamp not evidenced on ${d.fileName}`,
        "PARAM found no reference to the Advocates' Welfare Fund stamp on this vakalatnama. A physical stamp on a scan cannot be detected from text alone — check it by eye, because this is one of the most routine objections raised.",
        { documentId: d.id, severity: "ADVISORY" }
      )
    );
  }
  return out;
};

// ── Index vs actual pagination ──────────────────────────────────────────────

const index_mismatch: CheckFn = ({ bundle, rule }) => {
  const index = bundle.documents.find((d) => d.kind === "INDEX");
  if (!index) return [];
  const total = bundle.documents.reduce((s, d) => s + d.pageCount, 0);
  // Highest page number the index claims to point at.
  const claimed = [...index.text.matchAll(/\b(\d{1,4})\s*$/gm)]
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n > 0 && n < 100000);
  if (!claimed.length) return [];
  const highest = Math.max(...claimed);
  if (highest <= total) return [];
  return [
    defect(
      rule,
      "Index points beyond the end of the bundle",
      `The index refers to page ${highest}, but the bundle runs to ${total} pages. The index is out of step with what has actually been filed.`,
      { documentId: index.id }
    ),
  ];
};

// ── Registry ────────────────────────────────────────────────────────────────

/**
 * A rule whose `check` has no entry here is inert: it appears in the browsable
 * rulebook but can never raise a defect. That is intentional for objections a
 * machine genuinely cannot test (a physical stamp, a caveat report), and it is
 * shown honestly in the UI rather than quietly dropped.
 */
export const CHECKS: Record<string, CheckFn> = {
  missing_document,
  annexure_cross_reference,
  pagination_continuity,
  left_margin,
  vernacular_without_translation,
  dim_annexure,
  text_layer,
  file_size,
  bookmarks,
  blank_pages,
  one_side_foolscap,
  signature_missing,
  attestation_missing,
  welfare_stamp,
  index_mismatch,
};

/** Checks handled elsewhere: limitation by its own engine, the rest by AI. */
export const NON_DETERMINISTIC = new Set([
  "limitation",
  "provision_check",
  "cause_title_match",
  "synopsis_prayer",
]);

/** Objections a machine cannot honestly test. Shown, never fired. */
export const MANUAL_ONLY = new Set(["manual"]);
