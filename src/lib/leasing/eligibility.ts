// Deterministic affordable-housing pre-screen. The AI agent never decides
// eligibility on its own — it calls this and reports the result.
// This is a PRE-SCREEN only; final eligibility is determined at application
// with income verification.

export type LimitRow = { amiPercent: number; householdSize: number; maxIncome: number };
export type UnitRow = {
  id: string;
  unitNumber: string;
  bedrooms: number;
  rent: number;
  amiPercent: number;
  accessible: boolean;
  status: string;
  availableDate: Date | null;
};

export type UnitScreen = {
  unitId: string;
  unitNumber: string;
  bedrooms: number;
  rent: number;
  amiPercent: number;
  eligible: boolean;
  reasons: string[];
};

export function maxIncomeFor(
  limits: LimitRow[],
  amiPercent: number,
  householdSize: number,
): number | null {
  const exact = limits.find((l) => l.amiPercent === amiPercent && l.householdSize === householdSize);
  if (exact) return exact.maxIncome;
  // HUD convention beyond the published table: +8% of the 4-person limit per extra person.
  const four = limits.find((l) => l.amiPercent === amiPercent && l.householdSize === 4);
  if (four && householdSize > 8) {
    const eight = limits.find((l) => l.amiPercent === amiPercent && l.householdSize === 8);
    const base = eight?.maxIncome ?? four.maxIncome * 1.32;
    return Math.round(base + four.maxIncome * 0.08 * (householdSize - 8));
  }
  return null;
}

export function screenUnits(input: {
  units: UnitRow[];
  limits: LimitRow[];
  householdSize: number;
  annualIncome: number;
  hasVoucher: boolean;
  minIncomeMultiple: number;
}): UnitScreen[] {
  const { units, limits, householdSize, annualIncome, hasVoucher, minIncomeMultiple } = input;
  return units.map((u) => {
    const reasons: string[] = [];
    let eligible = true;
    if (u.amiPercent > 0) {
      const max = maxIncomeFor(limits, u.amiPercent, householdSize);
      if (max == null) {
        reasons.push(`No ${u.amiPercent}% AMI limit on file for a household of ${householdSize} — staff review needed`);
        eligible = false;
      } else if (annualIncome > max) {
        reasons.push(`Income above the ${u.amiPercent}% AMI limit ($${max.toLocaleString()}) for ${householdSize} people`);
        eligible = false;
      }
    }
    if (!hasVoucher && minIncomeMultiple > 0) {
      const min = u.rent * 12 * minIncomeMultiple;
      if (annualIncome < min) {
        reasons.push(
          `Income below the ${minIncomeMultiple}× rent minimum ($${Math.round(min).toLocaleString()}/yr); a housing voucher or other subsidy may waive this`,
        );
        eligible = false;
      }
    }
    // Occupancy guideline: 2 per bedroom + 1 (common local standard).
    if (householdSize > u.bedrooms * 2 + 1) {
      reasons.push(`Household of ${householdSize} exceeds occupancy guideline for ${u.bedrooms}BR`);
      eligible = false;
    }
    if (eligible) reasons.push("Pre-qualifies (subject to verification at application)");
    return {
      unitId: u.id,
      unitNumber: u.unitNumber,
      bedrooms: u.bedrooms,
      rent: u.rent,
      amiPercent: u.amiPercent,
      eligible,
      reasons,
    };
  });
}
