import fs from "node:fs";
import path from "node:path";

/**
 * Exercises the repair and drafting endpoints end to end.
 *
 * Both produce PDFs, so the assertions are about the artefact itself: does it
 * come back as a PDF, does it have the page count the repair claimed, does the
 * regenerated index point at pages that exist, and does the drafting endpoint
 * REFUSE when the matter is within time (drafting a condonation application for
 * a filing that needs none is worse than not offering one at all).
 *
 *   node scripts/test-fix-draft.mjs [baseUrl]
 */

const BASE = process.argv[2] || "http://127.0.0.1:3111";
const DIR = path.join(process.cwd(), "demo-bundle");
const OUT = path.join(process.cwd(), "demo-bundle", "_output");

let failures = 0;
const check = (label, ok, note = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? ` — ${note}` : ""}`);
  if (!ok) failures++;
};

async function signIn() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "advocate@param.demo", password: "Param@123" }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function upload(cookie, dates) {
  const fd = new FormData();
  fd.set("title", "Sharma v. State of NCT of Delhi — SLP (C)");
  fd.set("court", "SUPREME_COURT");
  fd.set("caseTypeId", "SLP_CIVIL");
  for (const [k, v] of Object.entries(dates)) fd.set(k, v);
  for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith(".pdf"))) {
    fd.append(
      "files",
      new File([fs.readFileSync(path.join(DIR, name))], name, { type: "application/pdf" })
    );
  }
  const res = await fetch(`${BASE}/api/bundle`, { method: "POST", headers: { cookie }, body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(`upload failed: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cookie = await signIn();
  console.log("signed in\n");

  // ── 1. Dates read off the certified copy ─────────────────────────────────
  console.log("DATE EXTRACTION (no dates supplied on the form)");
  const blank = await upload(cookie, {});
  const ev = blank.datesReadFromDocuments ?? {};
  check("pronouncement date read from the documents", Boolean(ev.pronouncedOn), ev.pronouncedOn);
  check("certified-copy application date read", Boolean(ev.copyAppliedOn), ev.copyAppliedOn);
  check("certified-copy ready date read", Boolean(ev.copyReadyOn), ev.copyReadyOn);

  const sc = await fetch(`${BASE}/api/scrutiny?ai=0`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bundleId: blank.bundleId }),
  }).then((r) => r.json());
  const lim = sc.result?.limitation ?? {};
  check(
    "limitation computed from the extracted dates alone",
    lim.computed === true,
    lim.computed ? `expires ${lim.dueOn}` : lim.reason
  );

  // ── 2. Repair ────────────────────────────────────────────────────────────
  console.log("\nREPAIR (repaginate + rebuild index)");
  const dry = await fetch(`${BASE}/api/fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bundleId: blank.bundleId }),
  }).then((r) => r.json());
  check("dry run returns a contents table", Array.isArray(dry.contents) && dry.contents.length > 0,
    dry.error ?? `${dry.contents?.length} entries, ${dry.totalPages} pages`);
  // `?? []` would turn a missing field into a pass; the field has to be there.
  check("every source file was readable back from disk",
    Array.isArray(dry.missing) && dry.missing.length === 0,
    Array.isArray(dry.missing) ? dry.missing.join(", ") : "no `missing` field returned");
  const lastPage = Math.max(0, ...(dry.contents ?? []).map((c) => c.to));
  check("index points within the bundle", lastPage <= dry.totalPages,
    `index ends at ${lastPage}, bundle is ${dry.totalPages} pages`);
  // PARAM cannot excise existing text, so it must never add a second number to
  // a page that already has one. It reports those pages instead.
  check("reports pages needing manual repagination rather than double-stamping",
    Array.isArray(dry.needsManualRepagination),
    `${dry.needsManualRepagination?.length ?? "?"} page(s) flagged, ${dry.stamped} stamped`);

  const pdfRes = await fetch(`${BASE}/api/fix?bundleId=${blank.bundleId}`, { headers: { cookie } });
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  check("repaired bundle downloads as a PDF",
    pdfRes.ok && buf.subarray(0, 5).toString() === "%PDF-", `${(buf.length / 1024).toFixed(0)} KB`);
  if (pdfRes.ok) {
    fs.writeFileSync(path.join(OUT, "repaired-bundle.pdf"), buf);
    console.log(`        written to demo-bundle/_output/repaired-bundle.pdf`);
  }

  // ── 3. Drafting refuses when the filing is in time ───────────────────────
  console.log("\nCONDONATION DRAFT");
  const inTime = await upload(cookie, {
    pronouncedOn: "2026-05-28", copyAppliedOn: "2026-06-05",
    copyReadyOn: "2026-06-23", filingOn: "2026-09-08",
  });
  await fetch(`${BASE}/api/scrutiny?ai=0`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bundleId: inTime.bundleId }),
  });
  const refused = await fetch(`${BASE}/api/draft?bundleId=${inTime.bundleId}&kind=condonation`, {
    headers: { cookie },
  });
  check("refuses to draft when the filing is within time", refused.status === 422,
    (await refused.json().catch(() => ({}))).error?.slice(0, 80));

  // ── 4. …and drafts when it is not ────────────────────────────────────────
  const late = await upload(cookie, {
    pronouncedOn: "2026-01-10", copyAppliedOn: "2026-01-20",
    copyReadyOn: "2026-01-25", filingOn: "2026-09-08",
  });
  await fetch(`${BASE}/api/scrutiny?ai=0`, {
    method: "POST", headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bundleId: late.bundleId }),
  });
  const draftRes = await fetch(`${BASE}/api/draft?bundleId=${late.bundleId}&kind=condonation`, {
    headers: { cookie },
  });
  const draftBuf = Buffer.from(await draftRes.arrayBuffer());
  check("drafts the s.5 application when out of time",
    draftRes.ok && draftBuf.subarray(0, 5).toString() === "%PDF-",
    `${(draftBuf.length / 1024).toFixed(0)} KB`);
  if (draftRes.ok) {
    fs.writeFileSync(path.join(OUT, "condonation-application.pdf"), draftBuf);
    console.log("        written to demo-bundle/_output/condonation-application.pdf");
  }

  console.log("\n" + "═".repeat(70));
  console.log(failures ? `${failures} check(s) failed` : "all checks passed");
  console.log("═".repeat(70));
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("test failed:", e.message);
  process.exitCode = 1;
});
