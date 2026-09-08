"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, BookOpen, Check, ChevronDown, Copy, FileSearch, FolderOpen, Languages, LoaderCircle, MessageSquarePlus, RotateCcw, Scale, ShieldCheck, X } from "lucide-react";

export interface BundleOption { id: string; title: string; caseTypeCode: string }
interface Turn { id: number; question: string; answer?: string; error?: string; sources?: string[] }

const PROMPTS = [
  { icon: FileSearch, title: "Understand an objection", detail: "Make sense of a finding and what to do next.", general: "How should I read a Registry defect memo?", filing: "Explain the most important defects found in this filing and what I should review first." },
  { icon: Scale, title: "Check limitation", detail: "Understand dates, exclusions and delay.", general: "How does time spent obtaining a certified copy affect limitation?", filing: "Explain the limitation calculation for this filing, including any missing information." },
  { icon: BookOpen, title: "Prepare the paperbook", detail: "Get clarity on documents and filing requirements.", general: "What belongs in a Supreme Court paperbook?", filing: "Based on this filing's findings, what should I check before preparing the paperbook?" },
  { icon: ShieldCheck, title: "Plan the next step", detail: "Turn your review into a practical checklist.", general: "How do I use PARAM to review a filing before submission?", filing: "Give me a short checklist of the next steps for this filing based on the recorded findings." },
];

