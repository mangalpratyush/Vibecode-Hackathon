import { AI_SETUP_MESSAGE, aiAvailable, callAI } from "./provider";

/**
 * PARAM's AI tasks. The transport lives in ./provider; the prompts live here.
 *
 * Everything in this file is CLASSIFICATION, EXTRACTION or Q&A. No function
 * here decides that a filing is defective — that verdict belongs to
 * lib/scrutiny, which resolves every finding to a cited rulebook row.
 */

// ── Language ────────────────────────────────────────────────────────────────

/**
 * Decide, deterministically, the language the Assistant must reply in. Script
 * detection beats asking a model to infer it, and India's courts run in many
 * languages: a litigant in Patna types Devanagari, one in Chennai types Tamil,
 * and a junior in Delhi types romanised Hinglish.
 *
 * An explicit request ("in Marathi", "reply in English") wins over everything.
 * If the script is one we do not name, we instruct the model to mirror the
 * user's own language rather than guessing wrongly — that is what makes the
 * "any language" promise safe.
 */
export function detectReplyLanguage(q: string): string {
  const text = (q || "").trim();

  // 1. Explicit named request, e.g. "answer in Bengali", "हिंदी में बताओ".
  const named: [RegExp, string][] = [
    [/\bhindi\b|हिं?न्?दी/i, "Hindi (Devanagari script)"],
    [/\bmarathi\b|मराठी/i, "Marathi (Devanagari script)"],
    [/\bbengali\b|\bbangla\b|বাংলা/i, "Bengali (Bengali script)"],
    [/\btamil\b|தமிழ்/i, "Tamil (Tamil script)"],
    [/\btelugu\b|తెలుగు/i, "Telugu (Telugu script)"],
    [/\bkannada\b|ಕನ್ನಡ/i, "Kannada (Kannada script)"],
    [/\bmalayalam\b|മലയാളം/i, "Malayalam (Malayalam script)"],
    [/\bgujarati\b|ગુજરાતી/i, "Gujarati (Gujarati script)"],
    [/\bpunjabi\b|\bgurmukhi\b|ਪੰਜਾਬੀ/i, "Punjabi (Gurmukhi script)"],
    [/\bodia\b|\boriya\b|ଓଡ଼ିଆ/i, "Odia (Odia script)"],
    [/\bassamese\b|অসমীয়া/i, "Assamese (Bengali-Assamese script)"],
    [/\burdu\b|اردو/i, "Urdu (Nastaliq script)"],
    [/\bsanskrit\b|संस्कृत/i, "Sanskrit (Devanagari script)"],
    [/\benglish\b/i, "English"],
  ];
  for (const [re, lang] of named) if (re.test(text)) return lang;

  // 2. Script of the question itself.
  const scripts: [RegExp, string][] = [
    [/[ঀ-৿]/, "Bengali (Bengali script)"],
    [/[਀-੿]/, "Punjabi (Gurmukhi script)"],
    [/[઀-૿]/, "Gujarati (Gujarati script)"],
    [/[଀-୿]/, "Odia (Odia script)"],
    [/[஀-௿]/, "Tamil (Tamil script)"],
    [/[ఀ-౿]/, "Telugu (Telugu script)"],
    [/[ಀ-೿]/, "Kannada (Kannada script)"],
    [/[ഀ-ൿ]/, "Malayalam (Malayalam script)"],
    [/[؀-ۿ]/, "Urdu (Nastaliq script)"],
  ];
  for (const [re, lang] of scripts) if (re.test(text)) return lang;

  /**
   * Devanagari is shared, so script alone cannot separate Marathi from Hindi —
   * and answering a Bombay High Court advocate's Marathi question in Hindi is
   * exactly the kind of near-miss that makes a tool feel foreign. These markers
   * are Marathi grammar that simply does not occur in Hindi: the copula आहे,
   * the negative नाही, and the -ावे / -तात verb endings.
   */
  if (/[ऀ-ॿ]/.test(text)) {
    const marathi =
      /(आहे|आहेत|नाही|नाहीत|होती|पाहिजे|लागते|लागतात|करावे|करावी|कोणते|कोणता|कोणती|कशी|मध्ये|साठी|आपल्या|माझ्या|त्याच्या|अर्जावर)/.test(
        text
      );
    return marathi ? "Marathi (Devanagari script)" : "Hindi (Devanagari script)";
  }

  // 3. Romanised Hinglish — a cluster of distinctive markers.
  const markers = (
    text
      .toLowerCase()
      .match(
        /\b(kya|kyu|kyun|kyon|hai|hain|hoon|hoga|kaise|kaisa|kaisi|kaam|karo|karna|karein|krna|kr|rha|raha|rahi|rhi|batao|bataye|bata|samjhao|samjha|jawab|mujhe|mera|meri|mere|mai|apna|aap|aapka|iska|uska|iss|koi|nahi|nahin|accha|acha|chahiye|kaun|kitna|kitne|jaldi|abhi|matlab|dena|dedo|tareekh|adalat|muqadma|vakil)\b/g
      ) || []
  ).length;
  if (markers >= 2)
    return "Romanised Hinglish (Hindi written in Roman letters, mirroring the user's own romanised style)";

  // 4. Latin script but not obviously English/Hinglish — mirror the user.
  if (/[a-z]/i.test(text) && !/^[\x00-\x7F]*$/.test(text))
    return "exactly the same language the user wrote their question in";

  return "English";
}

