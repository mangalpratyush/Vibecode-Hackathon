import fs from "node:fs";
import path from "node:path";

/**
 * End-to-end self test against a running dev server.
 *
 * Signs in, uploads the demo bundle, runs the scrutiny, and prints the memo.
 * This is how we check that a defect PARAM claims to catch is actually caught,
 * without clicking through the UI every time.
 *
 * The same files are run twice, once under each court, because the rulebooks
 * differ: the 4 cm left margin, the memo of parties and the listing proforma
 * are Delhi High Court objections and have no encoded Supreme Court equivalent.
 * Running only the SC scenario would leave those checks untested.
 *
 *   node scripts/selftest.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? "http://127.0.0.1:3111";
const DIR = path.join(process.cwd(), "demo-bundle");

const SCENARIOS = [
  {
    name: "Supreme Court — SLP (Civil)",
    court: "SUPREME_COURT",
    caseTypeId: "SLP_CIVIL",
    title: "Sharma v. State of NCT of Delhi — SLP (C)",
    expect: [
      "Annexure P-7 is relied on but is not in the bundle",
      "Annexure P-9 is filed but never referred to",
      "Pagination breaks",
      "Repeated page numbers",
      "Untranslated vernacular pages",
      "Synopsis & List of Dates is not in the bundle",
    ],
  },
  {
    name: "Delhi High Court — Regular First Appeal",
    court: "DELHI_HIGH_COURT",
    caseTypeId: "RFA",
    title: "Sharma v. State of NCT of Delhi — RFA",
    expect: [
      "Left margin below 4 cm",
      "Memo of Parties is not in the bundle",
      "Listing Proforma is not in the bundle",
      "Untranslated vernacular pages",
      "Pagination breaks",
      "No attestation found in",
      "Welfare stamp not evidenced on",
    ],
  },
];

async function signIn() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "advocate@param.demo", password: "Param@123" }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function run(cookie, sc) {
  const fd = new FormData();
  fd.set("title", sc.title);
  fd.set("court", sc.court);
  fd.set("caseTypeId", sc.caseTypeId);
  fd.set("pronouncedOn", "2026-05-28");
  fd.set("copyAppliedOn", "2026-06-05");
  fd.set("copyReadyOn", "2026-06-23");
  fd.set("filingOn", "2026-09-08");

  for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith(".pdf"))) {
    const buf = fs.readFileSync(path.join(DIR, name));
    fd.append("files", new File([buf], name, { type: "application/pdf" }));
  }

  const up = await fetch(`${BASE}/api/bundle`, { method: "POST", headers: { cookie }, body: fd });
  const upData = await up.json();
  if (!up.ok) throw new Error(`upload failed: ${JSON.stringify(upData)}`);

  const res = await fetch(`${BASE}/api/scrutiny`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bundleId: upData.bundleId }),
  });
  const { result } = await res.json();
  if (!result) throw new Error("no scrutiny result returned");
  return result;
}

function report(sc, result) {
  const s = result.stats;
  console.log("\n" + "═".repeat(76));
  console.log(sc.name.toUpperCase());
  console.log("═".repeat(76));
  console.log(
    `${s.documents} documents, ${s.pages} pages · ${s.fatal} fatal · ${s.objections} objections · ` +
      `${s.advisories} advisory · ${result.passed.length} passed · ${result.skipped.length} not checked`
  );

  for (const d of result.defects) {
    console.log(`\n  [${d.severity}] ${d.title}`);
    console.log(`    ${d.detail}`);
    console.log(`    rule ${d.ruleId} — ${d.source}`);
  }

  const l = result.limitation;
  console.log("\n  " + "─".repeat(72));
  console.log("  LIMITATION");
  if (!l.computed) console.log(`    not computed: ${l.reason}`);
  else {
    for (const st of l.steps) {
      console.log(`    ${st.label.padEnd(40)} ${st.runningDate ?? ""}`);
      if (st.provision) console.log(`        ${st.provision}`);
    }
    console.log(
      `\n    => ${l.barred ? `OUT OF TIME by ${l.daysOverdue} day(s)` : `within time, ${l.daysRemaining} day(s) left`}, expires ${l.dueOn}`
    );
  }

  console.log("\n  " + "─".repeat(72));
  console.log("  EXPECTED DEFECTS");
  const titles = result.defects.map((d) => d.title);
  let missed = 0;
  for (const e of sc.expect) {
    const hit = titles.some((t) => t.includes(e));
    if (!hit) missed++;
    console.log(`    ${hit ? "PASS" : "MISS"}  ${e}`);
  }
  console.log(`\n  ${sc.expect.length - missed}/${sc.expect.length} detected.`);
  return missed;
}

async function main() {
  const cookie = await signIn();
  console.log("signed in as advocate@param.demo");

  let missed = 0;
  for (const sc of SCENARIOS) missed += report(sc, await run(cookie, sc));

  console.log("\n" + "═".repeat(76));
  console.log(missed === 0 ? "ALL PLANTED DEFECTS DETECTED" : `${missed} EXPECTED DEFECT(S) MISSED`);
  console.log("═".repeat(76));
  process.exit(missed ? 1 : 0);
}

main().catch((e) => {
  console.error("\nselftest failed:", e.message);
  process.exit(1);
});
