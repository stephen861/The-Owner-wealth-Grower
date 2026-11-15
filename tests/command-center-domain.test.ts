// Pure-logic tests for the Command Center prototype. No database, no server.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approvalConsistencyWarnings,
  assessRevenueEligibility,
  checkInHealth,
  classifyLicenseStatus,
  evaluateApprovalGate,
  evaluateReferralTransition,
  feePosition,
  filterByDivision,
  isDivisionFilter,
  jobCostRollup,
  readinessSummary,
  reconcileBySourceId,
  referralStageOrder,
  sumCents,
  REFERRAL_STAGES,
} from "../src/lib/command-center/domain";

// ---------------------------------------------------------------------------
describe("totals", () => {
  it("sums integer cents exactly, with no floating-point drift", () => {
    // 0.1 + 0.2 in dollars would not equal 0.3; in cents it is exact.
    const rows = [{ amountCents: 10 }, { amountCents: 20 }];
    assert.equal(sumCents(rows, (r) => r.amountCents), 30);

    const many = Array.from({ length: 1000 }, () => ({ amountCents: 1 }));
    assert.equal(sumCents(many, (r) => r.amountCents), 1000);
  });

  it("treats null and undefined amounts as zero", () => {
    const rows = [{ a: 500 }, { a: null }, { a: undefined }];
    assert.equal(sumCents(rows, (r) => r.a as number | null | undefined), 500);
  });

  it("sums an empty list to zero", () => {
    assert.equal(sumCents([], (r: { amountCents: number }) => r.amountCents), 0);
  });

  describe("fee position (no hard-coded expected amount)", () => {
    it("uses the per-property expected amount, not a portfolio constant", () => {
      // The source base always subtracted from 650. Two properties with
      // different expected fees must produce different owed amounts.
      const a = feePosition(65_000, 20_000);
      const b = feePosition(120_000, 20_000);
      assert.equal(a.owedCents, 45_000);
      assert.equal(b.owedCents, 100_000);
    });

    it("reports overpayment as an explicit credit, never negative debt", () => {
      const pos = feePosition(65_000, 80_000);
      assert.equal(pos.state, "CREDIT");
      assert.equal(pos.creditCents, 15_000);
      assert.equal(pos.owedCents, 0, "owed must never go negative");
    });

    it("settles exactly when paid matches expected", () => {
      const pos = feePosition(65_000, 65_000);
      assert.equal(pos.state, "SETTLED");
      assert.equal(pos.owedCents, 0);
      assert.equal(pos.creditCents, 0);
    });

    it("flags an unconfigured expected fee instead of implying nothing is owed", () => {
      const pos = feePosition(0, 0);
      assert.equal(pos.state, "NOT_CONFIGURED");
      assert.ok(pos.warnings.some((w) => /no expected fee/i.test(w)));
    });

    it("clamps negative inputs and warns", () => {
      const pos = feePosition(-100, -50);
      assert.equal(pos.owedCents, 0);
      assert.equal(pos.creditCents, 0);
      assert.ok(pos.warnings.some((w) => /negative/i.test(w)));
    });
  });
});

