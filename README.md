# PARAM — परम
### Pre Assessment Registry and Audit Mitra
**Cleared before you file.**

> Every case filed in an Indian court is scrutinised by the Registry against a
> checkslip before it gets a case number. Fail, and it comes back as defects —
> and they come back **in instalments**: pagination first, then court fee, then
> the certified copy. All the while limitation keeps running, and under s.3 of
> the Limitation Act a court **must** dismiss a time-barred matter on its own
> motion.
>
> PARAM runs that same checkslip over your bundle **before** you file, in one
> shot, and cites the rule for every defect it raises.

---

## Run it

```bash
npm install
cp .env.local.example .env.local     # set AUTH_SECRET to any long random string
npm run dev
```

Open http://localhost:3000 and sign in with **advocate@param.demo** / `Param@123`.

Nothing else is required. No database, no API key. MongoDB and an AI key each
add something (below), but the scrutiny engine, the rulebook and the limitation
computation all run on a clean checkout.

### See it work

```bash
npm run seed:demo        # generates the bundle and seeds it on advocate@param.demo,
                         # so "Explore the live demo" lands on a real memo
npm run selftest         # asserts every planted defect is caught, both courts
npm run test:fix         # date extraction, bundle repair, condonation draft
npm run test:assistant   # asks the Assistant in 6 languages, checks none are refused
npm run seed             # MongoDB collections + indexes (only if MONGODB_URI is set)
```

`make-demo-bundle.mjs` prints the dates to enter on the form. Upload the seven
PDFs from `demo-bundle/` and PARAM will find, among others, that **Annexure P-7
is relied on at pages 6 and 9 of the petition and is not in the bundle** — open
the PDF at page 6 and check.

---

## What it does

**Deterministic scrutiny.** Fifteen checks measured from the PDFs themselves:
left margin in centimetres, printed-page continuity, OCR text layer, effective
scan DPI, page script, blank pages, mixed page sizes, portal size cap, missing
mandatory documents, signature and attestation blocks, index-to-bundle
agreement, and — the highest-value one — **annexure cross-reference in both
directions**, reconciling what the petition relies on against what is actually
filed.

**Limitation, computed from the documents.** Not a dropdown. It applies s.12(1),
the prescribed period, the **s.12(2) exclusion of the time requisite for
obtaining the certified copy** read off the copy's own endorsement, the Supreme
Court's COVID exclusion where the period was running in that window, and s.4
where expiry falls on a day the court is closed. Every step is shown with the
provision it applied, because an advocate cannot rely on a number they cannot
check.

> The demo case exists to make this concrete. On its face the filing is **13
> days out of time** — which is what a dropdown calculator will tell you.
> Exclude the 18 days requisite for the certified copy under s.12(2), notice
> that the resulting expiry falls on a Sunday under s.4, and the advocate in
> fact has until Monday 14.09.2026: **six clear days**.

**Dates read off the documents.** If the advocate leaves the date fields blank,
PARAM reads the pronouncement date and the certified copy's applied-on /
ready-on endorsement out of the copy itself and computes limitation from those.
A date typed on the form always wins — the person filing knows their own matter.
Provenance is recorded either way, so the memo can say where each date came from.

**A consolidated defect memo.** One shot, sorted fatal-first, each defect
carrying the Registry's own wording, the primary source, a link to it, the rule
id, the page it sits on, and how to cure it.

**Cures, drafted.** `GET /api/draft?kind=condonation` produces the s.5
application with the day-by-day computation already in a schedule — and refuses
to produce one when the filing is in time, or when the delay is beyond what any
court may condone (Arbitration s.34). The *reason* for the delay is left as a
visible blank: a cause stated on affidavit has to be true, so PARAM does not
invent one.

**Repair.** `GET /api/fix` returns the bundle merged in paperbook order with a
regenerated index. See the note on repagination below.

**PARAM Assistant.** A destination in the left rail, not a floating bubble.
Answers filing questions in the language they were asked in — English, हिंदी,
বাংলা, தமிழ், मराठी, romanised Hinglish. The reply language is decided
server-side from the script of the question, not guessed by the model. A bundle
selector at the top of the screen makes the grounding explicit: pick one and
answers about it come from what the scrutiny actually found; pick none and it
answers on the rulebook and general practice, and says so.

---

## The one rule this is built on

> **The LLM classifies and extracts. The deterministic engine decides.**

Every defect resolves to a row in `lib/rulebook/*.json` carrying its primary
source and the date we last checked it. The model never decides that a filing is
defective, and never invents a rule or a citation. A hallucinated Registry
objection would be worse than no tool at all.

This is why the app degrades honestly rather than gracefully: with no API key,
the deterministic scrutiny runs in full, the AI-assisted checks appear under
**Not checked** with the reason, and the Assistant says it needs a key. It never
fabricates a finding to fill the space.

The scrutiny result reports what **passed** and what was **not checked**
alongside what failed, for the same reason — a tool that only ever shows
problems leaves you unable to tell "clean" from "not looked at".

---

## The rulebook

31 rules across two courts, browsable in-app at `/rulebook`.

| Source | Rules |
|---|---|
| High Court of Delhi — **List of Common Objections** (official) | 18 |
| Supreme Court Rules, 2013 — Orders IV, VIII, XV, XXI, XXII | 12 |
| E-filing Rules of the High Court of Delhi, 2021 | 4 |
| Limitation Act, 1963 — ss. 3, 4, 5, 12 and the Schedule | computation |
| *In Re: Cognizance for Extension of Limitation*, order dt. 10.01.2022 | COVID exclusion |

