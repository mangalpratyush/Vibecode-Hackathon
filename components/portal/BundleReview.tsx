"use client";

import { useMemo, useState } from "react";
import { ChevronDown, FileText, Languages, ScanLine, Search, SquareDashed, X } from "lucide-react";

/**
 * The paperbook, at a glance and then in detail.
 *
 * A bundle is a physical object before it is a legal one, and the checks an
 * advocate runs on getting one back from the typist are physical too: is
 * anything missing, is anything blank, can it be read. So the page leads with a
 * map of every sheet in filing order, one cell each, coloured by what a machine
 * can make of it. Three hundred sheets fit in a glance, and a run of amber in
 * the middle of an annexure is visible instantly in a way no table of counts
 * makes it.
 *
 * The map and the list are one control. Clicking a sheet opens the document it
 * belongs to, because the question a flagged cell provokes is always "which
 * file is that, and what else is wrong with it".
 */

type Script = "latin" | "devanagari" | "other" | "none";

export interface ReviewPage {
  pageNo: number;
  charCount: number;
  wordCount: number;
  isBlank: boolean;
  script: Script;
  effectiveDpi: number | null;
  printedPageNo: number | null;
}

export interface ReviewDocument {
  id: string;
  fileName: string;
  kindLabel: string;
  kindSource: "filename" | "keywords" | "ai" | "user";
  kindConfidence: number;
  annexureMark: string | null;
  pageCount: number;
  sizeBytes: number;
  hasTextLayer: boolean;
  preview: string;
  pages: ReviewPage[];
}

/** The four things a sheet can be, worst last so the legend reads upward. */
type Condition = "text" | "vernacular" | "scanned" | "blank";

const CONDITION: Record<Condition, { label: string; hint: string; swatch: string; cell: string; chip: string }> = {
  text: {
    label: "Readable",
    hint: "Carries a text layer the Registry can search.",
    swatch: "bg-[#dde8e0] border-[#bcd2c3]",
    cell: "bg-[#dde8e0] border-[#bcd2c3] hover:bg-[#cbdfd2]",
    chip: "border-[#cfe3d7] bg-[#eaf4ee] text-[#2c7353]",
  },
  vernacular: {
    label: "Vernacular",
    hint: "Not in the language of the court. A translation is likely required.",
    swatch: "bg-[#dbe5f0] border-[#bccfe3]",
    cell: "bg-[#dbe5f0] border-[#bccfe3] hover:bg-[#c9d9ea]",
    chip: "border-[#d7e3ee] bg-[#edf3f8] text-[#3f698d]",
  },
  scanned: {
    label: "No text layer",
    hint: "An image only. It cannot be searched, and it is a common ground for return.",
    swatch: "bg-[#f5e4c4] border-[#e2c999]",
    cell: "bg-[#f5e4c4] border-[#e2c999] hover:bg-[#eed6ab]",
    chip: "border-[#ebd9b6] bg-[var(--objection-bg)] text-objection",
  },
  blank: {
    label: "Blank",
    hint: "Nothing on the sheet. Check it is a deliberate separator.",
    swatch: "bg-[#ebe5dc] border-[#d7cec1]",
    cell: "bg-[#ebe5dc] border-[#d7cec1] hover:bg-[#ded7ca]",
    chip: "border-[#ddd5c4] bg-[#f4efe8] text-ink-soft",
  },
};

const ORDER: Condition[] = ["scanned", "blank", "vernacular", "text"];

function conditionOf(p: ReviewPage): Condition {
  if (p.isBlank) return "blank";
  if (p.charCount === 0) return "scanned";
  if (p.script === "devanagari" || p.script === "other") return "vernacular";
  return "text";
}