// ---------------------------------------------------------------------------
describe("filtering", () => {
  const rows = [
    { id: "1", division: "FGW" },
    { id: "2", division: "AFLH" },
    { id: "3", division: "FGW" },
  ];

  it("returns everything for ALL", () => {
    assert.equal(filterByDivision(rows, "ALL").length, 3);
  });

  it("narrows to a single division", () => {
    assert.deepEqual(filterByDivision(rows, "FGW").map((r) => r.id), ["1", "3"]);
    assert.deepEqual(filterByDivision(rows, "AFLH").map((r) => r.id), ["2"]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    filterByDivision(rows, "FGW");
    assert.deepEqual(rows, original);
  });

  it("validates the filter value, rejecting anything unexpected", () => {
    assert.ok(isDivisionFilter("ALL"));
    assert.ok(isDivisionFilter("FGW"));
    assert.ok(isDivisionFilter("AFLH"));
    assert.ok(!isDivisionFilter("fgw"), "must be case-exact");
    assert.ok(!isDivisionFilter("OTHER"));
    assert.ok(!isDivisionFilter(undefined));
  });
});

// ---------------------------------------------------------------------------
describe("license status and revenue eligibility (no exact-string gate)", () => {
  it("maps case and spacing variants onto the typed status", () => {
    for (const raw of ["Licensed", "licensed", "  LICENSED  ", "Fully Licensed"]) {
      assert.equal(classifyLicenseStatus(raw).status, "LICENSED", `failed for ${raw}`);
    }
    assert.equal(classifyLicenseStatus("License Pending").status, "PENDING_LICENSE");
  });

  it("marks an unrecognised status as unknown rather than guessing", () => {
    const result = classifyLicenseStatus("Licensed-ish?");
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.recognised, false);
  });

  it("does not silently zero revenue for a spacing variant", () => {
    // The source base compared === "Licensed", so " Licensed " earned nothing.
    const assessment = assessRevenueEligibility({
      licenseStatus: "LICENSED",
      licenseStatusRaw: " Licensed ",
      revenueEligible: true,
    });
    assert.equal(assessment.eligible, true);
    assert.deepEqual(assessment.warnings, [], "a spacing variant must not warn");
  });

  it("warns when the typed status and the stored eligibility flag disagree", () => {
    const assessment = assessRevenueEligibility({
      licenseStatus: "UNLICENSED",
      licenseStatusRaw: "Unlicensed",
      revenueEligible: true,
    });
    assert.ok(
      assessment.warnings.some((w) => /Mismatch/i.test(w) && /review before billing/i.test(w)),
      "expected an eligibility mismatch warning",
    );
  });

  it("warns when the raw source string maps to a different status", () => {
    const assessment = assessRevenueEligibility({
      licenseStatus: "LICENSED",
      licenseStatusRaw: "License Pending",
      revenueEligible: true,
    });
    assert.ok(assessment.warnings.some((w) => /Mismatch/i.test(w)));
  });

  it("warns when the raw source string cannot be mapped at all", () => {
    const assessment = assessRevenueEligibility({
      licenseStatus: "UNKNOWN",
      licenseStatusRaw: "???",
      revenueEligible: false,
    });
    assert.ok(assessment.warnings.some((w) => /could not be mapped/i.test(w)));
  });
});

// ---------------------------------------------------------------------------
describe("readiness", () => {
  it("scores against required items only, and is not ready while any remain", () => {
    const summary = readinessSummary([
      { status: "COMPLETE", required: true },
      { status: "NOT_STARTED", required: true },
      { status: "COMPLETE", required: false },
    ]);
    assert.equal(summary.requiredTotal, 2);
    assert.equal(summary.requiredComplete, 1);
    assert.equal(summary.percent, 50);
    assert.equal(summary.ready, false);
  });

  it("is not ready while an item is blocked, even at 100 percent required", () => {
    const summary = readinessSummary([
      { status: "COMPLETE", required: true },
      { status: "BLOCKED", required: false },
    ]);
    assert.equal(summary.percent, 100);
    assert.equal(summary.blocked, 1);
    assert.equal(summary.ready, false, "a blocked item must prevent readiness");
  });

  it("treats a checklist with no required items as ready", () => {
    const summary = readinessSummary([{ status: "NOT_STARTED", required: false }]);
    assert.equal(summary.percent, 100);
    assert.equal(summary.ready, true);
  });

  it("handles an empty checklist without dividing by zero", () => {
    const summary = readinessSummary([]);
    assert.equal(summary.percent, 100);
    assert.equal(summary.total, 0);
  });
});

