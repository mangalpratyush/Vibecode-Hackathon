import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Seeds the prepared filing that the login screen's "Explore the live demo"
 * button promises.
 *
 * Without this, a judge clicking that button lands on an empty dashboard, which
 * is a worse first impression than no demo button at all. This generates the
 * defective bundle if it is not already there, signs in as the advocate demo
 * account, uploads it and runs the scrutiny — so the demo account always has a
 * real, fully scrutinised memo waiting.
 *
 * Idempotent: if a bundle with the same title is already on that account, it
 * does nothing.
 *
 *   npm run seed:demo          (server must be running)
 *   npm run seed:demo -- http://localhost:3000
 */

const BASE = process.argv[2] || process.env.PARAM_URL || "http://127.0.0.1:3111";
const DIR = path.join(process.cwd(), "demo-bundle");
const TITLE = "SAMPLE · Sharma v. State of NCT of Delhi, SLP (C) against judgment dt. 28.05.2026";

// Dates deliberately left OFF the form: PARAM reads them off the certified copy.
// That is the point of the demo, so seeding them by hand would defeat it.
const FIELDS = {
  title: TITLE,
  court: "SUPREME_COURT",
  caseTypeId: "SLP_CIVIL",
  filingOn: "2026-09-08",
};

function ensureBundleFiles() {
  const pdfs = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith(".pdf"))
    : [];
  if (pdfs.length) return pdfs;

  console.log("demo-bundle/ is empty — generating it first…");
  const r = spawnSync(process.execPath, ["scripts/make-demo-bundle.mjs"], {
    stdio: "inherit",
  });
  if (r.status !== 0) throw new Error("could not generate the demo bundle");
  return fs.readdirSync(DIR).filter((f) => f.endsWith(".pdf"));
}

async function main() {
  const pdfs = ensureBundleFiles();

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "advocate@param.demo", password: "Param@123" }),
  }).catch(() => null);

  if (!login?.ok) {
    console.error(
      `Could not sign in at ${BASE}.\n\n` +
        "Is the dev server running? Start it with `npm run dev`, then run this again.\n" +
        "If it is on a different port, pass the URL: npm run seed:demo -- http://localhost:3000"
    );
    process.exitCode = 1;
    return;
  }
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  const existing = await fetch(`${BASE}/api/bundle`, { headers: { cookie } }).then((r) =>
    r.json()
  );
  if ((existing.bundles ?? []).some((b) => b.title === TITLE)) {
    console.log("The demo filing is already seeded on advocate@param.demo. Nothing to do.");
    return;
  }

  const fd = new FormData();
  for (const [k, v] of Object.entries(FIELDS)) fd.set(k, v);
  for (const name of pdfs)
    fd.append(
      "files",
      new File([fs.readFileSync(path.join(DIR, name))], name, { type: "application/pdf" })
    );

  const up = await fetch(`${BASE}/api/bundle`, {
    method: "POST",
    headers: { cookie },
    body: fd,
  });
  const upData = await up.json();
  if (!up.ok) throw new Error(`upload failed: ${JSON.stringify(upData)}`);
  console.log(`uploaded ${pdfs.length} documents`);

  const read = upData.datesReadFromDocuments ?? {};
  for (const [k, v] of Object.entries(read)) console.log(`  read ${k} — ${v}`);

  const sc = await fetch(`${BASE}/api/scrutiny`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ bundleId: upData.bundleId }),
  }).then((r) => r.json());

  const s = sc.result?.stats;
  const l = sc.result?.limitation;
  console.log(
    `\nscrutiny run — ${s?.fatal} fatal, ${s?.objections} objections, ${s?.advisories} advisory, ${sc.result?.passed?.length} passed`
  );
  if (l?.computed)
    console.log(
      l.barred
        ? `limitation — OUT OF TIME by ${l.daysOverdue} day(s), expired ${l.dueOn}`
        : `limitation — within time, ${l.daysRemaining} day(s) left, expires ${l.dueOn}`
    );

  console.log(`\nready: ${BASE}/case/${upData.bundleId}/extraction`);
  console.log('"Explore the live demo" on the sign-in screen now lands on a real memo.');
}

main().catch((e) => {
  console.error("seed failed:", e.message);
  process.exitCode = 1;
});
