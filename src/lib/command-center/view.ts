// Small shared helpers for the Command Center screens.
import { formatCurrency } from "@/lib/format";
import { isDivisionFilter, type DivisionFilter } from "./domain";

/** Read ?division= into a validated filter, defaulting to ALL. */
export function readDivision(value: string | undefined): DivisionFilter {
  return isDivisionFilter(value) ? value : "ALL";
}

/** Reuse the existing currency formatter, from integer cents. */
export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return formatCurrency(cents / 100);
}

export function divisionBadge(division: string): string {
  return division === "AFLH" ? "blue" : "";
}