// ---------------------------------------------------------------------------
describe("referral pipeline", () => {
  it("exposes exactly the six agreed administrative stages, in order", () => {
    assert.deepEqual(
      REFERRAL_STAGES.map((s) => s.value),
      [
        "RECEIVED",
        "FOLLOW_UP",
        "DOCUMENTS_PENDING",
        "HUMAN_REVIEW",
        "HUMAN_DECISION_RECORDED",
        "MOVE_IN_CHECKLIST",
      ],
    );
    assert.deepEqual(REFERRAL_STAGES.map((s) => s.order), [0, 1, 2, 3, 4, 5]);
  });

  it("advances one stage at a time", () => {
    const referral = { stage: "RECEIVED", blocked: false };
    assert.equal(evaluateReferralTransition(referral, "FOLLOW_UP").allowed, true);
  });

  it("refuses to skip human review", () => {
    const result = evaluateReferralTransition(
      { stage: "DOCUMENTS_PENDING", blocked: false, decisionRecordedBy: "A. Person" },
      "HUMAN_DECISION_RECORDED",
    );
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((b) => /one stage at a time/i.test(b)));
  });

  it("refuses to record a decision without a named person", () => {
    const result = evaluateReferralTransition(
      { stage: "HUMAN_REVIEW", blocked: false, decisionRecordedBy: "   " },
      "HUMAN_DECISION_RECORDED",
    );
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((b) => /name of the person/i.test(b)));
  });

  it("allows a decision stage once a person is named", () => {
    const result = evaluateReferralTransition(
      { stage: "HUMAN_REVIEW", blocked: false, decisionRecordedBy: "A. Person" },
      "HUMAN_DECISION_RECORDED",
    );
    assert.equal(result.allowed, true);
  });

  it("will not advance a blocked referral", () => {
    const result = evaluateReferralTransition(
      { stage: "RECEIVED", blocked: true, blockedReason: "Documents illegible" },
      "FOLLOW_UP",
    );
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.some((b) => /Documents illegible/.test(b)));
  });

  it("permits moving backwards but warns", () => {
    const result = evaluateReferralTransition(
      { stage: "DOCUMENTS_PENDING", blocked: false },
      "FOLLOW_UP",
    );
    assert.equal(result.allowed, true);
    assert.ok(result.warnings.some((w) => /backwards/i.test(w)));
  });

  it("rejects an unknown stage", () => {
    const result = evaluateReferralTransition({ stage: "RECEIVED", blocked: false }, "ADMITTED");
    assert.equal(result.allowed, false);
    assert.equal(referralStageOrder("ADMITTED"), -1);
  });
});

