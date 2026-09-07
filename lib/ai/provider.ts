/**
 * AI provider layer for PARAM, real API-backed.
 *
 * AI_PROVIDER = anthropic | gemini | openai   (keys via env)
 *
 * DIVISION OF LABOUR — the rule PARAM is built on:
 *  - The LLM only CLASSIFIES documents, EXTRACTS dates/parties, and ANSWERS
 *    questions in the PARAM Assistant.
 *  - Every DEFECT VERDICT is decided by the deterministic engine in
 *    lib/scrutiny against a cited row in lib/rulebook. The LLM never decides
 *    that a filing is defective, and never invents a rule or a citation.
 *
 * A hallucinated Registry objection would be worse than no tool at all, so
 * with no API key configured the deterministic scrutiny still runs in full and
 * the AI-assisted checks disable themselves with a clear message.
 *
 * Ported from the SIIM codebase (SEBI hackathon) and re-pointed at court
 * filings; the transport, key rotation and circuit-breaker logic are unchanged.
 */


/**
 * AI provider layer, real API-backed.
 *
 * AI_PROVIDER = gemini | anthropic | openai   (keys via env)
 *
 * Division of labour (by design):
 *  - The LLM classifies documents, extracts structured facts from chunks and
 *    drafts prospectus language from those facts.
 *  - The deterministic rule engine (lib/engine) decides scores, gaps,
 *    warnings and red flags from extracted facts, never the LLM.
 *
 * If no API key is configured, extraction falls back to pattern-based only,
 * AI generation is DISABLED with a clear setup message, and the app never
 * fabricates AI output.
 */

export type AiProviderName = "gemini" | "anthropic" | "openai" | "none";

export function activeProvider(): AiProviderName {
  const p = (process.env.AI_PROVIDER ?? "").toLowerCase();
  if (p === "gemini" && geminiKeys().length) return "gemini";
  if (p === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (p === "openai" && process.env.OPENAI_API_KEY) return "openai";
  // auto-detect if AI_PROVIDER unset
  if (geminiKeys().length) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "none";
}

export const aiAvailable = () => activeProvider() !== "none";

export const AI_SETUP_MESSAGE =
  "AI provider not configured. Set AI_PROVIDER and the matching API key (GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY) in .env.local, then restart. Pattern-based extraction still runs, but AI classification, fact extraction and draft generation are disabled, the app will not fabricate AI output.";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Multiple Gemini keys are supported to survive free-tier rate limits:
 *   GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3, …  (or comma-separated
 *   GEMINI_API_KEYS). On a 429 the call rotates to the next key immediately
 *   instead of only waiting out the window.
 */
export function geminiKeys(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEYS)
    keys.push(...process.env.GEMINI_API_KEYS.split(",").map((k) => k.trim()).filter(Boolean));
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  for (let i = 2; i <= 9; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  return [...new Set(keys)];
}

let geminiKeyCursor = 0;

/**
 * Circuit breaker: when every configured key is rate-limited (e.g. daily
 * free-tier quota exhausted), AI calls short-circuit for a cooldown window
 * instead of stalling uploads/pages with long backoffs. The app degrades to
 * pattern extraction and deterministic rules, never hangs.
 */
let aiCooldownUntil = 0;
export const aiCoolingDown = () => Date.now() < aiCooldownUntil;

/** Single completion call. Rotates keys on rate-limit, retries with backoff. Returns null on failure. */
export async function callAI(prompt: string, opts: { json?: boolean; maxTokens?: number } = {}): Promise<string | null> {
  const provider = activeProvider();
  if (provider === "none") return null;
  if (provider === "gemini" && aiCoolingDown()) return null;
  const keys = provider === "gemini" ? geminiKeys() : [];
  const maxAttempts = provider === "gemini" ? Math.max(3, keys.length * 2) : 3;
  let sawRateLimit = false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const backoff = 8000 * (Math.floor(attempt / Math.max(1, keys.length)) + 1);
    try {
      if (provider === "gemini") {
        const model = process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
        const key = keys[geminiKeyCursor % keys.length];
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: opts.maxTokens ?? 2048,
                temperature: 0.2,
                ...(opts.json ? { responseMimeType: "application/json" } : {}),
              },
            }),
          }
        );
        if (res.status === 429 || res.status === 503) {
          sawRateLimit = true;
          geminiKeyCursor++; // rotate to the next key
          if (keys.length > 1 && (attempt + 1) % keys.length !== 0) {
            console.warn(`[ai] gemini ${res.status} on key #${(geminiKeyCursor - 1) % keys.length + 1}, rotating to next key`);
            continue; // try next key immediately
          }
          if (attempt >= maxAttempts - 1) break; // exhausted, trip the breaker below
          console.warn(`[ai] gemini ${res.status} on all ${keys.length} key(s), backing off ${backoff}ms`);
          await sleep(backoff); continue;
        }
        if (!res.ok) {
          console.error(`[ai] gemini error ${res.status}: ${(await res.text()).slice(0, 300)}`);
          return null;
        }
        const data = await res.json();
        return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? null;
      }
      if (provider === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
            max_tokens: opts.maxTokens ?? 2048,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (res.status === 429 || res.status === 529) { await sleep(backoff); continue; }
        if (!res.ok) return null;
        const data = await res.json();
        return data?.content?.[0]?.text ?? null;
      }
      if (provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
            max_tokens: opts.maxTokens ?? 2048,
            messages: [{ role: "user", content: prompt }],
            ...(opts.json ? { response_format: { type: "json_object" } } : {}),
          }),
        });
        if (res.status === 429) { await sleep(backoff); continue; }
        if (!res.ok) return null;
        const data = await res.json();
        return data?.choices?.[0]?.message?.content ?? null;
      }
    } catch (e) {
      console.error(`[ai] request failed (attempt ${attempt + 1}): ${e instanceof Error ? e.message : e}`);
      if (attempt < 2) { await sleep(2000); continue; }
      return null;
    }
  }
  if (provider === "gemini" && sawRateLimit) {
    aiCooldownUntil = Date.now() + 120_000;
    console.warn("[ai] all gemini keys rate-limited, pausing AI calls for 120s (pattern extraction & rule engine continue)");
  }
  return null;
}

