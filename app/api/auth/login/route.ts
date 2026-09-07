import { NextResponse } from "next/server";
import { authenticate } from "@/lib/auth/users";
import { setSessionCookie } from "@/lib/auth/session";

export async function POST(req: Request) {
  let email = "";
  let password = "";
  try {
    const body = await req.json();
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const user = authenticate(email, password);
  // One message for both cases: never reveal whether the email exists.
  if (!user)
    return NextResponse.json(
      { error: "Those credentials do not match an account." },
      { status: 401 }
    );

  await setSessionCookie(user);
  return NextResponse.json({ ok: true, user });
}