// ---------------------------------------------------------------------------
describe("approval gate", () => {
  const base = {
    state: "PENDING",
    decision: "APPROVE" as const,
    decidedBy: "A. Person",
    decisionNote: "Reviewed and approved.",
    subjectBlocked: false,
    actorIsHuman: true,
  };

  it("allows a clean human approval", () => {
    const gate = evaluateApprovalGate(base);
    assert.equal(gate.allowed, true);
    assert.deepEqual(gate.blockers, []);
  });

  it("refuses approval while the subject is blocked", () => {
    const gate = evaluateApprovalGate({
      ...base,
      subjectBlocked: true,
      subjectBlockedReason: "Inspection outstanding",
    });
    assert.equal(gate.allowed, false);
    assert.ok(gate.blockers.some((b) => /Inspection outstanding/.test(b)));
  });

  it("raises a mismatch warning when the note reads as approval but the subject is blocked", () => {
    // This is the exact contradiction the source base tolerated.
    const gate = evaluateApprovalGate({
      ...base,
      subjectBlocked: true,
      subjectBlockedReason: "Inspection outstanding",
      decisionNote: "All good, approved by phone.",
    });
    assert.equal(gate.allowed, false);
    assert.ok(gate.warnings.some((w) => /Mismatch/i.test(w)));
  });

  it("refuses an approval with no named decider", () => {
    const gate = evaluateApprovalGate({ ...base, decidedBy: "  " });
    assert.equal(gate.allowed, false);
    assert.ok(gate.blockers.some((b) => /name of the person/i.test(b)));
  });

  it("refuses any non-human approval path", () => {
    const gate = evaluateApprovalGate({ ...base, actorIsHuman: false });
    assert.equal(gate.allowed, false);
    assert.ok(gate.blockers.some((b) => /automated approval is not permitted/i.test(b)));
  });

  it("refuses to decide a request twice", () => {
    const gate = evaluateApprovalGate({ ...base, state: "APPROVED" });
    assert.equal(gate.allowed, false);
    assert.ok(gate.blockers.some((b) => /already approved/i.test(b)));
  });

  it("allows rejecting a blocked subject", () => {
    const gate = evaluateApprovalGate({
      ...base,
      decision: "REJECT",
      subjectBlocked: true,
      decisionNote: "Not proceeding this quarter.",
    });
    assert.equal(gate.allowed, true, "a block should not trap a request as undecidable");
  });

  it("nudges for a reason on a bare rejection", () => {
    const gate = evaluateApprovalGate({ ...base, decision: "REJECT", decisionNote: "" });
    assert.equal(gate.allowed, true);
    assert.ok(gate.warnings.some((w) => /audit/i.test(w)));
  });

  describe("consistency sweep over already-decided rows", () => {
    it("flags approved-while-blocked", () => {
      const warnings = approvalConsistencyWarnings({
        state: "APPROVED",
        decisionNote: "Approved.",
        subjectBlocked: true,
      });
      assert.ok(warnings.some((w) => /still blocked/i.test(w)));
    });

    it("flags a pending row whose note claims approval", () => {
      const warnings = approvalConsistencyWarnings({
        state: "PENDING",
        decisionNote: "Signed off last week.",
        subjectBlocked: false,
      });
      assert.ok(warnings.some((w) => /no decision is recorded/i.test(w)));
    });

    it("stays quiet on a consistent row", () => {
      assert.deepEqual(
        approvalConsistencyWarnings({
          state: "APPROVED",
          decisionNote: "Approved.",
          subjectBlocked: false,
        }),
        [],
      );
    });
  });
});

// ---------------------------------------------------------------------------
describe("duplicate source IDs", () => {
  it("keeps the first row and reports later collisions instead of dropping them silently", () => {
    const rows = [
      { division: "FGW", sourceId: "WO-1", title: "first" },
      { division: "FGW", sourceId: "WO-1", title: "second" },
      { division: "FGW", sourceId: "WO-2", title: "third" },
    ];
    const result = reconcileBySourceId(rows);

    assert.equal(result.unique.length, 2);
    assert.equal(result.unique[0].title, "first", "first occurrence wins");
    assert.equal(result.duplicateCount, 1);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].duplicates[0].title, "second");
  });

  it("scopes source IDs by division, so the same ID in FGW and AFLH is not a collision", () => {
    const result = reconcileBySourceId([
      { division: "FGW", sourceId: "WO-1" },
      { division: "AFLH", sourceId: "WO-1" },
    ]);
    assert.equal(result.unique.length, 2);
    assert.equal(result.duplicateCount, 0);
  });

  it("counts every duplicate when a source ID repeats more than twice", () => {
    const result = reconcileBySourceId([
      { division: "FGW", sourceId: "WO-9" },
      { division: "FGW", sourceId: "WO-9" },
      { division: "FGW", sourceId: "WO-9" },
    ]);
    assert.equal(result.unique.length, 1);
    assert.equal(result.duplicateCount, 2);
    assert.equal(result.conflicts[0].duplicates.length, 2);
  });

  it("separates rows with a missing or blank source ID rather than keying them together", () => {
    const result = reconcileBySourceId([
      { division: "FGW", sourceId: "" },
      { division: "FGW", sourceId: "   " },
      { division: "FGW", sourceId: null },
      { division: "FGW" },
    ]);
    assert.equal(result.unidentified.length, 4);
    assert.equal(result.unique.length, 0);
    assert.equal(result.duplicateCount, 0);
  });

  it("ignores surrounding whitespace when comparing source IDs", () => {
    const result = reconcileBySourceId([
      { division: "FGW", sourceId: "WO-1" },
      { division: "FGW", sourceId: " WO-1 " },
    ]);
    assert.equal(result.duplicateCount, 1, "whitespace must not create a second identity");
  });

  it("returns empty structures for an empty import", () => {
    const result = reconcileBySourceId([]);
    assert.deepEqual(result.unique, []);
    assert.deepEqual(result.conflicts, []);
    assert.equal(result.duplicateCount, 0);
  });
});