Rules we could not verify against their primary source are marked
`"status": "unverified"` and are **excluded from scrutiny** — shown in the
rulebook, honestly labelled, never fired. Objections a machine cannot test
(a physical stamp, a caveat report) are marked manual and listed under
**Not checked** so the boundary of the scrutiny is visible.

---

## Layout

```
app/
  page.tsx                 landing + sign-in
  (portal)/
    layout.tsx             left rail + content column
    dashboard/             bundles, each row carrying its verdict
    new/                   intake: files, court, case type, the four dates
    scrutiny/[id]/         the consolidated defect memo
    rulebook/              every rule, its source, and whether we can test it
    assistant/             the Assistant, as a destination
  api/                     auth · bundle · scrutiny · assistant · fix · draft
lib/
  docs/pdf-forensics.ts    per-page measurement: margins, pagination, DPI, script
  docs/classify.ts         court-document taxonomy
  scrutiny/checks.ts       the fifteen deterministic checks
  scrutiny/limitation.ts   s.12(1), s.12(2), s.4, COVID exclusion
  scrutiny/run.ts          orchestrator: rules → checks → defects
  scrutiny/ai-checks.ts    cause title, synopsis/prayer, provision (structured verdicts)
  docs/dates.ts            reads the filing dates off the certified copy
  fix/repair.ts            merge in paperbook order, rebuild the index
  draft/condonation.ts     the s.5 application, with the day-by-day schedule
  storage/files.ts         the uploaded PDFs, kept so they can be repaired
  rulebook/*.json          the rules, each with sourceUrl + verifiedOn
  ai/provider.ts           transport, key rotation, circuit breaker
  ai/tasks.ts              language detection + the Assistant prompt
scripts/
  make-demo-bundle.mjs     builds a bundle with defects planted on purpose
  selftest.mjs             end-to-end assertion that they are all caught
  assistant-test.mjs       the Assistant asked in six languages
```

Next.js 16 · TypeScript · Tailwind 4 · MongoDB (optional) · pdfjs-dist ·
pdf-lib · pdfkit · three.

## Configuration

| Variable | Effect if unset |
|---|---|
| `AUTH_SECRET` | **Required.** Signs the session cookie. |
| `MONGODB_URI` | Bundles are kept in memory and lost on restart. The header says so. |
| `GEMINI_API_KEYS` (or `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`) | The Assistant and the four AI-assisted checks are disabled with a clear message. Everything else is unaffected. |
| `GEMINI_MODEL` | Defaults to `gemini-flash-lite-latest`, which mishandles Indian scripts — **pin `gemini-flash-latest`**. See below. |

Comma-separate several keys in `GEMINI_API_KEYS` to get rotation: on a 429 or 503
the next key is tried immediately rather than waiting out the window.

### Getting the multilingual promise to actually hold

Three things had to be right, and each failed first:

1. **Retrieval was English-only.** The lexical retriever splits the question on
   `[a-z0-9]`, so a question in Devanagari or Tamil yielded *no* search terms,
   *no* rules, and an empty context — whereupon the model concluded the question
   was out of scope and declined it. It now falls back to handing over the whole
   verified rulebook, which is 31 short rows.
2. **The model.** `gemini-flash-lite-latest` answered a Devanagari question about
   vakalatnama stamps with a paragraph about the Andaman and Nicobar Islands.
   `gemini-flash-latest` reads all of these scripts correctly.
3. **The token budget.** Indic scripts tokenise several times less efficiently
   than Latin, so a flat cap cut Tamil and Bengali answers off mid-sentence. The
   budget now varies by script.

Marathi is separated from Hindi by grammar markers (`आहे`, `नाही`, `-ावे`,
`-तात`), since the two share the Devanagari script and answering a Bombay High
Court advocate in Hindi is its own kind of failure.

### Repagination, and a PDF lesson worth recording

The obvious way to repaginate is to paint a white box over the old page number
and stamp a new one. **It does not work.** Drawing a rectangle only adds paint
to the content stream — the original text is still there and still extractable.
Round-tripping such a "repaired" file back through PARAM's own forensics found
both numbers in the footer, and the bundle failed the very pagination check the
repair was meant to cure. (It is the same reason white-box redaction leaks
documents in the wild.)

pdf-lib cannot excise text from a content stream, so PARAM does not pretend to.
It stamps numbers only on pages that carry none, and reports the pages whose
existing number no longer matches their position, for manual repagination. An
advocate would rather be told than be handed a file that looks fixed and is not.

### Wiring the new endpoints into the UI

The engine and API for repair, drafting and the AI checks are complete and
tested; the buttons are not wired into the memo screen yet.

| Action | Call |
|---|---|
| Preview a repair | `POST /api/fix` `{bundleId}` → contents table, `stamped`, `needsManualRepagination` |
| Download the repaired bundle | `GET /api/fix?bundleId=…` → PDF |
| Draft the condonation application | `GET /api/draft?bundleId=…&kind=condonation[&reason=…]` → PDF, or 422 with a reason it should not be drafted |
| Skip the AI pass | `POST /api/scrutiny?ai=0` |

## Limits, stated plainly

- PARAM does not replace the Registry's scrutiny. It removes the *preventable*
  rounds.
- It reports what it can measure in the files given to it. A signature in ink on
  a scan with no text layer cannot be seen, and PARAM says so rather than
  calling the document unsigned.
- The court holiday calendar covers 2025–2026 and is not exhaustive. Confirm an
  expiry that falls near a listed holiday against the court's own calendar.
- Limitation turns on facts beyond the four dates the form asks for —
  acknowledgment (s.18), part payment (s.19), time spent bona fide in a wrong
  court (s.14). The computation is shown as working, to be checked, not
  certified.
- Repagination is partial by design; see the note above.
- Not legal advice.

---

Built for the Vibecode Hackathon.
Implementation plan and research trail: [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md).
