// Intake rules for the AI leasing agent.
//
// FGW standing rule: the AI agent ONLY collects information and flags what is
// missing. It never approves, denies, pre-qualifies, excludes or gates a tour
// on income, credit, background or occupancy. Stephen / Robin review every
// household and make every decision. Keep this file free of any eligibility math.

/** Statuses the AI agent may set. Decision statuses (e.g. NOT_ELIGIBLE, LEASED) are staff-only. */
export const AGENT_STATUSES = ["NEW", "PRESCREENED", "TOUR_SCHEDULED", "APPLYING", "WAITLIST"] as const;

export type IntakeFields = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  householdSize?: number | null;
  annualIncome?: number | null;
  hasVoucher?: boolean | null;
  bedroomsWanted?: number | null;
  moveInDate?: Date | null;
};

/** Items the team needs before reviewing a household. Order = the order the agent asks. */
export function missingIntakeItems(p: IntakeFields): string[] {
  const missing: string[] = [];
  if (!p.name) missing.push("name");
  if (!p.phone && !p.email) missing.push("phone or email");
  if (p.bedroomsWanted == null) missing.push("bedrooms wanted");
  if (!p.moveInDate) missing.push("move-in date");
  if (p.householdSize == null) missing.push("number of people who will live in the home");
  if (p.annualIncome == null) missing.push("total monthly or yearly household income");
  if (p.hasVoucher == null) missing.push("whether they have a housing voucher");
  return missing;
}

/** The note staff see in the handoff queue once intake is captured. */
export function staffReviewNote(p: IntakeFields): string {
  const missing = missingIntakeItems(p);
  return missing.length
    ? `Intake for staff review. Still missing: ${missing.join(", ")}`
    : "Intake complete. Ready for staff review";
}
