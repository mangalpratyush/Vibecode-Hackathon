import { cache } from "react";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  verifySessionToken,
  type SessionUser,
} from "./token";

/**
 * Cookie-backed session helpers for server components and route handlers.
 * Token creation/verification lives in ./token (edge-safe, used by proxy.ts).
 */

export { SESSION_COOKIE, createSessionToken, verifySessionToken };
export type { SessionUser, UserRole } from "./token";

/**
 * Current user from the request cookie, server components & route handlers.
 * Wrapped in React `cache()` so repeated calls within one request (the portal
 * layout, its context builder and the page all ask for it) verify the JWT once.
 */
export const getSessionUser = cache(async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
});

/** Set the session cookie on the outgoing response (route handlers only). */
export async function setSessionCookie(user: SessionUser) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
