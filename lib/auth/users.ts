import type { SessionUser } from "./token";

/**
 * Demo accounts.
 *
 * PARAM is a hackathon build, so accounts are a fixed list rather than a
 * registration flow — the judging panel needs to get in, not sign up. Passwords
 * are compared in constant time and the list never leaves the server.
 */

interface DemoUser extends SessionUser {
  password: string;
  firm: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: "u_advocate",
    name: "Adv. Ananya Rao",
    email: "advocate@param.demo",
    role: "ADVOCATE",
    firm: "Chambers of Ananya Rao, Delhi High Court",
    password: "Param@123",
  },
  {
    id: "u_clerk",
    name: "Ramesh Kumar",
    email: "clerk@param.demo",
    role: "CLERK",
    firm: "Filing clerk, Supreme Court of India",
    password: "Param@123",
  },
];

/** Timing-safe-ish comparison; avoids leaking password length by early exit. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authenticate(email: string, password: string): SessionUser | null {
  const u = DEMO_USERS.find(
    (x) => x.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (!u || !sameSecret(u.password, password)) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export function userByEmail(email: string): DemoUser | undefined {
  return DEMO_USERS.find((x) => x.email.toLowerCase() === email.toLowerCase());
}