export default function AssistantPanel({ bundles, aiReady, initialBundleId = "" }: {
  bundles: BundleOption[]; aiReady: boolean; initialBundleId?: string;
}) {
  const [bundleId, setBundleId] = useState(initialBundleId);
  const [conversations, setConversations] = useState<Record<string, Turn[]>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [copyError, setCopyError] = useState("");
  const [showLatest, setShowLatest] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const nearBottom = useRef(true);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grounded = bundles.find((b) => b.id === bundleId);
  const turns = conversations[bundleId] ?? [];

  useEffect(() => () => { abortRef.current?.abort(); if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useEffect(() => {
    if (nearBottom.current) {
      scrollRef.current?.scrollTo({ top: conversations[bundleId]?.length ? scrollRef.current.scrollHeight : 0, behavior: "instant" });
    }
  }, [conversations, busy, bundleId]);
  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 140) + "px";
  }, [input]);

  function updateTurn(scope: string, id: number, changes: Partial<Turn>) {
    setConversations((all) => ({ ...all, [scope]: (all[scope] ?? []).map((t) => t.id === id ? { ...t, ...changes } : t) }));
  }

  async function ask(question: string, retryId?: number) {
    const q = question.trim();
    if (!q || busy || !aiReady) return;
    const scope = bundleId;
    const id = retryId ?? ++sequence.current;
    if (retryId) updateTurn(scope, id, { error: undefined });
    else {
      setConversations((all) => ({ ...all, [scope]: [...(all[scope] ?? []), { id, question: q }] }));
      setInput("");
    }
    setBusy(true);
    setConfirmClear(false);
    nearBottom.current = true;
    setShowLatest(false);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ question: q, bundleId: scope }), signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || typeof data.answer !== "string" || !data.answer.trim()) {
        throw new Error(data.error || "No answer came back. Please try again.");
      }
      updateTurn(scope, id, { answer: data.answer, sources: Array.isArray(data.citedRules) ? [...new Set<string>(data.citedRules.filter((s: unknown) => typeof s === "string"))] : [] });
    } catch (error) {
      if (controller.signal.aborted) return;
      updateTurn(scope, id, { error: error instanceof TypeError ? "The connection was interrupted. Please try again." : error instanceof Error ? error.message : "Something went wrong. Please try again." });
    } finally {
      if (!controller.signal.aborted) { setBusy(false); inputRef.current?.focus({ preventScroll: true }); }
    }
  }

  function changeContext(value: string) {
    setBundleId(value);
    setCopyError("");
    setCopied(null);
    setInput("");
    setConfirmClear(false);
    setShowLatest(false);
    nearBottom.current = true;
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("bundle", value); else url.searchParams.delete("bundle");
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  async function copyAnswer(turn: Turn) {
    try {
      await navigator.clipboard.writeText(turn.answer || "");
      setCopied(turn.id);
      setCopyError("");
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(null), 2000);
    } catch { setCopyError("Copy is unavailable in this browser. You can select and copy the answer text."); }
  }

  return (
    <section className="pa-workspace" aria-label="PARAM Assistant workspace">
      <header className="pa-context">
        <span className="pa-context-icon"><FolderOpen size={21} strokeWidth={1.7} /></span>
        <div className="pa-context-field">
          <label htmlFor="assistant-filing">CONVERSATION CONTEXT</label>
          <div className="pa-select-wrap">
            <select id="assistant-filing" value={bundleId} onChange={(e) => changeContext(e.target.value)} disabled={busy}>
              <option value="">General registry practice</option>
              {bundles.map((b) => <option key={b.id} value={b.id}>{b.title} · {b.caseTypeCode}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden />
          </div>
        </div>
        <span className={"pa-context-tag" + (grounded ? " is-filing" : "")}><span />{grounded ? "Filing selected" : "Rulebook context"}</span>
        <button className="pa-new-chat" disabled={!turns.length || busy} onClick={() => setConfirmClear(true)} title="New conversation in this context"><MessageSquarePlus size={18} /><span>New conversation</span></button>
      </header>

      {confirmClear && <div className="pa-clear-confirm" role="alert">
        <span>Clear this conversation? These messages are only kept for this session.</span>
        <button onClick={() => { setConversations((all) => ({ ...all, [bundleId]: [] })); setConfirmClear(false); setCopyError(""); setCopied(null); inputRef.current?.focus(); }}>Clear messages</button>
        <button aria-label="Cancel clearing conversation" onClick={() => setConfirmClear(false)}><X size={17} /></button>
      </div>}

      {!aiReady && <div className="pa-unavailable" role="status"><ShieldCheck size={20} /><div><strong>The Assistant is not connected yet.</strong><p>An AI provider needs to be configured to answer questions. Your filing checks still work, and you can browse the <Link href="/rulebook">rulebook</Link>.</p></div></div>}

      <div className="pa-transcript" ref={scrollRef} tabIndex={0} aria-label="Conversation" onScroll={() => {
        const el = scrollRef.current;
        if (el) { nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; setShowLatest(!nearBottom.current); }
      }}>
        {!turns.length ? <div className="pa-welcome">
          <h2>What would you like<br className="pa-mobile-break" /> to understand?</h2>
          <p className="pa-welcome-intro">Ask about a finding, a filing requirement, or your next step.</p>
          <div className="pa-prompts">
            {PROMPTS.map(({ icon: Icon, title, detail, general, filing }) => <button type="button" key={title} disabled={!aiReady} onClick={() => ask(grounded ? filing : general)}>
              <span className="pa-prompt-icon"><Icon size={22} strokeWidth={1.65} /></span>
              <span><strong>{title}</strong><span>{detail}</span></span>
              <ArrowUpRight size={17} className="pa-prompt-arrow" />
            </button>)}
          </div>
        </div> : <div className="pa-messages">
          {turns.map((turn) => <article className="pa-turn" key={turn.id} aria-label="Question and answer">
            <div className="pa-question"><p className="pa-message-label">YOU</p><div dir="auto">{turn.question}</div></div>
            <div className="pa-answer">
              <Image src="/brand/param-mark.svg" alt="" width={29} height={29} />
              <div className="pa-answer-content">
                <div className="pa-answer-heading"><strong>PARAM Assistant</strong><span>{grounded ? grounded.caseTypeCode + " · Filing context" : "General practice"}</span></div>
                {turn.answer ? <>
                  <div className="pa-answer-text" dir="auto">{turn.answer}</div>
                  <div className="pa-answer-tools">
                    <button onClick={() => copyAnswer(turn)} aria-label={copied === turn.id ? "Answer copied" : "Copy answer"}>{copied === turn.id ? <Check size={15} /> : <Copy size={15} />}{copied === turn.id ? "Copied" : "Copy answer"}</button>
                    {!!turn.sources?.length && <details className="pa-sources"><summary><BookOpen size={15} />Rulebook context <span>{turn.sources.length}</span><ChevronDown size={13} /></summary><div><p>Entries supplied to the Assistant. Check the original rule before relying on an answer.</p><ul>{turn.sources.map((source) => <li key={source}>{source}</li>)}</ul><Link href="/rulebook">Read the rulebook <ArrowUpRight size={14} /></Link></div></details>}
                  </div>
                </> : turn.error ? <div className="pa-answer-error" role="alert"><p>{turn.error}</p><button onClick={() => ask(turn.question, turn.id)} disabled={busy}><RotateCcw size={15} />Try again</button></div> : <p className="pa-thinking" role="status"><LoaderCircle size={17} />Reading your question and filing context…</p>}
              </div>
            </div>
          </article>)}
        </div>}
      </div>

      <div className="pa-composer-area">
        {showLatest && turns.length > 0 && <button className="pa-jump" onClick={() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }}><ArrowDown size={15} />Latest message</button>}
        {copyError && <p className="pa-copy-error" role="status">{copyError}</p>}
        <form className="pa-composer" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <label htmlFor="assistant-question" className="sr-only">Your question to PARAM Assistant</label>
          <textarea ref={inputRef} id="assistant-question" rows={2} value={input} maxLength={6000} disabled={!aiReady}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(input); } }}
            placeholder={grounded ? "Ask about this filing, a finding, or your next step…" : "Ask about registry practice or filing requirements…"} />
          <div className="pa-composer-bottom"><span><Languages size={16} /><span>Ask in any language</span></span><span className="pa-key-hint">Shift + Enter for a new line</span><button type="submit" disabled={busy || !aiReady || !input.trim()} aria-label="Send question">{busy ? <LoaderCircle size={18} className="pa-spin" /> : <ArrowUp size={19} />}<span>Send</span></button></div>
        </form>
        <div className="pa-context-note"><span>{grounded ? "Uses this filing’s recorded findings and rulebook context." : "Select a filing above for questions about your own matter."}</span>{grounded && <Link href={"/case/" + bundleId + "/score"}>View scrutiny <ArrowUpRight size={13} /></Link>}</div>
        <p className="pa-disclaimer">Each question is assessed independently. Verify the source rule before filing. This is decision support, not legal advice.</p>
      </div>
      <span className="sr-only" role="status">{busy ? "PARAM Assistant is preparing an answer." : turns.length ? "Response ready." : ""}</span>
    </section>
  );
}
