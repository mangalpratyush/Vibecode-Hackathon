"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  Eye,
  EyeOff,
  FileText,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { usePreloader } from "./PreloaderProvider";

type LoginMode = "form" | "advocate" | "clerk";

const DEMO = [
  {
    mode: "advocate" as const,
    title: "Explore the live demo",
    detail: "Review a prepared Supreme Court filing",
    email: "advocate@param.demo",
    icon: Briefcase,
    featured: true,
  },
  {
    mode: "clerk" as const,
    title: "Enter as a filing clerk",
    detail: "Prepare and audit a new filing bundle",
    email: "clerk@param.demo",
    icon: FileText,
    featured: false,
  },
];

export default function AuthCard() {
  const router = useRouter();
  const preloader = usePreloader();
  const [email, setEmail] = useState("advocate@param.demo");
  const [password, setPassword] = useState("Param@123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<LoginMode | null>(null);

  async function login(nextEmail: string, nextPassword: string, mode: LoginMode) {
    if (busy) return;
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail, password: nextPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed.");
        setBusy(null);
        return;
      }
      if (preloader) preloader.start({ title: "Opening PARAM", href: "/dashboard" });
      else router.push("/dashboard");
    } catch {
      setError("Could not reach the server. Please try again.");
      setBusy(null);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void login(email, password, "form");
  }

  function openDemo(demoEmail: string, mode: Exclude<LoginMode, "form">) {
    setEmail(demoEmail);
    setPassword("Param@123");
    void login(demoEmail, "Param@123", mode);
  }

  return (
    <div className="w-full max-w-[29rem] rounded-[1.75rem] border border-white/70 bg-[#fbf9f5]/98 p-7 text-[#192f43] shadow-[0_34px_90px_-36px_rgba(0,0,0,0.8),0_12px_32px_-22px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#71645e]">
          Secure advocate access
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f0e8df] text-[#7a2832]">
          <ShieldCheck className="h-4 w-4" strokeWidth={1.8} />
        </span>
      </div>

      <div className="mt-4">
        <h2 className="font-serif text-[2.15rem] font-semibold leading-tight tracking-[-0.035em] text-[#24252a]">
          Welcome to PARAM
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#655f5c]">
          Sign in to your pre-filing audit workspace.
        </p>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block">
          <span className="text-[13px] font-semibold text-[#403936]">Email address</span>
          <span className="relative mt-1.5 block">
            <Mail
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#948d88]"
              strokeWidth={1.8}
            />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 w-full rounded-xl border border-[#d3c8c2] bg-white pl-11 pr-4 text-[14px] text-[#292627] outline-none transition placeholder:text-[#a39b96] hover:border-[#baaaa2] focus:border-[#7b2832] focus:ring-4 focus:ring-[#7b2832]/8"
              placeholder="you@chambers.in"
            />
          </span>
        </label>

        <label className="block">
          <span className="text-[13px] font-semibold text-[#403936]">Password</span>
          <span className="relative mt-1.5 block">
            <LockKeyhole
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#948d88]"
              strokeWidth={1.8}
            />
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 w-full rounded-xl border border-[#d3c8c2] bg-white pl-11 pr-12 text-[14px] text-[#292627] outline-none transition placeholder:text-[#a39b96] hover:border-[#baaaa2] focus:border-[#7b2832] focus:ring-4 focus:ring-[#7b2832]/8"
              placeholder="Enter your password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#8b837e] transition hover:bg-[#f2eeeb] hover:text-[#71242d]"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.8} />
              )}
            </button>
          </span>
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-[#dfb7b7] bg-[#fff4f3] px-3.5 py-2 text-[12px] text-[#982f2f]"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={Boolean(busy)}
          className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#71242f] px-5 text-[14px] font-semibold text-white shadow-[0_14px_28px_-16px_rgba(113,36,47,0.9)] transition hover:bg-[#581a24] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#71242f]/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy === "form" ? "Signing in…" : "Sign in securely"}
          {busy !== "form" && (
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </form>

      <div className="my-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-[#e2dad5]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#837874]">
          Or explore immediately
        </span>
        <span className="h-px flex-1 bg-[#e2dad5]" />
      </div>

      <div className="space-y-2.5">
        {DEMO.map((demo) => {
          const Icon = demo.icon;
          const loading = busy === demo.mode;
          return (
            <button
              key={demo.mode}
              type="button"
              onClick={() => openDemo(demo.email, demo.mode)}
              disabled={Boolean(busy)}
              className={`group flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                demo.featured
                  ? "border-[#193b59] bg-[#193b59] text-white shadow-[0_14px_25px_-18px_rgba(25,59,89,0.95)] hover:bg-[#112e48]"
                  : "border-[#d8ceca] bg-white/75 text-[#283b4c] hover:border-[#bcaea8] hover:bg-white"
              }`}
            >
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${
                  demo.featured ? "bg-white/12 text-[#e9bd72]" : "bg-[#f1e9e3] text-[#752832]"
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">
                  {loading ? "Opening workspace…" : demo.title}
                </span>
                <span className={`mt-0.5 block text-[11.5px] ${demo.featured ? "text-white/72" : "text-[#6f6561]"}`}>
                  {demo.detail}
                </span>
              </span>
              <ArrowRight
                className={`h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
                  demo.featured ? "text-white/70" : "text-[#897f7a]"
                }`}
                strokeWidth={1.8}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
