"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import LoginPreloader, { EXIT_MS } from "./LoginPreloader";

/**
 * Hosts the sign-in preloader at the ROOT layout level so it survives the
 * route change. Sequence: counter runs → router.push at 100% → the overlay
 * keeps covering the screen until the destination pathname has actually
 * committed → only then slide up, revealing the new page (never a flash of
 * the login screen underneath).
 */

interface StartArgs {
  title: string;
  href: string;
}

const PreloaderContext = createContext<{ start: (args: StartArgs) => void } | null>(null);

/** Null outside the provider, callers should fall back to a plain push. */
export function usePreloader() {
  return useContext(PreloaderContext);
}

/** If the route never commits (offline, error page…), don't block forever. */
const STUCK_MS = 6000;

export default function PreloaderProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [target, setTarget] = useState<StartArgs | null>(null);
  const [countDone, setCountDone] = useState(false);
  const [forced, setForced] = useState(false);

  // Exit begins only once the destination route is on screen (or forced).
  const exiting = countDone && target !== null && (pathname === target.href || forced);

  // Unmount once the slide-up reveal has finished.
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => {
      setTarget(null);
      setCountDone(false);
      setForced(false);
    }, EXIT_MS + 80);
    return () => clearTimeout(t);
  }, [exiting]);

  // Safety valve: waiting on a navigation that never lands.
  useEffect(() => {
    if (!countDone || exiting) return;
    const t = setTimeout(() => setForced(true), STUCK_MS);
    return () => clearTimeout(t);
  }, [countDone, exiting]);

  const start = useCallback(
    (args: StartArgs) => {
      router.prefetch(args.href); // warm the route while the counter runs
      setCountDone(false);
      setForced(false);
      setTarget(args);
    },
    [router]
  );

  const ctx = useMemo(() => ({ start }), [start]);

  return (
    <PreloaderContext.Provider value={ctx}>
      {children}
      {target && (
        <LoginPreloader
          title={target.title}
          exiting={exiting}
          onCountDone={() => {
            setCountDone(true);
            router.push(target.href);
          }}
        />
      )}
    </PreloaderContext.Provider>
  );
}
