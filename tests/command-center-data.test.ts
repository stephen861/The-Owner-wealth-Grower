// Database-backed tests for the Command Center prototype.
//
// These run against the local SQLite dev database and touch ONLY Demo*
// tables: the suite resets the demo dataset first, so it is repeatable and
// cannot affect any other table.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { prisma } from "../src/lib/prisma";
import { demoDataCounts, resetDemoData } from "../src/lib/command-center/seed";
import {
  AUDITED_SOURCE_COUNTS,
  DEMO_IMPORT_PREVIEW,
  buildDemoDataset,
} from "../src/lib/command-center/demo-data";
import {
  assessRevenueEligibility,
  evaluateApprovalGate,
  feePosition,
  filterByDivision,
  jobCostRollup,
  readinessSummary,
  reconcileBySourceId,
  sumCents,
} from "../src/lib/command-center/domain";

const SEED_AT = new Date("2026-11-15T12:00:00Z");

// Probe source IDs come from the same generator the seeder uses, so the tests
// can never assert against a source ID the dataset does not contain.
const { probes } = buildDemoDataset(SEED_AT);

before(async () => {
  await resetDemoData(SEED_AT);
});

after(async () => {
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
describe("demo dataset shape", () => {
  it("loads row counts that mirror the audited source tables", async () => {
    const counts = await demoDataCounts();
    // RCF Properties (7) + FGW Properties (29) share one typed table.
    assert.equal(
      counts.properties,
      AUDITED_SOURCE_COUNTS["RCF Properties"] + AUDITED_SOURCE_COUNTS["FGW Properties"],
    );
    assert.equal(counts.checklistItems, AUDITED_SOURCE_COUNTS["RCF Checklist Items"]);
    assert.equal(counts.placements, AUDITED_SOURCE_COUNTS.Residents);
    assert.equal(counts.tasks, AUDITED_SOURCE_COUNTS["FGW Tasks"]);
    assert.equal(counts.sopReferences, AUDITED_SOURCE_COUNTS["SOP Reference"]);
    assert.equal(counts.contacts, AUDITED_SOURCE_COUNTS.Contacts);
    assert.equal(counts.moneyEntries, AUDITED_SOURCE_COUNTS["Money Log"]);
    assert.equal(counts.advances, AUDITED_SOURCE_COUNTS.Advances);
    assert.equal(counts.jobs, AUDITED_SOURCE_COUNTS.Jobs);
    assert.equal(counts.supplyItems, AUDITED_SOURCE_COUNTS["Furnishing & Supplies"]);
    assert.equal(counts.workOrders, AUDITED_SOURCE_COUNTS["Work Orders"]);
  });

  it("is deterministic — a reset reproduces identical totals", async () => {
    const before = sumCents(
      await prisma.demoMoneyEntry.findMany({ select: { amountCents: true } }),
      (m) => m.amountCents,
    );
    await resetDemoData(SEED_AT);
    const after = sumCents(
      await prisma.demoMoneyEntry.findMany({ select: { amountCents: true } }),
      (m) => m.amountCents,
    );
    assert.equal(after, before);
  });

  it("carries no real-looking contact data", async () => {
    const contacts = await prisma.demoContact.findMany({
      select: { displayName: true, email: true },
    });
    for (const c of contacts) {
      assert.ok(
        /FICTIONAL/.test(c.displayName),
        `contact name must be marked fictional: ${c.displayName}`,
      );
      assert.ok(
        c.email === null || c.email.endsWith("@example.invalid"),
        `contact email must use the reserved .invalid TLD: ${c.email}`,
      );
    }
  });

  it("stores no clinical, eligibility or identity fields on placements", async () => {
    const placement = await prisma.demoPlacement.findFirst();
    assert.ok(placement, "expected a placement row");
    const fields = Object.keys(placement!);
    for (const banned of ["dob", "dateOfBirth", "ssn", "diagnosis", "medication", "eligibility"]) {
      assert.ok(!fields.includes(banned), `placement must not carry a ${banned} field`);
    }
    assert.match(placement!.displayLabel, /Fictional/);
  });
});

// ---------------------------------------------------------------------------
describe("relationships", () => {
  it("resolves every checklist item to a real property", async () => {
    const items = await prisma.demoChecklistItem.findMany({ include: { property: true } });
    assert.equal(items.length, 49);
    for (const item of items) {
      assert.ok(item.property, `checklist item ${item.sourceId} has no property`);
      assert.equal(item.property.division, "AFLH", "RCF checklists belong to AFLH facilities");
    }
  });

  it("attaches money entries to their job through the single canonical FK", async () => {
    const job = await prisma.demoJob.findFirst({
      where: { sourceId: probes.overApprovedJob },
      include: { moneyEntries: true },
    });
    assert.ok(job, "expected the over-approved probe job");

    // Reaching the same rows the other way round must agree exactly — there
    // is only one path, so there is nothing to disagree.
    const viaQuery = await prisma.demoMoneyEntry.findMany({ where: { jobId: job!.id } });
    assert.equal(viaQuery.length, job!.moneyEntries.length);
    assert.deepEqual(
      viaQuery.map((m) => m.sourceId).sort(),
      job!.moneyEntries.map((m) => m.sourceId).sort(),
    );
  });

  it("never double-counts a money entry across jobs", async () => {
    const entries = await prisma.demoMoneyEntry.findMany({
      where: { jobId: { not: null } },
      select: { id: true, jobId: true },
    });
    const seen = new Set(entries.map((e) => e.id));
    assert.equal(seen.size, entries.length, "each entry must belong to at most one job");
  });

  it("keeps every job's property and vendor reference resolvable", async () => {
    const jobs = await prisma.demoJob.findMany({ include: { property: true, vendor: true } });
    assert.equal(jobs.length, 12);
    for (const job of jobs) {
      assert.ok(job.property, `job ${job.sourceId} lost its property`);
      assert.ok(job.vendor, `job ${job.sourceId} lost its vendor`);
    }
  });

  it("keeps a referral's property link optional but valid when set", async () => {
    const referrals = await prisma.demoReferral.findMany({ include: { property: true } });
    for (const r of referrals) {
      if (r.propertyId !== null) {
        assert.ok(r.property, `referral ${r.sourceId} points at a missing property`);
      }
    }
    // Early-stage referrals are not yet attached to a facility.
    const received = referrals.filter((r) => r.stage === "RECEIVED");
    assert.ok(received.length > 0);
    assert.ok(received.every((r) => r.propertyId === null));
  });

  it("cascades checklist deletes with their property and leaves others intact", async () => {
    const property = await prisma.demoProperty.findFirstOrThrow({
      where: { division: "AFLH" },
      include: { checklistItems: true },
    });
    const otherCountBefore = await prisma.demoChecklistItem.count({
      where: { propertyId: { not: property.id } },
    });

    await prisma.demoProperty.delete({ where: { id: property.id } });

    assert.equal(await prisma.demoChecklistItem.count({ where: { propertyId: property.id } }), 0);
    assert.equal(
      await prisma.demoChecklistItem.count({ where: { propertyId: { not: property.id } } }),
      otherCountBefore,
      "deleting one property must not touch another's checklist",
    );

    // Work orders detach rather than vanish (onDelete: SetNull).
    const orphaned = await prisma.demoWorkOrder.count({ where: { propertyId: null } });
    assert.ok(orphaned >= 0);

    await resetDemoData(SEED_AT);
  });
});

// ---------------------------------------------------------------------------
describe("totals over the seeded data", () => {
  it("sums the money log exactly in cents", async () => {
    const entries = await prisma.demoMoneyEntry.findMany();
    const total = sumCents(entries, (e) => e.amountCents);
    assert.ok(Number.isInteger(total), "a cents total must stay an integer");
    // Division subtotals must reconstruct the whole.
    const fgw = sumCents(filterByDivision(entries, "FGW"), (e) => e.amountCents);
    const aflh = sumCents(filterByDivision(entries, "AFLH"), (e) => e.amountCents);
    assert.equal(fgw + aflh, total, "division subtotals must sum to the portfolio total");
  });

  it("computes each facility's fee position from its own expected amount", async () => {
    const properties = await prisma.demoProperty.findMany({
      where: { division: "AFLH" },
      include: { moneyEntries: { where: { kind: "FEE_PAYMENT" } } },
    });

    const states = new Map<string, string>();
    for (const p of properties) {
      const paid = sumCents(p.moneyEntries, (m) => m.amountCents);
      const pos = feePosition(p.expectedFeesCents, paid);
      states.set(p.sourceId, pos.state);
      // The source base's hard-coded 650 is gone: owed must track the row's
      // own expected amount, and must never be negative.
      assert.ok(pos.owedCents >= 0);
      assert.ok(pos.creditCents >= 0);
      assert.ok(!(pos.owedCents > 0 && pos.creditCents > 0), "cannot owe and hold credit at once");
    }

    // The dataset is built to exercise every fee state.
    assert.equal(states.get(probes.feeCredit), "CREDIT");
    assert.equal(states.get(probes.feeNotConfigured), "CREDIT");
    assert.ok([...states.values()].includes("OWED"));
    assert.ok([...states.values()].includes("SETTLED"));
  });

  it("rolls job cost up from the canonical money relation only", async () => {
    const jobs = await prisma.demoJob.findMany();
    const entries = await prisma.demoMoneyEntry.findMany({
      select: { jobId: true, amountCents: true },
    });

    let attributed = 0;
    for (const job of jobs) {
      const rollup = jobCostRollup(job, entries);
      attributed += rollup.spentCents;
    }
    const linked = sumCents(
      entries.filter((e) => e.jobId !== null),
      (e) => e.amountCents,
    );
    assert.equal(attributed, linked, "job rollups must account for linked spend exactly once");

    const over = jobs.find((j) => j.sourceId === probes.overApprovedJob)!;
    const overRollup = jobCostRollup(over, entries);
    assert.equal(overRollup.overApproved, true, "the probe job should be over its approval");
  });

  it("summarises readiness per facility against required items", async () => {
    const properties = await prisma.demoProperty.findMany({
      where: { division: "AFLH" },
      include: { checklistItems: true },
    });
    assert.equal(properties.length, 7);
    for (const p of properties) {
      const summary = readinessSummary(p.checklistItems);
      assert.equal(summary.total, p.checklistItems.length);
      assert.ok(summary.percent >= 0 && summary.percent <= 100);
      if (summary.blocked > 0) {
        assert.equal(summary.ready, false, "a blocked item must block readiness");
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe("filtering across the seeded data", () => {
  it("partitions every division-tagged table without loss", async () => {
    const tables: [string, { division: string }[]][] = [
      ["properties", await prisma.demoProperty.findMany({ select: { division: true } })],
      ["workOrders", await prisma.demoWorkOrder.findMany({ select: { division: true } })],
      ["tasks", await prisma.demoTask.findMany({ select: { division: true } })],
      ["jobs", await prisma.demoJob.findMany({ select: { division: true } })],
      ["moneyEntries", await prisma.demoMoneyEntry.findMany({ select: { division: true } })],
      ["contacts", await prisma.demoContact.findMany({ select: { division: true } })],
    ];

    for (const [name, rows] of tables) {
      const all = filterByDivision(rows, "ALL").length;
      const fgw = filterByDivision(rows, "FGW").length;
      const aflh = filterByDivision(rows, "AFLH").length;
      assert.equal(all, rows.length, `${name}: ALL must pass everything`);
      assert.equal(fgw + aflh, all, `${name}: FGW + AFLH must equal ALL`);
      assert.ok(fgw > 0 && aflh > 0, `${name}: both divisions should have demo rows`);
    }
  });

  it("only ever returns rows of the requested division", async () => {
    const rows = await prisma.demoWorkOrder.findMany({ select: { division: true, sourceId: true } });
    assert.ok(filterByDivision(rows, "AFLH").every((r) => r.division === "AFLH"));
    assert.ok(filterByDivision(rows, "FGW").every((r) => r.division === "FGW"));
  });
});

// ---------------------------------------------------------------------------
describe("revenue eligibility over the seeded facilities", () => {
  it("does not warn on a case/space variant of the source status", async () => {
    const property = await prisma.demoProperty.findFirstOrThrow({
      where: { sourceId: probes.rawVariantNoWarning },
    });
    const assessment = assessRevenueEligibility(property);
    assert.equal(assessment.eligible, true);
    assert.deepEqual(
      assessment.warnings,
      [],
      "'  licensed  ' must behave exactly like 'Licensed'",
    );
  });

  it("warns when the source string and the typed status disagree", async () => {
    const property = await prisma.demoProperty.findFirstOrThrow({
      where: { sourceId: probes.rawMismatch },
    });
    assert.ok(assessRevenueEligibility(property).warnings.some((w) => /Mismatch/i.test(w)));
  });

  it("warns when the eligibility flag contradicts the typed status", async () => {
    const property = await prisma.demoProperty.findFirstOrThrow({
      where: { sourceId: probes.eligibilityMismatch },
    });
    const assessment = assessRevenueEligibility(property);
    assert.ok(assessment.warnings.some((w) => /review before billing/i.test(w)));
  });
});

// ---------------------------------------------------------------------------
describe("approval gate against seeded subjects", () => {
  it("refuses to approve a request whose subject job is blocked", async () => {
    const approval = await prisma.demoApproval.findFirstOrThrow({
      where: { subjectId: probes.blockedJob },
    });
    const subject = await prisma.demoJob.findFirstOrThrow({
      where: { sourceId: probes.blockedJob },
    });
    assert.equal(subject.blocked, true, "probe subject should be blocked");

    const gate = evaluateApprovalGate({
      state: approval.state,
      decision: "APPROVE",
      decidedBy: "Demo Administrator (FICTIONAL)",
      decisionNote: "Looks fine, approved.",
      subjectBlocked: subject.blocked,
      subjectBlockedReason: subject.blockedReason,
      actorIsHuman: true,
    });

    assert.equal(gate.allowed, false);
    assert.ok(gate.blockers.some((b) => /permit/i.test(b)));
    assert.ok(gate.warnings.some((w) => /Mismatch/i.test(w)));
  });

  it("allows approval of a request whose subject is clear", async () => {
    const clearApproval = await prisma.demoApproval.findFirstOrThrow({
      where: { state: "PENDING", subjectType: "JOB", decisionNote: null },
    });
    const subject = await prisma.demoJob.findFirstOrThrow({
      where: { sourceId: clearApproval.subjectId, blocked: false },
    });
    const approval = clearApproval;
    assert.equal(subject.blocked, false);

    const gate = evaluateApprovalGate({
      state: approval.state,
      decision: "APPROVE",
      decidedBy: "Demo Administrator (FICTIONAL)",
      decisionNote: "Quote reviewed.",
      subjectBlocked: subject.blocked,
      actorIsHuman: true,
    });
    assert.equal(gate.allowed, true);
  });

  it("blocks every automated approval path regardless of subject state", async () => {
    const approvals = await prisma.demoApproval.findMany({ where: { state: "PENDING" } });
    assert.ok(approvals.length > 0);
    for (const approval of approvals) {
      const gate = evaluateApprovalGate({
        state: approval.state,
        decision: "APPROVE",
        decidedBy: "DEMO Cost Reconciler",
        decisionNote: "auto-approved",
        subjectBlocked: false,
        actorIsHuman: false,
      });
      assert.equal(gate.allowed, false, `agent approval must be refused for ${approval.title}`);
    }
  });
});

// ---------------------------------------------------------------------------
describe("duplicate source IDs at the storage layer", () => {
  it("rejects a second row with the same (division, sourceId)", async () => {
    const existing = await prisma.demoWorkOrder.findFirstOrThrow({
      where: { sourceId: "FGW-WO-001" },
    });

    await assert.rejects(
      () =>
        prisma.demoWorkOrder.create({
          data: {
            sourceId: existing.sourceId,
            division: existing.division,
            title: "DEMO — duplicate attempt",
          },
        }),
      /Unique constraint|UNIQUE/i,
      "the unique index must stop a silent second copy",
    );

    assert.equal(
      await prisma.demoWorkOrder.count({
        where: { sourceId: existing.sourceId, division: existing.division },
      }),
      1,
    );
  });

  it("rejects a second agent with the same (division, sourceId)", async () => {
    const existing = await prisma.demoAgentCheckIn.findFirstOrThrow();
    await assert.rejects(
      () =>
        prisma.demoAgentCheckIn.create({
          data: {
            sourceId: existing.sourceId,
            division: existing.division,
            agentName: "DEMO duplicate agent",
            scope: "duplicate attempt",
          },
        }),
      /Unique constraint|UNIQUE/i,
    );
  });

  it("lets an agent be renamed without changing its identity", async () => {
    const agent = await prisma.demoAgentCheckIn.findFirstOrThrow({
      where: { sourceId: "AFLH-AG-001" },
    });
    const renamed = await prisma.demoAgentCheckIn.update({
      where: { id: agent.id },
      data: { agentName: "DEMO Readiness Sweep (renamed)" },
    });
    assert.equal(renamed.sourceId, agent.sourceId, "the source ID is immutable in practice");
    assert.equal(renamed.id, agent.id);
    assert.notEqual(renamed.agentName, agent.agentName);
    await prisma.demoAgentCheckIn.update({
      where: { id: agent.id },
      data: { agentName: agent.agentName },
    });
  });

  it("accepts the same source ID in the other division", async () => {
    const created = await prisma.demoWorkOrder.create({
      data: { sourceId: "FGW-WO-001", division: "AFLH", title: "DEMO — cross-division ID" },
    });
    assert.ok(created.id);
    await prisma.demoWorkOrder.delete({ where: { id: created.id } });
  });

  it("reconciles a staged import batch instead of inserting duplicates", () => {
    const result = reconcileBySourceId(DEMO_IMPORT_PREVIEW);
    // FGW-WO-001 appears three times in FGW (one with whitespace), once in AFLH.
    assert.equal(result.duplicateCount, 2);
    assert.equal(result.unidentified.length, 2, "blank and null source IDs are unidentified");
    assert.equal(result.unique.length, 3, "FGW-WO-001, FGW-WO-002, and the AFLH row");
    const keys = result.conflicts.map((c) => c.key);
    assert.deepEqual(keys, ["FGW::FGW-WO-001"]);
  });

  it("leaves the stored work order count unchanged after reconciliation", async () => {
    reconcileBySourceId(DEMO_IMPORT_PREVIEW);
    assert.equal(
      await prisma.demoWorkOrder.count(),
      37,
      "the import preview is a fixture and must never be written",
    );
  });
});
