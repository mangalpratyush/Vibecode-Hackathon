"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Full-screen sign-in preloader: a counter eases 0 → 100 while cream "paper"
 * rises over the PARAM wordmark. mix-blend-difference inverts the type as the
 * fill passes through it, so the word reads in both halves.
 *
 * Orchestration lives in PreloaderProvider — this component only reports when
 * the count is done and slides up when told to. The provider holds the reveal
 * until the destination route has actually committed, so the user never sees a
 * flash of the login screen behind it.
 *
 * Rendered through a portal to <body>: an ancestor with backdrop-blur would
 * otherwise trap a position:fixed overlay inside its own stacking context.
 */

const COUNT_MS = 2400;
const HOLD_MS = 260;
export const EXIT_MS = 700;

/*
  Taken from the sign-in screen so the two read as one moment rather than two
  designs: the same warm near-black ground, the same ivory the wordmark is set
  in there, and the same oxblood that washes the middle of the hero.
*/
const GROUND = "#171313"; // hero base
const IVORY = "#fffaf0"; // hero wordmark / rising paper
const OXBLOOD = "rgba(75, 25, 32, 0.55)"; // the hero's mid gradient band

/*
  The colour the blended type is PAINTED, which is not the colour it appears.

  mix-blend-difference renders |src − backdrop|, so painting the type pure white
  over a warm near-black ground gives |255−23, 255−19, 255−19| = (232,236,236) —
  blue is highest, and the wordmark comes out a cool mint that fights the hero's
  warm ivory. Painting it #fff8ee instead yields (232,229,219) over the ground,
  which is the warm off-white the sign-in screen uses, and still collapses to
  near black over the ivory fill. The value is chosen for what difference makes
  of it, not for how it looks in the swatch.
*/
const BLEND_INK = "#fff8ee";

const WAVE_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 60" preserveAspectRatio="none">` +
    `<path d="M0 32 C100 8 200 56 300 32 C400 8 500 56 600 32 C700 8 800 56 900 32 C1000 8 1100 56 1200 32 L1200 60 L0 60 Z" fill="${IVORY}"/>` +
    `</svg>`
);

export default function LoginPreloader({
  title,
  exiting,
  onCountDone,
}: {
  title: string;
  exiting: boolean;
  onCountDone: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(onCountDone);

  useEffect(() => {
    doneRef.current = onCountDone;
  }, [onCountDone]);

  useEffect(() => {
    let raf = 0;
    let hold: ReturnType<typeof setTimeout> | undefined;
    const start = performance.now();
    const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / COUNT_MS);
      setProgress(Math.round(easeOutCubic(p) * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
      else hold = setTimeout(() => doneRef.current(), HOLD_MS);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (hold) clearTimeout(hold);
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-hidden will-change-transform"
      style={{
        background: GROUND,
        transform: exiting ? "translateY(-100%)" : "translateY(0)",
        transition: `transform ${EXIT_MS}ms cubic-bezier(0.76, 0, 0.24, 1)`,
      }}
      aria-live="polite"
      aria-label={title}
    >
      {/*
        The oxblood wash the hero carries across its middle. Sits under the
        rising paper so it reads as the same room the sign-in screen is lit in,
        and disappears behind the fill exactly as the hero image does.
      */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 85% at 50% 45%, ${OXBLOOD} 0%, transparent 62%)`,
        }}
      />

      {/* rising paper */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ height: `${progress}%`, transition: "height 140ms linear" }}
      >
        <div
          className="absolute left-0 h-[54px] w-[200%]"
          style={{
            top: "-53px",
            backgroundImage: `url("data:image/svg+xml,${WAVE_SVG}")`,
            backgroundSize: "50% 100%",
            backgroundRepeat: "repeat-x",
            animation: "param-wave 2.4s linear infinite",
          }}
        />
        <div className="absolute inset-0" style={{ background: IVORY }} />
      </div>

      {/*
        Wordmark, inverted by the rising fill.

        Set in the hero's serif at the hero's tracking, so the word the user
        just looked at on the sign-in screen is the same word here — only
        bigger. mix-blend-difference is what makes it flip from ivory to near
        black as the paper passes through it; the painted colour is BLEND_INK,
        chosen for what difference makes of it rather than for itself.
      */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div
          className="select-none text-center mix-blend-difference"
          style={{ color: BLEND_INK, animation: "param-breathe 2.4s ease-in-out infinite" }}
        >
          <div
            className="font-serif font-bold leading-[0.85] tracking-[-0.035em]"
            style={{ fontSize: "clamp(3.6rem, 14vw, 11rem)" }}
          >
            PARAM
          </div>
          <span
            aria-hidden
            className="mx-auto mt-5 block h-px w-16 bg-current opacity-60 sm:w-24"
          />
          <div
            className="mt-4 font-bold uppercase tracking-[0.13em] opacity-85"
            style={{ fontSize: "clamp(0.55rem, 1.15vw, 0.82rem)" }}
          >
            Pre Assessment Registry and Audit Mitra
          </div>
        </div>
      </div>

      {/* status line — the hero's eyebrow, same rule-then-label construction */}
      <div
        className="absolute left-6 top-6 flex items-center gap-3 mix-blend-difference md:left-10 md:top-9"
        style={{ color: BLEND_INK }}
      >
        <span aria-hidden className="h-px w-7 bg-current opacity-70" />
        <span className="text-[10px] font-bold uppercase tracking-[0.13em] md:text-[11px]">
          {title}
        </span>
      </div>

      {/* counter, set in the hero's serif */}
      <div
        className="absolute bottom-2 right-6 flex items-baseline mix-blend-difference md:right-10"
        style={{ color: BLEND_INK }}
      >
        <span
          className="num font-serif font-bold leading-none tracking-[-0.04em]"
          style={{ fontSize: "clamp(4rem, 14vw, 12rem)" }}
        >
          {progress}
        </span>
        <span
          className="font-serif font-bold leading-none"
          style={{ fontSize: "clamp(1.4rem, 3.6vw, 3.2rem)" }}
        >
          %
        </span>
      </div>
    </div>,
    document.body
  );
}