// ---------------------------------------------------------------------------
describe("job cost rollup (single canonical money relationship)", () => {
  const job = { id: "job-1", quotedCents: 100_000, approvedCents: 120_000 };

  it("counts only money entries pointing at this job, once each", () => {
    const rollup = jobCostRollup(job, [
      { jobId: "job-1", amountCents: 50_000 },
      { jobId: "job-1", amountCents: 25_000 },
      { jobId: "job-2", amountCents: 99_000 },
      { jobId: null, amountCents: 1_000 },
    ]);
    assert.equal(rollup.entryCount, 2);
    assert.equal(rollup.spentCents, 75_000);
    assert.equal(rollup.varianceCents, -45_000);
    assert.equal(rollup.overApproved, false);
  });

  it("flags spend over the approved amount", () => {
    const rollup = jobCostRollup(job, [{ jobId: "job-1", amountCents: 150_000 }]);
    assert.equal(rollup.overApproved, true);
    assert.equal(rollup.varianceCents, 30_000);
    assert.ok(rollup.warnings.some((w) => /exceeds the approved/i.test(w)));
  });

  it("flags spend against a job with nothing approved", () => {
    const rollup = jobCostRollup(
      { id: "job-3", quotedCents: 0, approvedCents: 0 },
      [{ jobId: "job-3", amountCents: 500 }],
    );
    assert.ok(rollup.warnings.some((w) => /nothing approved/i.test(w)));
    assert.equal(rollup.overApproved, false, "unapproved spend is a warning, not a variance");
  });

  it("reports zero spend for a job with no entries", () => {
    const rollup = jobCostRollup(job, []);
    assert.equal(rollup.spentCents, 0);
    assert.equal(rollup.entryCount, 0);
  });
});

// ---------------------------------------------------------------------------
describe("agent check-in health", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  it("reports blocked above everything else", () => {
    const result = checkInHealth(
      { lastCheckInAt: now, lastEvidenceNote: "All good", blocked: true, },
      now,
    );
    assert.equal(result.health, "BLOCKED", "a blocked agent is never reported as fresh");
  });

  it("reports never for an agent that has not checked in", () => {
    assert.equal(checkInHealth({ lastCheckInAt: null, blocked: false }, now).health, "NEVER");
  });

  it("reports stale past the threshold", () => {
    const result = checkInHealth(
      {
        lastCheckInAt: new Date("2026-11-13T12:00:00Z"),
        lastEvidenceNote: "ran",
        blocked: false,
      },
      now,
    );
    assert.equal(result.health, "STALE");
    assert.equal(result.hoursSince, 48);
  });

  it("reports a fresh check-in with no evidence separately from a healthy one", () => {
    assert.equal(
      checkInHealth({ lastCheckInAt: now, lastEvidenceNote: "  ", blocked: false }, now).health,
      "NO_EVIDENCE",
    );
    assert.equal(
      checkInHealth({ lastCheckInAt: now, lastEvidenceNote: "42 rows read", blocked: false }, now)
        .health,
      "FRESH",
    );
  });
});
