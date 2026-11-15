// Server-side guard for staff-only server actions. Server actions can be
// invoked from any route (including the public /chat page), so every staff
// action must call requireStaff() itself — the proxy alone is not enough.
import { cookies } from "next/headers";
import { authBypassed, authConfig, SESSION_COOKIE, verifySessionToken } from "./auth";

export async function isStaff(): Promise<boolean> {
  if (authBypassed()) return true;
  const cfg = authConfig();
  if (!cfg.ok) return false;
  const jar = await cookies();
  return verifySessionToken(cfg.secret, jar.get(SESSION_COOKIE)?.value);
}

export async function requireStaff(): Promise<void> {
  if (!(await isStaff())) throw new Error("Staff login required");
}
