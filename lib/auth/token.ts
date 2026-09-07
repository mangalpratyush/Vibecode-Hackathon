import { SignJWT, jwtVerify } from "jose";

/**
 * Pure JWT helpers, no Next.js or Node-only imports so the root proxy.ts
 * can verify sessions in the edge runtime.
 */

export const SESSION_COOKIE = "param_session";
export const SESSION_DAYS = 7;

export type UserRole = "ADVOCATE" | "CLERK";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (add it to .env.local)");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: (payload.name as string) ?? "",
      email: (payload.email as string) ?? "",
      role: (payload.role as UserRole) ?? "ADVOCATE",
    };
  } catch {
    return null;
  }
}
