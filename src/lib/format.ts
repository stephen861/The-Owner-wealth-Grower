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

export const CONTACT_TYPES = [
  { value: "LEAD", label: "Lead" },
  { value: "CLIENT", label: "Client" },
  { value: "PARTNER", label: "Partner" },
  { value: "GUEST", label: "Guest traveller" },
];

export const CONTACT_STATUS = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "ACTIVE", label: "Active" },
  { value: "DORMANT", label: "Dormant" },
  { value: "LOST", label: "Lost" },
];

export const CONTACT_SOURCES = [
  { value: "REFERRAL", label: "Referral" },
  { value: "PRESENTATION", label: "Owner presentation" },
  { value: "SOCIAL", label: "Social media" },
  { value: "WEBSITE", label: "Website" },
  { value: "REPEAT", label: "Repeat client" },
  { value: "OTHER", label: "Other" },
];

// Pipeline stages in order. `open` stages roll into the forecast.
export const DEAL_STAGES = [
  { value: "NEW", label: "New", open: true },
  { value: "QUALIFYING", label: "Qualifying", open: true },
  { value: "PROPOSAL", label: "Proposal sent", open: true },
  { value: "NEGOTIATION", label: "Negotiation", open: true },
  { value: "WON", label: "Won", open: false },
  { value: "LOST", label: "Lost", open: false },
];

export const OPEN_STAGES = DEAL_STAGES.filter((s) => s.open).map((s) => s.value);

export const ACTIVITY_TYPES = [
  { value: "CALL", label: "Call" },
  { value: "EMAIL", label: "Email" },
  { value: "TEXT", label: "Text" },
  { value: "MEETING", label: "Meeting" },
  { value: "NOTE", label: "Note" },
  { value: "TASK", label: "Task" },
];

export const ACTIVITY_ICONS: Record<string, string> = {
  CALL: "\u{1F4DE}",
  EMAIL: "\u2709\uFE0F",
  TEXT: "\u{1F4AC}",
  MEETING: "\u{1F91D}",
  NOTE: "\u{1F4DD}",
  TASK: "\u2705",
};

export function contactName(c: {
  firstName: string;
  lastName?: string | null;
}): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

// Your cut of a deal: value x commission rate.
export function commissionOf(deal: {
  value: number;
  commissionRate: number;
}): number {
  return (deal.value * deal.commissionRate) / 100;
}

// Commission weighted by the deal's probability of closing.
export function weightedCommissionOf(deal: {
  value: number;
  commissionRate: number;
  probability: number;
}): number {
  return (commissionOf(deal) * deal.probability) / 100;
}

export function labelFor(
  list: { value: string; label: string }[],
  value: string | null | undefined,
): string {
  if (!value) return "—";
  return list.find((x) => x.value === value)?.label ?? value;
}
