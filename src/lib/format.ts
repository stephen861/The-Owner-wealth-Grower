// Shared formatting + label helpers used across the UI.

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Format a Date as yyyy-mm-dd for <input type="date"> default values.
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function daysUntil(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function nights(checkIn: Date | string, checkOut: Date | string): number {
  const a = typeof checkIn === "string" ? new Date(checkIn) : checkIn;
  const b = typeof checkOut === "string" ? new Date(checkOut) : checkOut;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export const OWNERSHIP_TYPES = [
  { value: "POINTS", label: "Points" },
  { value: "DEEDED_WEEK", label: "Deeded week" },
  { value: "FRACTIONAL", label: "Fractional" },
  { value: "RTU", label: "Right-to-use" },
];

export const FEE_TYPES = [
  { value: "MAINTENANCE", label: "Maintenance fee" },
  { value: "SPECIAL_ASSESSMENT", label: "Special assessment" },
  { value: "CLUB_DUES", label: "Club dues" },
  { value: "LOAN", label: "Loan payment" },
  { value: "TAX", label: "Property tax" },
  { value: "OTHER", label: "Other" },
];

export const RECURRENCE = [
  { value: "ONCE", label: "One-time" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUAL", label: "Annual" },
];

export const RESERVATION_STATUS = [
  { value: "PLANNED", label: "Planned" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const BENEFIT_CATEGORIES = [
  { value: "TIER", label: "Membership tier" },
  { value: "PERK", label: "Perk" },
  { value: "DISCOUNT", label: "Discount" },
  { value: "CREDIT", label: "Credit" },
  { value: "UPGRADE", label: "Upgrade" },
];

export const EXCHANGE_NETWORKS = [
  { value: "RCI", label: "RCI" },
  { value: "INTERVAL", label: "Interval International" },
  { value: "WESTGATE_TRAVEL", label: "Westgate Cruise & Travel" },
  { value: "COSTCO_TRAVEL", label: "Costco Travel" },
  { value: "SAMS_TRAVEL", label: "Sam's Club Travel" },
  { value: "DAE", label: "Dial An Exchange (DAE)" },
  { value: "SFX", label: "SFX Preferred Resorts" },
  { value: "OTHER", label: "Other" },
];

export const PERK_CATEGORIES = [
  { value: "REWARD", label: "Reward / cash back" },
  { value: "CREDIT", label: "Travel credit" },
  { value: "DISCOUNT", label: "Discount" },
  { value: "PERK", label: "Perk" },
];

export const DEPOSIT_TYPES = [
  { value: "WEEK", label: "Week" },
  { value: "POINTS", label: "Points" },
];

export const DEPOSIT_STATUS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "USED", label: "Used / traded" },
  { value: "EXPIRED", label: "Expired" },
];

export function labelFor(
  list: { value: string; label: string }[],
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return list.find((x) => x.value === value)?.label ?? value;
}

// ── Leasing agent ───────────────────────────────────────────────
export const PROSPECT_STATUS = [
  { value: "NEW", label: "New" },
  { value: "PRESCREENED", label: "Pre-qualified" },
  { value: "TOUR_SCHEDULED", label: "Tour scheduled" },
  { value: "APPLYING", label: "Applying" },
  { value: "WAITLIST", label: "Waitlist" },
  { value: "LEASED", label: "Leased" },
  { value: "NOT_ELIGIBLE", label: "Not eligible" },
  { value: "CLOSED", label: "Closed" },
];

export const HOUSING_PROGRAMS = [
  { value: "LIHTC", label: "LIHTC (tax credit)" },
  { value: "SECTION_8", label: "Section 8 (project-based)" },
  { value: "PBV", label: "Project-based voucher" },
  { value: "HOME", label: "HOME program" },
  { value: "MIXED", label: "Mixed-income" },
  { value: "MARKET", label: "Market rate" },
];

export const UNIT_STATUS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "LEASED", label: "Leased" },
  { value: "DOWN", label: "Down / make-ready" },
];

export function timeAgo(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