/** Pace sequential AI calls to stay under free-tier per-minute limits. */
export const paceAI = () => sleep(1500);

/**
 * How many extraction/classification calls to run in parallel. Scales with the
 * number of Gemini keys in rotation — each in-flight call lands on a different
 * key — so adding keys directly buys throughput. A single Gemini key still
 * overlaps two calls to hide network latency. Overload is absorbed by callAI's
 * own 429 key-rotation and backoff, so we no longer pad every call with a fixed
 * sleep. Anthropic/OpenAI use one high-limit key, so a modest fixed width.
 */
export function aiConcurrency(): number {
  const provider = activeProvider();
  if (provider === "none") return 1;
  if (provider === "gemini") return Math.min(8, Math.max(2, geminiKeys().length * 2));
  return 4;
}

// ── Embeddings (for semantic retrieval / RAG) ────────────────────────────────

/**
 * Embed one or more texts into vectors for semantic search. Uses Gemini's
 * text-embedding model with the same key rotation as callAI. Returns null when
 * no Gemini key is configured or the call fails, so the caller can fall back to
 * lexical retrieval — the RAG layer must never hard-depend on the network.
 * (Only the Gemini provider exposes embeddings here; Anthropic has none and
 * OpenAI's is a separate endpoint we do not need for this build.)
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const keys = geminiKeys();
  if (!keys.length || !texts.length) return null;
  if (aiCoolingDown()) return null;
  const model = process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004";

  for (let attempt = 0; attempt < Math.max(2, keys.length); attempt++) {
    const key = keys[geminiKeyCursor % keys.length];
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
        {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: texts.map((t) => ({
              model: `models/${model}`,
              content: { parts: [{ text: t.slice(0, 8000) }] },
            })),
          }),
        }
      );
      if (res.status === 429 || res.status === 503) { geminiKeyCursor++; continue; }
      if (!res.ok) {
        console.error(`[ai] embed error ${res.status}: ${(await res.text()).slice(0, 200)}`);
        return null;
      }
      const data = await res.json();
      const out = (data?.embeddings ?? []).map((e: { values?: number[] }) => e.values ?? []);
      return out.length === texts.length ? out : null;
    } catch (e) {
      console.error(`[ai] embed request failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
  return null;
}

export const embeddingsAvailable = () => geminiKeys().length > 0;
