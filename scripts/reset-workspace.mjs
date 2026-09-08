/**
 * Empty a demo account's workspace.
 *
 * Exists because the test scripts upload real bundles through the real API, and
 * anything they leave behind shows up as somebody's filings the next time that
 * account signs in. Tests now use the clerk account, and this clears whatever
 * is already there.
 *
 *   npm run reset                       clears advocate@param.demo
 *   npm run reset -- clerk@param.demo   clears the clerk account
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PARAM_URL || "http://127.0.0.1:3111";
const EMAIL = process.argv[2] || "advocate@param.demo";

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: "Param@123" }),
});
if (!login.ok) {
  console.error(`Could not sign in as ${EMAIL} at ${BASE}. Is the dev server running?`);
  process.exitCode = 1;
} else {
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  const { bundles = [] } = await fetch(`${BASE}/api/bundle`, { headers: { cookie } }).then((r) => r.json());
  if (!bundles.length) {
    console.log(`${EMAIL} already has no filings.`);
  } else {
    for (const b of bundles) {
      const res = await fetch(`${BASE}/api/bundle/${b.id}`, { method: "DELETE", headers: { cookie } });
      console.log(`  ${res.ok ? "deleted" : "FAILED "}  ${b.title.slice(0, 62)}`);
    }
    console.log(`\n${bundles.length} filing(s) removed from ${EMAIL}.`);
  }
}

/*
  Sweep orphaned uploads.

  Files are written under uploads/<bundleId>/ the moment a bundle is created,
  but bundles live in memory unless MONGODB_URI is set, so every server restart
  strands the directories of everything that existed before it. Deleting a
  bundle through the API cleans its own files; this catches the rest.

  Only directories with no surviving bundle are removed, and only after the
  listing above succeeded, so a failed API call can never be read as "nothing
  exists, delete everything".
*/
const UPLOADS = path.join(process.cwd(), "uploads");
if (fs.existsSync(UPLOADS)) {
  const live = new Set();
  for (const who of ["advocate@param.demo", "clerk@param.demo"]) {
    const l = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: who, password: "Param@123" }),
    });
    if (!l.ok) continue;
    const c = (l.headers.get("set-cookie") ?? "").split(";")[0];
    const { bundles = [] } = await fetch(`${BASE}/api/bundle`, { headers: { c: "" , cookie: c } }).then((r) => r.json());
    for (const b of bundles) live.add(b.id);
  }
  let swept = 0;
  for (const dir of fs.readdirSync(UPLOADS)) {
    if (live.has(dir)) continue;
    fs.rmSync(path.join(UPLOADS, dir), { recursive: true, force: true });
    swept++;
  }
  if (swept) console.log(`swept ${swept} orphaned upload folder(s) off disk.`);
}
