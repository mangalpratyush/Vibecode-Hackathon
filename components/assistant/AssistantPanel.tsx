"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, Send, Sparkles } from "lucide-react";

/**
 * The PARAM Assistant, as a screen.
 *
 * It replies in the language the question was asked in — English, हिंदी, বাংলা,
 * தமிழ், or romanised Hinglish — and the language is decided server-side from
 * the script of the question rather than guessed by the model.
 *
 * The bundle selector is the point of the page rather than a nicety. With a
 * bundle chosen, anything specific to it is grounded in what the deterministic
 * engine actually found; without one, the Assistant answers on the rulebook and
 * general practice and says so. Making that switch visible stops the user from
 * assuming an answer is about their matter when it is not.
 */

interface Msg {
  role: "user" | "assistant";
  text: string;
}

export interface BundleOption {
  id: string;
  title: string;
  caseTypeCode: string;
}

const SUGGESTIONS = [
  "What is the time requisite for obtaining a certified copy?",
  "वकालतनामा पर वेलफेयर स्टाम्प कितने रुपये का लगता है?",
  "Section 34 me delay condone ho sakta hai kya?",
  "What must go into a Supreme Court paperbook?",
  "সার্টিফায়েড কপি পেতে যে সময় লাগে তা কি বাদ যায়?",
];

export default function AssistantPanel({
  bundles,
  aiReady,
  initialBundleId = "",
}: {
  bundles: BundleOption[];
  aiReady: boolean;
  initialBundleId?: string;
}) {
  const [bundleId, setBundleId] = useState(initialBundleId);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [msgs, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ question: q, bundleId }),
      });
      const data = await res.json();
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: data.answer ?? data.error ?? "No answer came back." },
      ]);
    } catch {
      setMsgs((m) => [
        ...m,
        { role: "assistant", text: "Could not reach the server. Try again." },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const grounded = bundles.find((b) => b.id === bundleId);

  return (
    // dvh, not vh: on mobile browsers the address bar makes vh taller than the
    // visible viewport, which would push the composer off the bottom of the
    // screen — the one control that must always be reachable.
    <div className="card flex h-[calc(100dvh-17rem)] min-h-[28rem] flex-col overflow-hidden">
      {/* ── Context bar ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-[#fcfaf7] px-5 py-3">
        <label className="flex items-center gap-2.5">
          <span className="eyebrow">Grounded in</span>
          <select
            value={bundleId}
            onChange={(e) => setBundleId(e.target.value)}
            className="max-w-[22rem] rounded-lg border border-rule bg-white px-2.5 py-1.5 text-[12.5px] text-ink outline-none transition focus:border-[var(--brand)]/50"
          >
            <option value="">No bundle — rulebook and general practice</option>
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.caseTypeCode} · {b.title}
              </option>
            ))}
          </select>
        </label>

        <span className="ml-auto flex items-center gap-1.5 text-[11.5px] text-ink-soft">
          <Languages className="h-[14px] w-[14px]" strokeWidth={1.8} />
          Replies in the language you ask in
        </span>
      </header>

      {/* ── Transcript ── */}
      <div ref={scrollRef} className="thin-scroll flex-1 overflow-y-auto px-5 py-6">
        {msgs.length === 0 ? (
          <div className="mx-auto max-w-2xl">
            {!aiReady && (
              <div className="mb-6 rounded-xl border border-objection/25 bg-[var(--objection-bg)] px-4 py-3 text-[12.5px] leading-relaxed text-objection">
                No AI key is configured, so the Assistant cannot answer freely yet. Add{" "}
                <code className="font-mono">GEMINI_API_KEYS</code> (or{" "}
                <code className="font-mono">ANTHROPIC_API_KEY</code>) to{" "}
                <code className="font-mono">.env.local</code> and restart. The scrutiny
                engine, rulebook and limitation computation all run without a key and are
                unaffected.
              </div>
            )}

            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-[15px] font-black text-[var(--brand)]">
                प
              </span>
              <div>
                <h2 className="font-serif text-[22px] leading-tight text-ink">
                  Ask about anything you are about to file.
                </h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
                  Registry objections, what belongs in a paperbook, vakalatnama and
                  affidavit requirements, court fee, annexures and translations,
                  limitation and condonation — and the bundle you have open.
                  {grounded ? (
                    <>
                      {" "}
                      Answers about <strong className="text-ink">{grounded.title}</strong>{" "}
                      come from what the scrutiny actually found, never from guesswork.
                    </>
                  ) : (
                    <> Pick a bundle above to ground answers in your own filing.</>
                  )}
                </p>
              </div>
            </div>

            <p className="eyebrow mt-8">Try one</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="group flex items-start gap-2.5 rounded-xl border border-rule bg-white px-3.5 py-3 text-left text-[13px] leading-snug text-ink transition hover:border-[var(--brand)]/40 hover:bg-[var(--brand-soft)]/50"
                >
                  <Sparkles
                    className="mt-0.5 h-[14px] w-[14px] shrink-0 text-ink-soft transition group-hover:text-[var(--brand)]"
                    strokeWidth={1.8}
                  />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-5">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "assistant" && (
                  <p className="eyebrow mb-1.5">PARAM Assistant</p>
                )}
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--brand)] px-4 py-2.5 text-[13.5px] leading-relaxed text-white"
                      : "whitespace-pre-wrap text-[14px] leading-[1.75] text-ink"
                  }
                >
                  {m.text}
                </div>
              </div>
            ))}

            {busy && (
              <div>
                <p className="eyebrow mb-1.5">PARAM Assistant</p>
                <span className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-soft/45"
                      style={{ animationDelay: `${i * 130}ms` }}
                    />
                  ))}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Composer ── */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="border-t border-rule bg-[#fcfaf7] px-5 py-4"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2.5">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="Ask in English, हिंदी, বাংলা, தமிழ், मराठी…"
            className="max-h-40 flex-1 resize-none rounded-xl border border-rule bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none transition placeholder:text-ink-soft/55 focus:border-[var(--brand)]/50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Ask"
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl bg-[var(--brand)] text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-40"
          >
            <Send className="h-[16px] w-[16px]" strokeWidth={1.9} />
          </button>
        </div>
        <p className="mx-auto mt-2.5 max-w-2xl text-[11px] leading-snug text-ink-soft/80">
          Grounded in PARAM&apos;s rulebook and, when a bundle is selected, that
          bundle&apos;s findings. Not legal advice, and not a substitute for reading the
          rule.
        </p>
      </form>
    </div>
  );
}
