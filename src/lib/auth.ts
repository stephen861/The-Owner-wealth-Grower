// Staff login for the leasing inbox and the rest of the CRM.
// One shared staff password (STAFF_PASSWORD) and a signing secret
// (LEASING_SESSION_SECRET), both set in the host's environment settings.
// Sessions are a signed, httpOnly cookie that expires after 12 hours.
// Uses Web Crypto only, so it runs in proxy.ts and in server code.

export const SESSION_COOKIE = "fgw_staff";
export const SESSION_HOURS = 12;
const MIN_PASSWORD = 12;
const MIN_SECRET = 32;

const enc = new TextEncoder();

export function authConfig(): { ok: true; password: string; secret: string } | { ok: false; problem: string } {
  const password = process.env.STAFF_PASSWORD ?? "";
  const secret = process.env.LEASING_SESSION_SECRET ?? "";
  if (password.length < MIN_PASSWORD) return { ok: false, problem: `STAFF_PASSWORD must be set (at least ${MIN_PASSWORD} characters)` };
  if (secret.length < MIN_SECRET) return { ok: false, problem: `LEASING_SESSION_SECRET must be set (at least ${MIN_SECRET} random characters)` };
  return { ok: true, password, secret };
}

/** Local development may run without a login; production never does. */
export function authBypassed(): boolean {
  return process.env.NODE_ENV !== "production" && !authConfig().ok;
}

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const byte of new Uint8Array(buf)) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const exp = now + SESSION_HOURS * 3600_000;
  return `${exp}.${await hmac(secret, `staff|${exp}`)}`;
}

export async function verifySessionToken(secret: string, token: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sig, await hmac(secret, `staff|${exp}`));
}

/** Constant-time password check (compares HMACs so length isn't leaked). */
export async function passwordMatches(secret: string, expected: string, given: string): Promise<boolean> {
  return safeEqual(await hmac(secret, `pw|${expected}`), await hmac(secret, `pw|${given}`));
}

/** Paths anyone on the internet may reach: the prospect chat, the two webhooks, and the login page. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/api/leasing/sms" ||
    pathname === "/api/leasing/chat" ||
    pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  );
}
