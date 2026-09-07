# PARAM — परम
### Pre Assessment Registry and Audit Mitra
**"Cleared before you file."**

> The Registry checks your filing *after* you file it, and tells you what is wrong in
> instalments. PARAM runs the same checkslip *before* you file, in one shot, with the
> rule cited for every defect.

---

## 1. The problem

Every case filed in an Indian court is **scrutinised by the Registry against a checkslip**
before it is given a case number and listed. If it fails, it is returned as
"objections" / "defects". This is where the system quietly bleeds time.

| Evidence | Source |
|---|---|
| **1,25,87,329 cases** e-filed as of 30 Jun 2026 (20,18,013 High Court + 1,05,69,316 district). E-filing rules notified in **25 High Courts**. | Govt. reply, Lok Sabha |
| Defects are **raised in instalments** — pagination first, then court fee, then certified copy. Every extra round means "delay, expense, anxiety and avoidable procedural uncertainty". | LiveLaw, 2026 |
| **729 SC petitions** had lain in defect in the Registry since 2010, never cured. | Business Standard / SC |
| One appellant **re-filed seven times** to clear defects on a single appeal. | NCLAT reporting |
| Delhi HC allows only **7 days at a time / 30 days aggregate** to cure defects. | Delhi HC (Original Side) Rules 2018 |
| **Limitation keeps running** while the filing sits in defect. Re-filing delay is separately reckoned. | NCLAT; Limitation Act s.3 |
| Delhi HC publishes an **official "List of Common Objections"** per case-type (CUSAC, CRLR, CRLMP, CRLW, CRLMM, CIVIL WRIT, CRL CONTEMPT, CRLMA, CR, CRLA). | delhihighcourt.nic.in |
| Model High Court Rules Ch. 5 **expressly authorises "technological tools"** to scrutinise pleadings against checkslips. | DAKSH / Model HC Rules |

Limitation is the fatal one. **Section 3 of the Limitation Act is mandatory** — the court
must dismiss a time-barred proceeding *suo motu*, even if the other side never raises it.
So a filing that bounces three times on pagination can die on limitation.

### Why nobody has built it

Indian legal tech has clustered in three places, all crowded:

- **Research** — SCC Online, Manupatra, CaseMine, Indian Kanoon
- **Case / cause-list tracking** — Legistify, MikeLegal, Jhana
- **Limitation calculators** — LexNet, Niyam, Vakeel360, Thakkadi, ASK Law Xperts.
  All are date-arithmetic widgets: pick an Article, type a date, get a number.
  None of them read your actual documents.

Nobody has built the thing that sits **between drafting and filing**. The LiveLaw
author's own list of reforms ends at *"Advocate responsibility: pre-filing checklists to
prevent preventable defects."* That sentence is the product.

---

## 2. What PARAM is

Upload the filing bundle, and PARAM returns a **consolidated defect memo** before the
Registry writes one — every defect carrying its rule citation, page reference and a fix.
Then it repairs the mechanical ones and exports a clean bundle.

```
  Upload bundle              PARAM scrutiny                Output
  -------------              --------------                ------
  Petition / SLP    |                                | Consolidated Defect Memo
  Certified copy    |   1. Ingest & page forensics   |   Fatal / Objection / Advisory
  Annexures P-1..n  |   2. Classify each document    |   each with rule + page no.
  Affidavit         |-> 3. Run court checkslip       |->
  Vakalatnama       |   4. Limitation computation    | Repaired bundle (auto-fix)
  Court fee         |   5. Draft the cures           | Drafted cures
  Listing proforma  |                                |   condonation appln, index,
                                                          memo of parties
```

---

## 3. The four judging criteria, answered

**Does it work?** The majority of checks are deterministic and verifiable live on stage.
"Annexure P-7 is referred to at page 14 of the petition but is not in the bundle" is
either true or false — a judge can open the PDF and confirm. No hand-waving.

**Does it address a real problem?** Documented above, with primary sources, and current
(the LiveLaw piece is 2026). Every litigator in the room has been sent back by a Registry.

