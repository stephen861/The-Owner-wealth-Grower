// Small parsers shared by the CRM server actions. Form values arrive as
// strings; these normalise them into the types Prisma expects.

export function str(v: FormDataEntryValue | null): string | null {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
}

export function int(v: FormDataEntryValue | null): number {
  const n = Number(str(v) ?? "0");
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function flt(v: FormDataEntryValue | null): number {
  const n = Number(str(v) ?? "0");
  return Number.isFinite(n) ? n : 0;
}

export function date(v: FormDataEntryValue | null): Date | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Clamp a percentage-style field into 0-100.
export function pct(v: FormDataEntryValue | null): number {
  return Math.min(100, Math.max(0, flt(v)));
}