export default function BundleReview({ documents }: { documents: ReviewDocument[] }) {
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<Condition | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pick, setPick] = useState<{ docId: string; pageNo: number } | null>(null);

  /* One flat run of sheets in filing order, each knowing where it came from. */
  const sheets = useMemo(() => {
    let n = 0;
    return documents.flatMap((d) =>
      d.pages.map((p) => ({
        sheet: ++n,
        docId: d.id,
        fileName: d.fileName,
        page: p,
        condition: conditionOf(p),
      })),
    );
  }, [documents]);

  const tally = useMemo(() => {
    const t: Record<Condition, number> = { text: 0, vernacular: 0, scanned: 0, blank: 0 };
    for (const s of sheets) t[s.condition] += 1;
    return t;
  }, [sheets]);

  const picked = pick
    ? sheets.find((s) => s.docId === pick.docId && s.page.pageNo === pick.pageNo) ?? null
    : null;

  const q = query.trim().toLowerCase();
  const shown = documents.filter((d) => {
    if (q && !(d.fileName.toLowerCase().includes(q) || d.kindLabel.toLowerCase().includes(q))) return false;
    if (only && !d.pages.some((p) => conditionOf(p) === only)) return false;
    return true;
  });

  function openSheet(docId: string, pageNo: number) {
    setPick({ docId, pageNo });
    setOpenId(docId);
    setOnly(null);
    setQuery("");
    requestAnimationFrame(() => {
      document.getElementById("doc-" + docId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <div className="space-y-5">
      <section className="workspace-card overflow-hidden" aria-label="Sheet map">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule/70 px-6 py-4">
          <div>
            <h2 className="font-serif text-[19px] font-semibold tracking-[-0.02em] text-ink">
              The paperbook, sheet by sheet
            </h2>
            <p className="mt-1 text-[12.5px] text-ink-soft">
              {sheets.length} sheets in filing order. Select one to open its document.
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
            {ORDER.filter((c) => tally[c] > 0).map((c) => (
              <li key={c} className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                <span className={`h-3 w-[9px] rounded-[2px] border ${CONDITION[c].swatch}`} />
                <span className="num font-semibold text-ink">{tally[c]}</span>
                {CONDITION[c].label}
              </li>
            ))}
          </ul>
        </header>

        <div className="flex flex-wrap gap-[3px] px-6 py-5">
          {documents.map((d, di) => (
            <div key={d.id} className={`flex flex-wrap gap-[3px] ${di > 0 ? "ml-3.5" : ""}`}>
              {d.pages.map((p) => {
                const c = conditionOf(p);
                const on = picked?.docId === d.id && picked.page.pageNo === p.pageNo;
                return (
                  <button
                    key={p.pageNo}
                    type="button"
                    onClick={() => openSheet(d.id, p.pageNo)}
                    aria-label={d.fileName + ", page " + p.pageNo + ". " + CONDITION[c].label + "."}
                    title={d.fileName + " — page " + p.pageNo + " — " + CONDITION[c].label}
                    className={`h-[26px] w-[19px] rounded-[3px] border transition ${CONDITION[c].cell} ${
                      on ? "ring-2 ring-[var(--brand)] ring-offset-1 ring-offset-[#fffdf9]" : ""
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t border-rule/70 bg-[#faf6ef] px-6 py-3.5">
          {picked ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-soft">
              <span className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.07em] ${CONDITION[picked.condition].chip}`}>
                {CONDITION[picked.condition].label}
              </span>
              <span className="font-semibold text-ink">Sheet {picked.sheet}</span>
              <span aria-hidden>&middot;</span>
              <span className="truncate">{picked.fileName}, page {picked.page.pageNo}</span>
              {picked.page.printedPageNo != null && (
                <>
                  <span aria-hidden>&middot;</span>
                  <span>printed {picked.page.printedPageNo}</span>
                </>
              )}
              {picked.page.wordCount > 0 && (
                <>
                  <span aria-hidden>&middot;</span>
                  <span>{picked.page.wordCount} words</span>
                </>
              )}
              {picked.page.effectiveDpi != null && (
                <>
                  <span aria-hidden>&middot;</span>
                  <span className={picked.page.effectiveDpi < 200 ? "font-semibold text-objection" : ""}>
                    {Math.round(picked.page.effectiveDpi)} dpi{picked.page.effectiveDpi < 200 ? ", dim" : ""}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => setPick(null)}
                className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-ink-soft transition hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Clear
              </button>
            </div>
          ) : (
            <p className="text-[12.5px] text-ink-soft">
              {tally.scanned + tally.blank > 0
                ? "Amber and grey sheets are the ones to look at first."
                : "Every sheet in this bundle carries readable text."}
            </p>
          )}
        </div>
      </section>

      <section className="workspace-card overflow-hidden" aria-label="Documents in this bundle">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/70 px-6 py-4">
          <h2 className="font-serif text-[19px] font-semibold tracking-[-0.02em] text-ink">Documents as received</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-ink-soft/70" strokeWidth={1.9} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a document"
              aria-label="Find a document"
              className="h-9 w-[210px] rounded-lg border border-rule bg-paper-raised pl-9 pr-3 text-[12.5px] text-ink outline-none transition placeholder:text-ink-soft/60 focus:border-[var(--brand)]/50"
            />
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-rule/70 px-6 py-3">
          <Chip on={only === null} onClick={() => setOnly(null)} count={documents.length}>
            All documents
          </Chip>
          {(["scanned", "vernacular", "blank"] as Condition[]).map((c) => {
            const n = documents.filter((d) => d.pages.some((p) => conditionOf(p) === c)).length;
            if (!n) return null;
            return (
              <Chip key={c} on={only === c} onClick={() => setOnly(only === c ? null : c)} count={n}>
                {c === "scanned" ? "Without text" : c === "vernacular" ? "Vernacular" : "With blanks"}
              </Chip>
            );
          })}
          {only && <span className="text-[11.5px] text-ink-soft">{CONDITION[only].hint}</span>}
        </div>

        {shown.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13px] text-ink-soft">Nothing matches that.</p>
        ) : (
          <ul className="divide-y divide-rule/60">
            {shown.map((d) => {
              const open = openId === d.id;
              const flagged = d.pages.filter((p) => conditionOf(p) !== "text");
              return (
                <li key={d.id} id={"doc-" + d.id} className="scroll-mt-6">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : d.id)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-4 px-6 py-4 text-left transition hover:bg-[#faf6ef]"
                  >
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4efe8] text-[var(--brand)]">
                      <FileText className="h-[17px] w-[17px]" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">{d.fileName}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-ink-soft">
                        <span className="font-semibold text-ink/70">{d.kindLabel}</span>
                        {d.annexureMark && (
                          <>
                            <span aria-hidden>&middot;</span>
                            <span>Annexure {d.annexureMark}</span>
                          </>
                        )}
                        <span aria-hidden>&middot;</span>
                        <span>{d.pageCount} {d.pageCount === 1 ? "page" : "pages"}</span>
                        <span aria-hidden>&middot;</span>
                        <span>{fileSize(d.sizeBytes)}</span>
                      </span>
                    </span>
                    {flagged.length > 0 && (
                      <span className={`mt-0.5 shrink-0 rounded-md border px-2 py-1 text-[10.5px] font-bold uppercase tracking-[0.07em] ${CONDITION[conditionOf(flagged[0])].chip}`}>
                        {flagged.length} to check
                      </span>
                    )}
                    <ChevronDown
                      className={`mt-1.5 h-4 w-4 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
                      strokeWidth={2}
                    />
                  </button>

                  {open && (
                    <div className="space-y-4 border-t border-rule/50 bg-[#faf6ef] px-6 py-5">
                      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
                        <Fact label="Classified as">{d.kindLabel}</Fact>
                        <Fact label="Read from">
                          {d.kindSource === "filename"
                            ? "the file name"
                            : d.kindSource === "keywords"
                              ? "the document text"
                              : d.kindSource === "ai"
                                ? "assisted reading"
                                : "your correction"}
                          {" · "}
                          {d.kindConfidence}% sure
                        </Fact>
                        <Fact label="Text layer">{d.hasTextLayer ? "Present" : "Absent on every page"}</Fact>
                      </dl>

                      {flagged.length > 0 ? (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">Sheets to look at</p>
                          <ul className="mt-2.5 flex flex-wrap gap-2">
                            {flagged.map((p) => {
                              const c = conditionOf(p);
                              return (
                                <li key={p.pageNo}>
                                  <button
                                    type="button"
                                    onClick={() => openSheet(d.id, p.pageNo)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition hover:brightness-95 ${CONDITION[c].chip}`}
                                  >
                                    {c === "scanned" ? (
                                      <ScanLine className="h-3.5 w-3.5" strokeWidth={2} />
                                    ) : c === "vernacular" ? (
                                      <Languages className="h-3.5 w-3.5" strokeWidth={2} />
                                    ) : (
                                      <SquareDashed className="h-3.5 w-3.5" strokeWidth={2} />
                                    )}
                                    Page {p.pageNo}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-[12.5px] text-ink-soft">
                          Every page carries readable text. Nothing to look at here.
                        </p>
                      )}

                      {d.preview && (
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">First page, as read</p>
                          <p className="mt-2 rounded-xl border border-rule/70 bg-paper-raised px-4 py-3 font-serif text-[13.5px] leading-6 text-ink/85">
                            {d.preview}
                            &hellip;
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Chip({ on, onClick, count, children }: {
  on: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition ${
        on
          ? "border-[var(--brand)]/40 bg-[#f4e9e6] text-[var(--brand)]"
          : "border-rule bg-paper-raised text-ink-soft hover:bg-[#f7f2eb] hover:text-ink"
      }`}
    >
      {children}
      <span className="num opacity-70">{count}</span>
    </button>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-soft">{label}</dt>
      <dd className="mt-1 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  const kb = bytes / 1024;
  if (kb < 1024) return Math.round(kb) + " KB";
  return (kb / 1024).toFixed(1) + " MB";
}
