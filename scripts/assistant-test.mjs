/**
 * Multilingual smoke test for the PARAM Assistant.
 *
 * Written in Node rather than curl because a shell pipeline mangles non-Latin
 * UTF-8 on Windows, which produces a very convincing false negative: the model
 * receives mojibake and replies "your question is not clear", and it looks like
 * a model failure when it is a harness failure.
 *
 *   node scripts/assistant-test.mjs [baseUrl]
 */

const BASE = process.argv[2] || "http://127.0.0.1:3111";
/** Optional substring filter, e.g. `node scripts/assistant-test.mjs "" Marathi`. */
const ONLY = (process.argv[3] ?? "").toLowerCase();
/** Free-tier keys rate-limit on a burst, so pace the run rather than hammer it. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  ["English", "What is the time requisite for obtaining a certified copy under section 12(2)?"],
  ["Hindi (Devanagari)", "वकालतनामा पर वेलफेयर स्टाम्प कितने रुपये का लगता है?"],
  ["Hinglish", "Section 34 arbitration me delay condone ho sakta hai kya, kitne din tak?"],
  ["Tamil", "நீதிமன்றத்தில் மனு தாக்கல் செய்யும்போது என்ன ஆவணங்கள் தேவை?"],
  ["Bengali", "সার্টিফায়েড কপি পেতে যে সময় লাগে তা কি লিমিটেশন থেকে বাদ যায়?"],
  ["Marathi", "वकीलपत्रावर कोणते स्टॅम्प लावावे लागतात?"],
  ["Off-topic (should decline)", "Give me a good recipe for paneer butter masala."],
];

async function main() {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ email: "advocate@param.demo", password: "Param@123" }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];

  let failures = 0;
  const cases = ONLY ? CASES.filter(([l]) => l.toLowerCase().includes(ONLY)) : CASES;
  let first = true;
  for (const [label, question] of cases) {
    if (!first) await sleep(6000);
    first = false;
    const res = await fetch(`${BASE}/api/assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", cookie },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    const answer = (data.answer ?? data.error ?? "").trim();

    // A reply that asks the user to rephrase, or to switch to English, is the
    // failure this test exists to catch.
    const refused =
      /not clear|nahi samajh|समझ नहीं|स्पष्ट नहीं|rephrase|in English|ask your question/i.test(
        answer
      ) && !label.startsWith("Off-topic");
    if (refused) failures++;

    console.log("\n" + "─".repeat(74));
    console.log(`${label}${refused ? "   << REFUSED / UNCLEAR" : ""}`);
    console.log("─".repeat(74));
    console.log(`Q: ${question}`);
    console.log(`A: ${answer.slice(0, 600)}`);
  }

  console.log("\n" + "═".repeat(74));
  console.log(failures ? `${failures} language(s) refused` : "every language answered");
  console.log("═".repeat(74));
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("assistant test failed:", e.message);
  process.exitCode = 1;
});