**How effectively did the team use the AI-assisted development tool?** Two honest stories:
(a) the tool's own architecture — **AI classifies and extracts, deterministic code
decides** (inherited from SIIM's stated design rule), because a defect verdict must be a
cited rule, not a hallucination; (b) the build itself — a ~120-rule cited rulebook plus a
PDF-forensics engine assembled in hackathon time.

**Would a lawyer use it on Monday?** Monday is a filing day. A junior or clerk prepares
the bundle; PARAM is the last step before hitting upload. It saves a re-filing round,
which is days.

---

## 4. Architecture

Same stack as SIIM — proven, Windows-friendly, one `npm run dev`, no Python.

```
D:\Vibecode Hackathon\param\
  app/
    (portal)/
      new/            upload bundle + case metadata form
      scrutiny/[id]/  defect memo (the money screen)
      rulebook/       browsable cited rulebook - judge-facing trust
      export/         repaired bundle + memo PDF
    api/
      bundle/         upload, parse, persist
      scrutiny/       run engine
      fix/            auto-repair
      draft/          generate cures
  lib/
    ai/provider.ts          <- PORTED from SIIM as-is (multi-provider, no-key fallback)
    docs/
      read-file.ts          <- PORTED (pdfjs-dist / pdf-parse text extraction)
      classify.ts           <- REWRITTEN: court document taxonomy
      geometry.ts           NEW: margins, pagination, text layer, DPI
    scrutiny/
      run.ts                NEW: orchestrator
      checks/*.ts           NEW: one module per check family
      limitation.ts         NEW: s.12(2), s.4, s.5, COVID exclusion
    rulebook/
      sc-rules-2013.json    NEW: cited
      dhc-os-rules-2018.json
      dhc-efiling-2021.json
      dhc-common-objections.json
      holidays/*.json       court calendars for s.4
    fix/repair.ts           NEW: pdf-lib repagination, index, compression
    draft/                  <- ADAPTED from SIIM draft-template.ts
    rag/                    <- PORTED: citation retrieval
  docs/
```

**Dependencies** (all already proven in SIIM): `next@16`, `react@19`, `typescript`,
`tailwindcss@4`, `mongodb`, `pdfjs-dist`, `pdf-parse`, `pdfkit`, `sharp`, `lucide-react`,
`jose`, `bcryptjs`. Add `pdf-lib` for page-level rewriting.

---

## 5. The scrutiny engine — check catalogue

### 5A. Deterministic checks (no AI — these are what make it *work*)

| # | Check | Detects | Rule cited |
|---|---|---|---|
| D1 | **Text-layer test** | Scanned PDF with no OCR layer | DHC E-filing Rules 2021 — must be OCR-searchable PDF / PDF-A |
| D2 | **File size** | Over 100 MB (HC) / 20 MB (district) | DHC E-filing Rules 2021 |
| D3 | **Left margin** | Measured from pdfjs text transforms; under 4 cm | DHC List of Common Objections |
| D4 | **Pagination continuity** | Missing / duplicate / out-of-order page numbers | DHC objections; SC Rules Ord. VIII |
| D5 | **Index vs actual** | Index page numbers do not match real pages | DHC objections |
| D6 | **Annexure cross-reference** | `Annexure P-7` cited in the petition body but absent from the bundle — *and the reverse* | SC Rules Ord. XXI; DHC objections |
| D7 | **Vernacular without translation** | Devanagari / other-script pages with no English translation filed | DHC: "English translation of vernacular be filed" |
| D8 | **Dim / illegible annexure** | Low contrast plus low effective DPI via `sharp` | DHC: "fair typed copies of dim annexures be filed" |
| D9 | **Blank / duplicate pages** | Empty pages inside the bundle | DHC objections |
| D10 | **Missing mandatory document** | Bundle lacks vakalatnama / affidavit / memo of parties / listing proforma / synopsis and list of dates / certified copy — resolved per court and case-type | Court checkslip |
| D11 | **Unsigned / unattested** | No signature or attestation block on affidavit / vakalatnama / petition | DHC: "affidavit should be attested"; "petition be stamped / signed by Counsel" |
| D12 | **Welfare stamp** | Rs.10 advocates' welfare stamp absent on vakalatnama | DHC objections |
| D13 | **Court fee** | Amount vs required for court, case-type and valuation | Court Fees Act; DHC objections |
| D14 | **Bookmarks** | PDF has no bookmark tree | DHC E-filing Rules 2021 |
| D15 | **Single-side / foolscap** | Page geometry violation | DHC: "all papers on one side of the paper" |

### 5B. AI-assisted checks (Claude does judgement, code does the verdict)

| # | Check | Why AI |
|---|---|---|
| A1 | **Document classification** | Which PDF is the vakalatnama vs the affidavit vs Annexure P-3 — layout varies wildly |
| A2 | **Cause-title match** | Party names in the memo of parties vs the impugned order — needs fuzzy and transliteration tolerance |
| A3 | **Synopsis / prayer consistency** | Delhi HC objection: "mismatch between synopsis and prayer" |
| A4 | **Correct provision of law** | DHC objection: "correct and relevant provision of law be given" — e.g. an Art. 227 petition drafted as Art. 226 |
| A5 | **Date extraction** | Pull pronouncement date, certified-copy application date and ready date off the copy's endorsement — this feeds the limitation engine and is exactly what existing calculators cannot do |

> **Design rule, inherited from SIIM:** the LLM classifies and extracts; the deterministic
> engine decides. Every defect in the memo resolves to a rulebook row with a citation.
> If no API key is set, A1–A5 degrade to pattern-matching and say so — the app never
> fabricates a defect.

### 5C. Limitation engine

The Registry's own defect list includes **"appeal / petition is barred by time"**. This
module is the differentiator against the six existing calculators, because it computes
from *the documents*, not from a dropdown.

1. **Prescribed period** — Limitation Act Schedule plus special statutes: SLP 90 days,
   HC appeal 90 days, district appeal 30 days, review, revision,
   Arbitration s.34(3) (3 months + 30 days, no s.5 relief, hard stop at 120 days),
   NI Act ss.138/142 (15-day notice, then 30-day complaint window), Consumer s.69,
   Commercial Courts s.13.
2. **s.12(1)** — exclude the day the judgment was pronounced.
3. **s.12(2)** — exclude the *time requisite for obtaining the certified copy*,
   read off the copy's own endorsement (applied-on to ready-on). Time the court took
   to prepare the decree *before* the application was made is **not** excluded.
4. **s.4** — if the period expires on a day the court is closed, next working day.
   Requires the encoded court holiday calendar.
5. **COVID exclusion** — 15.03.2020 to 28.02.2022 excluded, with a 90-day floor from
   01.03.2022 (*In Re: Cognizance for Extension of Limitation*, order dt. 10.01.2022),
   applied only where the cause of action reaches into that window.
6. **Output** — due date, days remaining or overdue, and if overdue: whether s.5
   condonation is available at all (it is **not** for Arbitration s.34 beyond 120 days),
   how many days must be explained, and a **drafted condonation application** with a
   day-by-day chart — because courts require every single day of delay to be explained.

---

## 6. Rulebook — the trust surface

Every rule is a row. Nothing is hardcoded in the engine.

```jsonc
{
  "id": "DHC-OBJ-VERNACULAR-01",
  "court": "DELHI_HIGH_COURT",
  "caseTypes": ["CIVIL_WRIT", "CRLA", "CRLW", "CUSAC"],
  "severity": "REGISTRY_OBJECTION",       // FATAL | REGISTRY_OBJECTION | ADVISORY
  "check": "vernacular_without_translation",
  "text": "English translation of vernacular document be filed.",
  "source": "Delhi High Court - List of Common Objections (CUSAC)",
  "sourceUrl": "https://www.delhihighcourt.nic.in/web/faqs/list-of-common-objections",
  "verifiedOn": "2026-09-08",
  "fix": { "auto": false, "guidance": "File a typed English translation...", "draft": null }
}
```

`sourceUrl` and `verifiedOn` on every row, and a **browsable `/rulebook` screen**. When a
practitioner judge asks *"where does that come from?"*, the answer is one click.

**Build discipline:** every rule is verified against the primary source PDF before it is
encoded. Rules we cannot verify are marked `"status": "unverified"` and excluded from the
demo rather than guessed at.

---

## 7. Auto-fix

Only where it is safe and reversible:

- Repaginate the bundle and stamp page numbers (`pdf-lib`)
- Regenerate the index against actual pages
- Generate memo of parties, listing proforma, condonation application (`pdfkit`)
- Compress oversized bundles under the portal cap (`sharp` re-encode of image pages)
- Flag-only, never auto: translations, signatures, court fee, certified copies

Diff view before and after. The advocate approves each fix — nothing is silently changed
in a document that goes to a court.

---

## 8. Build phases

| Phase | Work | Est. |
|---|---|---|
| **0** | Scaffold Next.js 16 + Tailwind 4 + Mongo. Port `ai/provider.ts`, `read-file.ts`, `rag/`. | 2h |
| **1** | Bundle ingest plus page forensics (`geometry.ts`): text layer, margins, pagination, DPI, blank pages, size. **Checks D1–D5, D9, D14, D15.** | 4h |
| **2** | Rulebook v1: SC Rules 2013 + DHC OS Rules 2018 + DHC E-filing 2021 + DHC List of Common Objections. ~120 rows, each verified and cited. | 4h |
| **3** | Document classification (`classify.ts` + A1) and the mandatory-document check **D10**. Annexure cross-reference **D6** — highest-impact single check. | 4h |
| **4** | Limitation engine, court holiday calendars, condonation draft. | 4h |
| **5** | AI checks A2–A5. Signature/stamp detection D11–D12, vernacular D7, dim-annexure D8, court fee D13. | 4h |
| **6** | Defect memo UI, rulebook browser, auto-fix and export. | 5h |
| **7** | Demo bundle (deliberately defective SLP), seed data, README, walkthrough. | 3h |

Front-load Phases 1–3: a working annexure cross-reference and mandatory-document check
alone already beats every existing tool.

---

## 9. Demo script (3 minutes)

1. **The setup, 20s.** "Every filing is scrutinised by the Registry. Defects come back in
   instalments. One appellant re-filed seven times. Meanwhile limitation runs — and under
   s.3 the court must dismiss a time-barred matter on its own motion."
2. **Upload, 30s.** A real-shaped SLP bundle with planted defects.
3. **The memo, 90s.** 11 defects in about 30 seconds. Walk three:
   - *Fatal* — "Annexure P-7 cited at page 14, absent from the bundle."
     Open page 14 on screen. It is there. It is true.
   - *Fatal* — "Barred by time by 6 days. Certified copy applied 12.03, ready 04.04 —
     23 days excluded under s.12(2), leaving expiry on 02.09. Today is 08.09.
     Condonation application required, 6 days to be explained." Show the drafted application.
   - *Objection* — "Pages 41–48 are in Hindi with no English translation filed."
     Cite the Delhi HC objections list, click through to the rulebook entry.
4. **Fix, 30s.** Repaginate, regenerate index, export clean bundle.
5. **The close, 10s.** "The Registry would have found these across three rounds over nine
   days. PARAM found them in thirty seconds, before filing."

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Judges say "the Registry will still object" | We never claim to replace scrutiny. We remove the *preventable* rounds — which is the reform LiveLaw itself asked for. |
| Rulebook accuracy challenged by a practitioner | Every row cites a primary source with a `verifiedOn` date and is browsable in-app. Unverified rules excluded. |
| PDF parsing fails on a real scanned bundle | Ship a curated demo bundle; degrade gracefully with an explicit "no text layer — OCR required" defect, which is itself a real D1 defect. |
| "It's just a checklist" | The annexure cross-reference, s.12(2) limitation read from the certified-copy endorsement, and auto-repagination are not checklist items. No calculator on the market reads the documents. |
| No API key at demo time | `ai/provider.ts` fallback: deterministic checks still run, AI checks disable with a clear message. Never fabricates. |

---

## 11. What we port from SIIM

| From SIIM | Into PARAM | Change |
|---|---|---|
| `lib/ai/provider.ts` | `lib/ai/provider.ts` | as-is |
| `lib/document-processing/read-file.ts` | `lib/docs/read-file.ts` | as-is |
| `lib/document-processing/extract.ts` | `lib/docs/classify.ts` | taxonomy rewritten for court documents |
| `lib/engine/forensics.ts` | `lib/scrutiny/run.ts` | same philosophy (*what a reviewer will question before filing*), new domain |
| `lib/engine/filing-pack.ts` | `lib/fix/repair.ts` | adapted |
| `lib/engine/draft-template.ts` | `lib/draft/` | adapted |
| `lib/rag/*` | `lib/rag/*` | as-is, retrieves rule citations |
| auth / mongodb / pdfkit export / portal shell | same | as-is |

Nothing SEBI-domain is carried over. Fresh git history.

---

## 12. Sources

- LiveLaw — *When Filing Becomes a Battle: Need for A One-Shot Defect Scrutiny In Supreme Court Registry* (2026)
- Delhi High Court — *List of Common Objections* — delhihighcourt.nic.in/web/faqs/list-of-common-objections
- Delhi High Court (Original Side) Rules, 2018; E-filing Rules of the High Court of Delhi, 2021
- Supreme Court Rules, 2013 — Orders VIII, XV, XXI, XXII
- Limitation Act, 1963 — ss. 3, 4, 5, 12, 14, 18, 19 and the Schedule
- *In Re: Cognizance for Extension of Limitation*, SMW(C) No. 3/2020, order dt. 10.01.2022
- DAKSH — *Model High Court Rules, Chapter 5: Scrutiny*
- Business Standard — *Court unnecessarily burdened with defective petitions: SC*
- Lok Sabha reply on e-Courts e-filing figures, 30 June 2026