// ── PARAM Assistant ─────────────────────────────────────────────────────────

export interface AssistantContext {
  /** Human summary of the bundle under scrutiny, if the user has one open. */
  bundleSummary?: string;
  /** Defect lines already found by the deterministic engine. */
  defects?: string[];
  /** Rulebook rows retrieved as relevant to the question. */
  rules?: { text: string; source: string }[];
  /** Limitation computation, if one has been run. */
  limitation?: string;
}

const ASSISTANT_FALLBACK = `The PARAM Assistant needs an API key before it can answer freely.

${AI_SETUP_MESSAGE}

Add ANTHROPIC_API_KEY (or GEMINI_API_KEY / OPENAI_API_KEY) to .env.local and restart. Everything else in PARAM — the full defect scrutiny, the rulebook and the limitation computation — runs without a key and is unaffected.`;

/**
 * The PARAM Assistant. Answers procedural and substantive questions about
 * Indian court filing in the user's own language.
 *
 * Grounding rule: anything specific to THIS bundle must come from the context
 * below (which the deterministic engine produced). General law may come from
 * the model's own knowledge, but it must never invent a Registry objection, a
 * rule number or a limitation figure for this user's matter.
 */
export async function answerFilingQuestion(
  question: string,
  ctx: AssistantContext = {}
): Promise<string> {
  if (!aiAvailable()) return ASSISTANT_FALLBACK;

  const replyLang = detectReplyLanguage(question);
  const rulesCtx = (ctx.rules ?? [])
    .slice(0, 40)
    .map((r, i) => `[${i + 1}] ${r.text}  (${r.source})`)
    .join("\n");
  const defectsCtx = (ctx.defects ?? []).slice(0, 25).join("\n");

  const answer = await callAI(
    [
      `RESPONSE LANGUAGE (obey silently): Write your ENTIRE reply in ${replyLang}, using only ${replyLang} for every word. Never mention, quote or explain this language rule, and never write meta lines about which language you are using. Do not greet or introduce yourself. Answer directly.`,
      ``,
      `You are the PARAM Assistant. PARAM (परम — Pre-filing Audit, Registry Mitra) checks a court filing against the Registry's own checkslip BEFORE it is filed, so an advocate does not lose days to defect memos.`,
      ``,
      `SCOPE: Answer anything to do with filing a case in an Indian court — Registry scrutiny and objections, what must go into a paperbook, vakalatnama, affidavits, certified copies, court fee, annexures and translations, limitation and condonation of delay, the Limitation Act, CPC, CrPC/BNSS, Supreme Court Rules 2013, Delhi High Court rules, e-filing requirements — and anything about how to use PARAM itself. Draw on BOTH the context below AND your own knowledge of Indian court practice. Interpret loosely-worded questions generously; a litigant may not know the technical term.`,
      ``,
      `THE QUESTION MAY BE IN ANY LANGUAGE. India's courts run in many. A question written in Hindi, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia, Urdu or romanised Hinglish is an ordinary question: read it, understand it, and answer it. NEVER decline a question because of the language or script it is written in, and never ask the user to rewrite it in English. Decline only when the SUBJECT MATTER is plainly unrelated to law, courts or PARAM — a cooking recipe, sport, trivia, coding help — and then in one short line, in ${replyLang}.`,
      ``,
      `GROUNDING (important): For anything specific to THIS user's bundle — which defects were found, what the limitation position is, what is missing — use ONLY the context below. If it is not there, say it has not been computed yet and tell them to run the scrutiny. Never invent a defect, a rule number, a court-fee figure or a date for this matter. When the retrieved rulebook entries are relevant, base your answer on them and name the source.`,
      ``,
      `CAUTION: Never state a definitive legal conclusion as fact (that a filing "will be accepted", that a case "is not time-barred", that a court "will condone"). Limitation in particular turns on documents and facts you cannot fully see. Say what the rule is and what it depends on.`,
      ``,
      `FORMAT: Short, clear conversational sentences in plain paragraphs, like a senior speaking to a junior. No markdown symbols — no asterisks, no # headings, no tables, no bullet dashes. For lists use numbered lines ("1. …"). Under about 160 words. Do not append disclaimers; the interface already carries one.`,
      ``,
      `RETRIEVED RULEBOOK ENTRIES (authoritative — prefer these over memory):`,
      rulesCtx || "(none retrieved for this question)",
      ``,
      `CURRENT BUNDLE: ${ctx.bundleSummary || "(no bundle open)"}`,
      `DEFECTS FOUND SO FAR:`,
      defectsCtx || "(scrutiny not yet run)",
      `LIMITATION: ${ctx.limitation || "(not computed)"}`,
      ``,
      `FINAL REMINDER: the whole answer in ${replyLang}, no meta-commentary.`,
      ``,
      `QUESTION: ${question}`,
    ].join("\n"),
    // Indic scripts tokenise far less efficiently than Latin — the same answer
    // in Tamil or Bengali costs several times the tokens it does in English, and
    // at a flat 800 the reply gets cut off mid-sentence. Budget by script.
    { maxTokens: /Latin|English|Hinglish/.test(replyLang) ? 900 : 2000 }
  );

  return (
    answer ??
    "The AI provider did not respond, possibly rate-limited. Please try again in a moment. The scrutiny engine is unaffected."
  );
}
