"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authConfig, createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_HOURS } from "@/lib/auth";

// Only allow redirects back into this app.
function safeNext(v: FormDataEntryValue | null): string {
  const s = (v ?? "").toString();
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/leasing";
}

export async function login(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const cfg = authConfig();
  if (!cfg.ok) redirect(`/login?error=config&next=${encodeURIComponent(next)}`);
  const given = (formData.get("password") ?? "").toString();
  if (!(await passwordMatches(cfg.secret, cfg.password, given))) {
    await new Promise((r) => setTimeout(r, 1500)); // slow down guessing
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(cfg.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  redirect(next);
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
