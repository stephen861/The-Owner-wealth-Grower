// Pure domain logic for the FGW / AFLH Command Center prototype.
//
// Everything here is a pure function over plain objects so it can be tested
// without a database or a server. Each section notes the Airtable defect it is
// written to avoid.

// ---------------------------------------------------------------------------
// Divisions & filtering
// ---------------------------------------------------------------------------

export const DIVISIONS = [
  { value: "ALL", label: "All divisions" },
  { value: "FGW", label: "FGW" },
  { value: "AFLH", label: "AFLH" },
] as const;

export type DivisionFilter = (typeof DIVISIONS)[number]["value"];

export function isDivisionFilter(value: unknown): value is DivisionFilter {
  return DIVISIONS.some((d) => d.value === value);
}

/** Narrow any division-tagged list. "ALL" passes everything through. */
export function filterByDivision<T extends { division: string }>(
  rows: T[],
  division: DivisionFilter,
): T[] {
  return division === "ALL" ? rows : rows.filter((r) => r.division === division);
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function sumCents<T>(rows: T[], pick: (row: T) => number | null | undefined): number {
  return rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Fee position
//
// DEFECT AVOIDED: the source base computed "Fees Owed" as a hard-coded 650
// minus total fees, so every property shared one expected amount and any
// overpayment showed as a negative balance indistinguishable from a debt.
//
// Here the expected amount is per-property and configurable, and an
// overpayment is reported as an explicit CREDIT, never as negative debt.
// ---------------------------------------------------------------------------

export type FeeState = "OWED" | "SETTLED" | "CREDIT" | "NOT_CONFIGURED";

export type FeePosition = {
  expectedCents: number;
  paidCents: number;
  /** Always >= 0. What is still due. */
  owedCents: number;
  /** Always >= 0. Overpayment held on account. */
  creditCents: number;
  state: FeeState;
  warnings: string[];
};

export function feePosition(expectedCents: number, paidCents: number): FeePosition {
  const warnings: string[] = [];
  const expected = Math.max(0, Math.round(expectedCents));
  const paid = Math.max(0, Math.round(paidCents));

  if (expectedCents < 0 || paidCents < 0) {
    warnings.push("Negative input clamped to zero — check the source figures.");
  }

  const net = expected - paid;
  const owedCents = Math.max(0, net);
  const creditCents = Math.max(0, -net);

  let state: FeeState;
  if (expected === 0 && paid === 0) {
    state = "NOT_CONFIGURED";
    warnings.push("No expected fee configured for this property.");
  } else if (creditCents > 0) {
    state = "CREDIT";
  } else if (owedCents > 0) {
    state = "OWED";
  } else {
    state = "SETTLED";
  }

  return { expectedCents: expected, paidCents: paid, owedCents, creditCents, state, warnings };
}

// ---------------------------------------------------------------------------
// License status & revenue eligibility
//
// DEFECT AVOIDED: the source base gated revenue on an exact string match
// against "Licensed", so "licensed", "Licensed " or "License Pending" silently
// produced zero revenue with no indication anything was wrong.
//
// Here the status is a typed enum. The raw source string is kept alongside it
// and, when the two disagree, a mismatch warning is raised rather than a
// silent zero. Revenue eligibility is its own stored field, not a derived
// string comparison.
// ---------------------------------------------------------------------------

export const LICENSE_STATUSES = [
  { value: "LICENSED", label: "Licensed", revenueEligible: true },
  { value: "PROVISIONAL", label: "Provisional", revenueEligible: true },
  { value: "PENDING_LICENSE", label: "License pending", revenueEligible: false },
  { value: "UNLICENSED", label: "Unlicensed", revenueEligible: false },
  { value: "NOT_APPLICABLE", label: "Not applicable", revenueEligible: false },
  { value: "UNKNOWN", label: "Unknown", revenueEligible: false },
] as const;

export type LicenseStatus = (typeof LICENSE_STATUSES)[number]["value"];

const RAW_STATUS_MAP: Record<string, LicenseStatus> = {
  licensed: "LICENSED",
  "fully licensed": "LICENSED",
  active: "LICENSED",
  provisional: "PROVISIONAL",
  "provisional license": "PROVISIONAL",
  "license pending": "PENDING_LICENSE",
  "pending license": "PENDING_LICENSE",
  pending: "PENDING_LICENSE",
  "in application": "PENDING_LICENSE",
  unlicensed: "UNLICENSED",
  none: "UNLICENSED",
  "n/a": "NOT_APPLICABLE",
  "not applicable": "NOT_APPLICABLE",
};

/** Map a free-text source status onto the typed enum. Case/space tolerant. */
export function classifyLicenseStatus(raw: string | null | undefined): {
  status: LicenseStatus;
  recognised: boolean;
} {
  if (raw == null || raw.trim() === "") return { status: "UNKNOWN", recognised: false };
  const key = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const mapped = RAW_STATUS_MAP[key];
  return mapped
    ? { status: mapped, recognised: true }
    : { status: "UNKNOWN", recognised: false };
}

export function licenseStatusLabel(status: string): string {
  return LICENSE_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export type RevenueAssessment = {
  eligible: boolean;
  status: LicenseStatus;
  warnings: string[];
};

/**
 * Report whether a property may book revenue, using its stored typed status
 * and its stored eligibility flag. Any disagreement — between the raw source
 * string and the typed status, or between the typed status and the stored
 * flag — surfaces as a warning instead of silently zeroing revenue.
 */
export function assessRevenueEligibility(property: {
  licenseStatus: string;
  licenseStatusRaw?: string | null;
  revenueEligible: boolean;
}): RevenueAssessment {
  const warnings: string[] = [];
  const typed = LICENSE_STATUSES.find((s) => s.value === property.licenseStatus);
  const status = (typed?.value ?? "UNKNOWN") as LicenseStatus;

  if (!typed) {
    warnings.push(
      `Status "${property.licenseStatus}" is not a recognised license status — treated as Unknown.`,
    );
  }

  if (property.licenseStatusRaw != null && property.licenseStatusRaw.trim() !== "") {
    const fromRaw = classifyLicenseStatus(property.licenseStatusRaw);
    if (!fromRaw.recognised) {
      warnings.push(
        `Source status "${property.licenseStatusRaw}" could not be mapped to a typed status — confirm manually.`,
      );
    } else if (fromRaw.status !== status) {
      warnings.push(
        `Mismatch: source status "${property.licenseStatusRaw}" maps to ${licenseStatusLabel(
          fromRaw.status,
        )}, but this record is set to ${licenseStatusLabel(status)}.`,
      );
    }
  }

  const impliedByStatus = typed?.revenueEligible ?? false;
  if (property.revenueEligible !== impliedByStatus) {
    warnings.push(
      `Mismatch: ${licenseStatusLabel(status)} normally means revenue ${
        impliedByStatus ? "IS" : "is NOT"
      } eligible, but this record is marked ${
        property.revenueEligible ? "eligible" : "not eligible"
      }. Review before billing.`,
    );
  }

  return { eligible: property.revenueEligible, status, warnings };
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export const CHECKLIST_STATUSES = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETE", label: "Complete" },
] as const;

export type ReadinessSummary = {
  total: number;
  complete: number;
  blocked: number;
  requiredTotal: number;
  requiredComplete: number;
  requiredOutstanding: number;
  /** Percent of REQUIRED items complete. 100 only when every required item is done. */
  percent: number;
  ready: boolean;
};

export function readinessSummary(
  items: { status: string; required: boolean }[],
): ReadinessSummary {
  const total = items.length;
  const complete = items.filter((i) => i.status === "COMPLETE").length;
  const blocked = items.filter((i) => i.status === "BLOCKED").length;
  const required = items.filter((i) => i.required);
  const requiredComplete = required.filter((i) => i.status === "COMPLETE").length;
  const requiredOutstanding = required.length - requiredComplete;
  const percent =
    required.length === 0 ? 100 : Math.round((requiredComplete / required.length) * 100);
  return {
    total,
    complete,
    blocked,
    requiredTotal: required.length,
    requiredComplete,
    requiredOutstanding,
    percent,
    ready: requiredOutstanding === 0 && blocked === 0,
  };
}

// ---------------------------------------------------------------------------
// Referral pipeline
//
// Administrative stages only. Nothing here determines clinical admission or
// programme eligibility: the pipeline records that a human decided, and who.
// ---------------------------------------------------------------------------

export const REFERRAL_STAGES = [
  { value: "RECEIVED", label: "Received", order: 0 },
  { value: "FOLLOW_UP", label: "Follow-up", order: 1 },
  { value: "DOCUMENTS_PENDING", label: "Documents pending", order: 2 },
  { value: "HUMAN_REVIEW", label: "Human review", order: 3 },
  { value: "HUMAN_DECISION_RECORDED", label: "Human decision recorded", order: 4 },
  { value: "MOVE_IN_CHECKLIST", label: "Move-in checklist", order: 5 },
] as const;

export type ReferralStage = (typeof REFERRAL_STAGES)[number]["value"];

export function referralStageLabel(stage: string): string {
  return REFERRAL_STAGES.find((s) => s.value === stage)?.label ?? stage;
}

export function referralStageOrder(stage: string): number {
  return REFERRAL_STAGES.find((s) => s.value === stage)?.order ?? -1;
}

/** The two stages that require a recorded human decision to be present. */
const STAGES_REQUIRING_DECISION: string[] = [
  "HUMAN_DECISION_RECORDED",
  "MOVE_IN_CHECKLIST",
];

export type StageTransition = {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
};

/**
 * Decide whether a referral may move to `nextStage`.
 *
 * Rules, all of them administrative:
 *  - a blocked referral cannot advance at all;
 *  - stages advance one step at a time (no skipping human review);
 *  - entering a decision stage requires a named human decider;
 *  - moving backwards is allowed but warned about.
 *
 * This function never decides admission or eligibility — only whether the
 * paperwork state permits the next administrative step.
 */
export function evaluateReferralTransition(
  referral: {
    stage: string;
    blocked: boolean;
    blockedReason?: string | null;
    decisionRecordedBy?: string | null;
  },
  nextStage: string,
): StageTransition {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const from = referralStageOrder(referral.stage);
  const to = referralStageOrder(nextStage);

  if (to < 0) {
    blockers.push(`"${nextStage}" is not a valid referral stage.`);
    return { allowed: false, blockers, warnings };
  }

  if (referral.blocked) {
    blockers.push(
      referral.blockedReason
        ? `Referral is blocked: ${referral.blockedReason}`
        : "Referral is blocked.",
    );
  }

  if (to === from) {
    warnings.push("Referral is already at this stage.");
  }

  if (to > from + 1) {
    blockers.push(
      `Cannot skip from ${referralStageLabel(referral.stage)} to ${referralStageLabel(
        nextStage,
      )} — advance one stage at a time.`,
    );
  }

  if (to < from) {
    warnings.push(
      `Moving backwards from ${referralStageLabel(referral.stage)} to ${referralStageLabel(
        nextStage,
      )}.`,
    );
  }

  if (
    STAGES_REQUIRING_DECISION.includes(nextStage) &&
    !(referral.decisionRecordedBy ?? "").trim()
  ) {
    blockers.push(
      `${referralStageLabel(nextStage)} requires the name of the person who recorded the decision.`,
    );
  }

  return { allowed: blockers.length === 0, blockers, warnings };
}

// ---------------------------------------------------------------------------
// Approval gate
//
// DEFECT AVOIDED: the source base allowed an approval note reading "approved"
// to sit on a record whose state was still blocked, with nothing reconciling
// the two.
//
// Here `blocked` is authoritative. An approval is refused while the subject is
// blocked, and a note whose wording contradicts the state raises an explicit
// mismatch warning. Approval always requires a named human decider — no
// automated or agent approval path exists.
// ---------------------------------------------------------------------------

const APPROVAL_WORDS = /\b(approve[ds]?|authoris(?:e|ed)|authoriz(?:e|ed)|cleared|signed off|go ahead|proceed)\b/i;

export type ApprovalDecision = "APPROVE" | "REJECT";

export type ApprovalGate = {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
};

export function evaluateApprovalGate(input: {
  state: string;
  decision: ApprovalDecision;
  decidedBy?: string | null;
  decisionNote?: string | null;
  /** Authoritative blocked flag from the subject record. */
  subjectBlocked: boolean;
  subjectBlockedReason?: string | null;
  /** Set true only for a person acting in the UI. */
  actorIsHuman: boolean;
}): ApprovalGate {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!input.actorIsHuman) {
    blockers.push("Only a person can decide an approval — automated approval is not permitted.");
  }

  if (!(input.decidedBy ?? "").trim()) {
    blockers.push("Record the name of the person making this decision.");
  }

  if (input.state !== "PENDING") {
    blockers.push(`This request is already ${input.state.toLowerCase()} and cannot be decided again.`);
  }

  const note = (input.decisionNote ?? "").trim();

  if (input.decision === "APPROVE" && input.subjectBlocked) {
    blockers.push(
      input.subjectBlockedReason
        ? `Cannot approve while the subject is blocked: ${input.subjectBlockedReason}`
        : "Cannot approve while the subject is blocked.",
    );
    if (APPROVAL_WORDS.test(note)) {
      warnings.push(
        "Mismatch: the note reads as an approval, but the subject is still blocked. Clear the block first, or reword the note.",
      );
    }
  }

  if (input.decision === "REJECT" && !note) {
    warnings.push("Rejections are easier to audit with a reason recorded.");
  }

  return { allowed: blockers.length === 0, blockers, warnings };
}

/**
 * Flag already-decided approvals whose note contradicts their recorded state —
 * the exact inconsistency the source base tolerated.
 */
export function approvalConsistencyWarnings(approval: {
  state: string;
  decisionNote?: string | null;
  subjectBlocked: boolean;
}): string[] {
  const warnings: string[] = [];
  const note = (approval.decisionNote ?? "").trim();
  if (approval.state === "APPROVED" && approval.subjectBlocked) {
    warnings.push("Recorded as approved while the subject is still blocked — needs reconciliation.");
  }
  if (approval.state === "PENDING" && APPROVAL_WORDS.test(note)) {
    warnings.push("Note reads as approved but the request is still pending — no decision is recorded.");
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Source-ID reconciliation
//
// DEFECT AVOIDED: duplicate parallel link columns between the money log and
// jobs let the same source row attach twice with no canonical path.
//
// Here every imported row carries one source ID, scoped by division. This
// reconciler reports duplicates instead of letting a re-import silently create
// a second copy. It is import *planning* only — nothing in the prototype
// writes to or reads from a live base.
// ---------------------------------------------------------------------------

export type SourceIdConflict<T> = {
  key: string;
  kept: T;
  duplicates: T[];
};

export type Reconciliation<T> = {
  unique: T[];
  conflicts: SourceIdConflict<T>[];
  /** Rows with a missing or blank source ID — cannot be reconciled. */
  unidentified: T[];
  duplicateCount: number;
};

/**
 * Split rows into those with a distinct (division, sourceId) and those that
 * collide. The first occurrence of a key is kept; later ones are reported as
 * duplicates rather than merged or dropped silently.
 */
export function reconcileBySourceId<T extends { division?: string; sourceId?: string | null }>(
  rows: T[],
): Reconciliation<T> {
  const byKey = new Map<string, { kept: T; duplicates: T[] }>();
  const unidentified: T[] = [];

  for (const row of rows) {
    const sourceId = (row.sourceId ?? "").trim();
    if (sourceId === "") {
      unidentified.push(row);
      continue;
    }
    const key = `${row.division ?? "UNSPECIFIED"}::${sourceId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.duplicates.push(row);
    } else {
      byKey.set(key, { kept: row, duplicates: [] });
    }
  }

  const unique: T[] = [];
  const conflicts: SourceIdConflict<T>[] = [];
  let duplicateCount = 0;

  for (const [key, entry] of byKey) {
    unique.push(entry.kept);
    if (entry.duplicates.length > 0) {
      conflicts.push({ key, kept: entry.kept, duplicates: entry.duplicates });
      duplicateCount += entry.duplicates.length;
    }
  }

  return { unique, conflicts, unidentified, duplicateCount };
}

// ---------------------------------------------------------------------------
// Job cost rollup — one canonical money relationship
// ---------------------------------------------------------------------------

export type JobCostRollup = {
  quotedCents: number;
  approvedCents: number;
  spentCents: number;
  /** spent − approved. Positive means over the approved amount. */
  varianceCents: number;
  overApproved: boolean;
  entryCount: number;
  warnings: string[];
};

export function jobCostRollup(
  job: { id: string; quotedCents: number; approvedCents: number },
  moneyEntries: { jobId?: string | null; amountCents: number }[],
): JobCostRollup {
  const mine = moneyEntries.filter((e) => e.jobId === job.id);
  const spentCents = sumCents(mine, (e) => e.amountCents);
  const varianceCents = spentCents - job.approvedCents;
  const warnings: string[] = [];

  if (job.approvedCents === 0 && spentCents > 0) {
    warnings.push("Spend recorded against this job with nothing approved.");
  }
  if (varianceCents > 0 && job.approvedCents > 0) {
    warnings.push("Spend exceeds the approved amount.");
  }

  return {
    quotedCents: job.quotedCents,
    approvedCents: job.approvedCents,
    spentCents,
    varianceCents,
    overApproved: varianceCents > 0 && job.approvedCents > 0,
    entryCount: mine.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Agent check-in freshness
// ---------------------------------------------------------------------------

export type CheckInHealth = "BLOCKED" | "STALE" | "NO_EVIDENCE" | "FRESH" | "NEVER";

export function checkInHealth(
  agent: {
    lastCheckInAt?: Date | null;
    lastEvidenceNote?: string | null;
    blocked: boolean;
  },
  now: Date = new Date(),
  staleAfterHours = 24,
): { health: CheckInHealth; hoursSince: number | null } {
  const hoursSince =
    agent.lastCheckInAt == null
      ? null
      : (now.getTime() - agent.lastCheckInAt.getTime()) / 3_600_000;

  if (agent.blocked) return { health: "BLOCKED", hoursSince };
  if (hoursSince == null) return { health: "NEVER", hoursSince };
  if (hoursSince > staleAfterHours) return { health: "STALE", hoursSince };
  if (!(agent.lastEvidenceNote ?? "").trim()) return { health: "NO_EVIDENCE", hoursSince };
  return { health: "FRESH", hoursSince };
}
