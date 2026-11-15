// Tests for the synthetic whiteboard projection adapter.
//
// These prove the guarantees the adapter claims: stable IDs, a sanitized
// allowlist safe for a link-shared surface, versioning, duplicate/stale
// rejection, visibly-failed sync, and no reverse-write path.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as whiteboardModule from "../src/lib/command-center/whiteboard";
import {
  auditProjection,
  buildProjection,
  cardId,
  decideApply,
  describeReverseWritePolicy,
  projectionContentHash,
  projectionForDivision,
  recordFailure,
  sanitizeCard,
  syncStatus,
  PROJECTION_ID,
  WHITEBOARD_ADAPTER_CAPABILITIES,
  WHITEBOARD_TARGETS,
  type ProjectionSnapshot,
  type TargetSyncState,
} from "../src/lib/command-center/whiteboard";

const GENERATED_AT = new Date("2026-11-15T12:00:00Z");

function snapshot(overrides: Partial<ProjectionSnapshot> = {}): ProjectionSnapshot {
  return {
    facilities: [
      {
        sourceId: "AFLH-P-001",
        division: "AFLH",
        licenseStatus: "LICENSED",
        checklistItems: [
          { status: "COMPLETE", required: true },
          { status: "IN_PROGRESS", required: true },
        ],
      },
      {
        sourceId: "AFLH-P-002",
        division: "AFLH",
        licenseStatus: "LICENSED",
        checklistItems: [{ status: "COMPLETE", required: true }],
      },
    ],
    referrals: [
      { division: "AFLH", stage: "RECEIVED", blocked: false },
      { division: "AFLH", stage: "HUMAN_REVIEW", blocked: false },
      { division: "AFLH", stage: "HUMAN_REVIEW", blocked: true },
    ],
    workOrders: [
      { division: "FGW", status: "OPEN", priority: "NORMAL", blocked: false },
      {
        division: "FGW",
        status: "ASSIGNED",
        priority: "EMERGENCY",
        blocked: true,
        blockedReason: "Access not available — tenant contact pending.",
      },
      { division: "FGW", status: "COMPLETE", priority: "NORMAL", blocked: false },
    ],
    jobs: [
      { sourceId: "FGW-J-001", division: "FGW", status: "APPROVED", blocked: false },
      {
        sourceId: "FGW-J-006",
        division: "FGW",
        status: "APPROVED",
        blocked: true,
        blockedReason: "Awaiting permit before work can start.",
      },
    ],
    tasks: [
      { division: "FGW", status: "OPEN" },
      { division: "FGW", status: "BLOCKED" },
      { division: "AFLH", status: "DONE" },
    ],
    agents: [
      {
        agentName: "DEMO Readiness Sweep",
        division: "AFLH",
        lastCheckInAt: new Date("2026-11-15T10:00:00Z"),
        lastEvidenceNote: "Read 49 synthetic rows.",
        blocked: false,
      },
      {
        agentName: "DEMO Referral Notifier",
        division: "AFLH",
        lastCheckInAt: new Date("2026-11-15T06:00:00Z"),
        lastEvidenceNote: "Reported 'all clear'.",
        blocked: true,
        blockedReason: "No connected integration; nothing was actually sent.",
      },
    ],
    approvals: [
      { division: "FGW", state: "PENDING" },
      { division: "FGW", state: "APPROVED" },
      { division: "AFLH", state: "REJECTED" },
    ],
    ...overrides,
  };
}

function build(version = 1, at = GENERATED_AT, snap = snapshot()) {
  return buildProjection(snap, {
    version,
    generatedAt: at,
    sourceDataset: "Demo dataset v1 (synthetic)",
    now: GENERATED_AT,
  });
}

function state(overrides: Partial<TargetSyncState> = {}): TargetSyncState {
  return {
    targetKey: "ai-team-board",
    enabled: true, // tests enable it explicitly; the app never does
    lastAppliedVersion: null,
    lastAppliedContentHash: null,
    lastAppliedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe("adapter capabilities are one-way by construction", () => {
  it("declares no reverse write, no network and no live artifact sync", () => {
    assert.equal(WHITEBOARD_ADAPTER_CAPABILITIES.reverseWrite, false);
    assert.equal(WHITEBOARD_ADAPTER_CAPABILITIES.networkAccess, false);
    assert.equal(WHITEBOARD_ADAPTER_CAPABILITIES.liveArtifactSync, false);
    assert.equal(WHITEBOARD_ADAPTER_CAPABILITIES.autonomousApply, false);
    assert.equal(WHITEBOARD_ADAPTER_CAPABILITIES.outboundProjection, true);
  });

  it("exports no function that writes a board payload back into the app", () => {
    const inbound = Object.keys(whiteboardModule).filter((name) =>
      /(applyFrom|importFrom|writeBack|pullFrom|syncFrom|ingest)/i.test(name),
    );
    assert.deepEqual(inbound, [], `unexpected inbound surface: ${inbound.join(", ")}`);
  });

  it("states the reverse-write policy in words", () => {
    assert.match(describeReverseWritePolicy(), /One-way by construction/);
  });

  it("records target URLs without treating them as reachable", () => {
    assert.equal(WHITEBOARD_TARGETS.length, 2);
    for (const target of WHITEBOARD_TARGETS) {
      assert.match(target.targetUrl, /^https:\/\/claude\.ai\/artifact\//);
      assert.match(target.label, /external/i);
    }
  });
});

// ---------------------------------------------------------------------------
describe("stable IDs", () => {
  it("derives card IDs from source IDs, not database ids", () => {
    assert.equal(cardId("FACILITY_READINESS", "AFLH-P-001"), "CC-FAC-AFLH-P-001");
    assert.equal(cardId("ROLLUP", "FGW"), "CC-ROLL-FGW");
  });

  it("produces identical IDs across independent regenerations", () => {
    const first = build(1).cards.map((c) => c.id);
    const second = build(7, new Date("2027-03-02T09:30:00Z")).cards.map((c) => c.id);
    assert.deepEqual(second, first, "IDs must not move when version or time changes");
  });

  it("keeps IDs unique within a projection", () => {
    const ids = build().cards.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("normalises agent names into safe, stable codes", () => {
    const card = build().cards.find((c) => c.kind === "AGENT_HEALTH")!;
    assert.match(card.id, /^CC-AGENT-[A-Z0-9-]+$/);
    assert.ok(!card.id.includes(" "));
  });

  it("emits a deterministic content hash that ignores version and timestamp", () => {
    const a = build(1, GENERATED_AT);
    const b = build(99, new Date("2028-01-01T00:00:00Z"));
    assert.equal(b.contentHash, a.contentHash, "same content must hash the same");
  });

  it("changes the content hash when the underlying data changes", () => {
    const changed = snapshot();
    changed.workOrders.push({
      division: "FGW",
      status: "OPEN",
      priority: "HIGH",
      blocked: false,
    });
    assert.notEqual(build(1, GENERATED_AT, changed).contentHash, build(1).contentHash);
  });
});

// ---------------------------------------------------------------------------
describe("sanitized allowlist (the target boards are shared by link)", () => {
  it("passes the leak audit on a full projection", () => {
    assert.deepEqual(auditProjection(build()), []);
  });

  it("projects no amounts, names, addresses or contact details", () => {
    const serialized = JSON.stringify(build().cards);
    for (const banned of ["$", "@", "cents", "FICTIONAL", "Way", "Occupant", "DEMO —"]) {
      assert.ok(!serialized.includes(banned), `projection leaked "${banned}"`);
    }
  });

  it("carries only allowlisted keys on every card", () => {
    const allowed = new Set(whiteboardModule.CARD_ALLOWLIST as readonly string[]);
    for (const card of build().cards) {
      for (const key of Object.keys(card)) {
        assert.ok(allowed.has(key), `card ${card.id} carries disallowed key "${key}"`);
      }
    }
  });

  it("drops unknown keys rather than passing them through", () => {
    const card = sanitizeCard({
      id: "CC-ROLL-FGW",
      kind: "ROLLUP",
      division: "FGW",
      code: "FGW-ROLLUP",
      status: "STEADY",
      metrics: [],
      version: 1,
      updatedAt: GENERATED_AT.toISOString(),
      residentName: "Real Person",
      amountCents: 65000,
    });
    assert.ok(!("residentName" in card));
    assert.ok(!("amountCents" in card));
  });

  it("refuses a non-integer metric, so an amount cannot ride along as a count", () => {
    assert.throws(
      () =>
        sanitizeCard({
          id: "x", kind: "ROLLUP", division: "FGW", code: "FGW-ROLLUP",
          status: "STEADY", version: 1, updatedAt: "",
          metrics: [{ key: "feesOwed", value: 650.75 }],
        }),
      /must be an integer count/,
    );
  });

  it("refuses a free-text code or status", () => {
    assert.throws(
      () =>
        sanitizeCard({
          id: "x", kind: "ROLLUP", division: "FGW",
          code: "DEMO — Alder Court", status: "STEADY", metrics: [], version: 1, updatedAt: "",
        }),
      /not an allowed code shape/,
    );
    assert.throws(
      () =>
        sanitizeCard({
          id: "x", kind: "ROLLUP", division: "FGW", code: "FGW-ROLLUP",
          status: "looks fine to me", metrics: [], version: 1, updatedAt: "",
        }),
      /uppercase token/,
    );
  });

  it("reduces an operator's free-text blocked reason to a slug", () => {
    const jobCard = build().cards.find((c) => c.kind === "JOB_STATUS")!;
    assert.equal(jobCard.blockedReasonCode, "AWAITING_PERMIT");
    assert.ok(!JSON.stringify(jobCard).includes("permit before work"));
  });

  it("projects referrals as stage counts only, never one card per referral", () => {
    const cards = build().cards;
    assert.equal(cards.filter((c) => c.kind === "REFERRAL_FUNNEL").length, 1);
    const funnel = cards.find((c) => c.kind === "REFERRAL_FUNNEL")!;
    const metric = (key: string) => funnel.metrics.find((m) => m.key === key)?.value;
    assert.equal(metric("stageReceived"), 1);
    assert.equal(metric("stageHumanReview"), 2);
    assert.equal(metric("blockedReferrals"), 1);
    // No per-referral code or referrer label anywhere in the payload.
    // (Matched precisely: the agent card ID legitimately contains the
    // automation's own name, which is a system label, not a referral.)
    assert.ok(!/DEMO-REF-\d/.test(JSON.stringify(cards)));
    assert.ok(!/referralCode|referrerLabel/i.test(JSON.stringify(cards)));
  });

  it("projects facility codes, not facility names", () => {
    const facility = build().cards.find((c) => c.kind === "FACILITY_READINESS")!;
    assert.equal(facility.code, "AFLH-P-001");
  });

  it("carries honesty notices with the payload", () => {
    const projection = build();
    assert.ok(projection.synthetic);
    assert.ok(projection.notices.some((n) => /SYNTHETIC DEMO DATA ONLY/.test(n)));
    assert.ok(projection.notices.some((n) => /NOT a live sync/i.test(n)));
    assert.ok(
      projection.notices.some((n) => /timestamp records when this payload was built/i.test(n)),
      "a timestamp must not be presented as proof of correctness",
    );
  });
});

// ---------------------------------------------------------------------------
describe("projection content", () => {
  it("reports a blocked agent as BLOCKED even though its note claims all clear", () => {
    const card = build().cards.find((c) => c.id.includes("REFERRAL-NOTIFIER"))!;
    assert.equal(card.status, "BLOCKED");
    assert.equal(card.blocked, true);
    assert.equal(card.blockedReasonCode, "INTEGRATION_NOT_CONNECTED");
  });

  it("rolls division metrics up without crossing divisions", () => {
    const fgw = build().cards.find((c) => c.id === "CC-ROLL-FGW")!;
    const metric = (key: string) => fgw.metrics.find((m) => m.key === key)?.value;
    assert.equal(metric("openWorkOrders"), 2);
    assert.equal(metric("openTasks"), 2);
    assert.equal(metric("pendingApprovals"), 1);
    assert.equal(metric("facilities"), 0, "the demo facilities are all AFLH");
  });

  it("flags an emergency in the work order queue card", () => {
    const card = build().cards.find((c) => c.kind === "WORK_ORDER_QUEUE")!;
    assert.equal(card.status, "EMERGENCY_PRESENT");
    assert.equal(card.blockedReasonCode, "ACCESS_UNAVAILABLE");
  });

  it("filters projected cards by division", () => {
    const projection = build();
    const aflh = projectionForDivision(projection, "AFLH");
    assert.ok(aflh.length > 0);
    assert.ok(aflh.every((c) => c.division === "AFLH" || c.division === "ALL"));
    assert.equal(projectionForDivision(projection, "ALL").length, projection.cards.length);
  });
});

// ---------------------------------------------------------------------------
describe("duplicate and stale rejection", () => {
  it("applies a first projection to an enabled target", () => {
    const decision = decideApply(state(), build(1), GENERATED_AT);
    assert.equal(decision.outcome, "APPLIED");
    assert.equal(decision.nextState.lastAppliedVersion, 1);
    assert.equal(decision.nextState.lastSuccessAt?.toISOString(), GENERATED_AT.toISOString());
  });

  it("rejects a replay of the same version with identical content", () => {
    const projection = build(1);
    const applied = decideApply(state(), projection, GENERATED_AT).nextState;
    const replay = decideApply(applied, projection, new Date("2026-11-15T13:00:00Z"));
    assert.equal(replay.outcome, "REJECTED_DUPLICATE");
    assert.equal(replay.accepted, false);
  });

  it("rejects the same version carrying different content as a conflict", () => {
    const applied = decideApply(state(), build(1), GENERATED_AT).nextState;
    const changed = snapshot();
    changed.tasks.push({ division: "FGW", status: "OPEN" });
    const conflict = decideApply(
      applied,
      build(1, new Date("2026-11-15T14:00:00Z"), changed),
      new Date("2026-11-15T14:00:00Z"),
    );
    assert.equal(conflict.outcome, "REJECTED_VERSION_CONFLICT");
    assert.match(conflict.detail, /Bump the version/);
  });

  it("rejects a lower version than the one already applied", () => {
    const applied = decideApply(state(), build(5), GENERATED_AT).nextState;
    const stale = decideApply(applied, build(4), new Date("2026-11-15T15:00:00Z"));
    assert.equal(stale.outcome, "REJECTED_STALE");
  });

  it("rejects a payload generated before the last successful apply", () => {
    const applied = decideApply(
      state(),
      build(1, new Date("2026-11-15T12:00:00Z")),
      new Date("2026-11-15T12:00:00Z"),
    ).nextState;
    const outOfOrder = decideApply(
      applied,
      build(2, new Date("2026-11-15T09:00:00Z")),
      new Date("2026-11-15T16:00:00Z"),
    );
    assert.equal(outOfOrder.outcome, "REJECTED_STALE");
    assert.match(outOfOrder.detail, /out-of-order/);
  });

  it("accepts a higher version with new content", () => {
    const applied = decideApply(state(), build(1), GENERATED_AT).nextState;
    const changed = snapshot();
    changed.tasks.push({ division: "AFLH", status: "OPEN" });
    const next = decideApply(
      applied,
      build(2, new Date("2026-11-15T17:00:00Z"), changed),
      new Date("2026-11-15T17:00:00Z"),
    );
    assert.equal(next.outcome, "APPLIED");
    assert.equal(next.nextState.lastAppliedVersion, 2);
  });

  it("rejects a payload for a different projection id", () => {
    const decision = decideApply(
      state(),
      { ...build(1), projectionId: "some-other-projection" },
      GENERATED_AT,
    );
    assert.equal(decision.outcome, "REJECTED_UNKNOWN_TARGET");
  });

  it("rejects apply to an unregistered target", () => {
    assert.equal(decideApply(null, build(1), GENERATED_AT).outcome, "REJECTED_UNKNOWN_TARGET");
  });

  it("rejects apply while the target is disabled, which is the app's default", () => {
    const decision = decideApply(state({ enabled: false }), build(1), GENERATED_AT);
    assert.equal(decision.outcome, "REJECTED_DISABLED");
    assert.match(decision.detail, /a person applies the payload/i);
  });

  it("does not count a rejection as a transport failure", () => {
    const applied = decideApply(state(), build(1), GENERATED_AT).nextState;
    const replay = decideApply(applied, build(1), new Date("2026-11-15T18:00:00Z"));
    assert.equal(replay.nextState.consecutiveFailures, 0);
    assert.equal(
      replay.nextState.lastSuccessAt?.toISOString(),
      applied.lastSuccessAt?.toISOString(),
    );
  });
});

// ---------------------------------------------------------------------------
describe("a failed sync stays visibly failed", () => {
  const T0 = new Date("2026-11-15T08:00:00Z");
  const T1 = new Date("2026-11-15T09:00:00Z");
  const NOW = new Date("2026-11-15T10:00:00Z");

  it("reports NEVER_ATTEMPTED before anything has run", () => {
    const status = syncStatus(state(), NOW);
    assert.equal(status.health, "NEVER_ATTEMPTED");
    assert.equal(status.healthy, false);
  });

  it("reports FAILED when no success has ever been recorded", () => {
    const failed = recordFailure(state(), "Target not reachable from prototype", T1);
    const status = syncStatus(failed, NOW);
    assert.equal(status.health, "FAILED");
    assert.equal(status.healthy, false);
    assert.equal(status.consecutiveFailures, 1);
    assert.equal(status.lastError, "Target not reachable from prototype");
  });

  it("does not let an earlier success mask a later failure", () => {
    const applied = decideApply(state(), build(1, T0), T0).nextState;
    assert.equal(syncStatus(applied, NOW).health, "OK");

    const failed = recordFailure(applied, "Apply step aborted", T1);
    const status = syncStatus(failed, NOW);
    assert.equal(status.health, "SUCCEEDED_THEN_FAILED");
    assert.equal(status.healthy, false);
    assert.match(status.label, /FAILING/);
    assert.equal(
      status.lastSuccessAt?.toISOString(),
      T0.toISOString(),
      "the earlier success is still recorded, but no longer the current state",
    );
  });

  it("accumulates consecutive failures and clears them only on a real success", () => {
    let s = recordFailure(state(), "first", new Date("2026-11-15T08:10:00Z"));
    s = recordFailure(s, "second", new Date("2026-11-15T08:20:00Z"));
    s = recordFailure(s, "third", new Date("2026-11-15T08:30:00Z"));
    assert.equal(syncStatus(s, NOW).consecutiveFailures, 3);

    const recovered = decideApply({ ...s }, build(1, T1), T1).nextState;
    assert.equal(recovered.consecutiveFailures, 0);
    assert.equal(syncStatus(recovered, NOW).health, "OK");
  });

  it("reports a stale success rather than a healthy one when the cadence lapses", () => {
    const applied = decideApply(
      state(),
      build(1, new Date("2026-11-13T08:00:00Z")),
      new Date("2026-11-13T08:00:00Z"),
    ).nextState;
    const status = syncStatus(applied, NOW);
    assert.equal(status.health, "STALE_SUCCESS");
    assert.equal(status.healthy, false);
    assert.ok((status.hoursSinceSuccess ?? 0) > 26);
  });

  it("never claims the payload was verified, whatever the timestamps say", () => {
    const applied = decideApply(state(), build(1, T1), T1).nextState;
    const status = syncStatus(applied, NOW);
    assert.equal(status.health, "OK");
    assert.equal(
      status.verified,
      false,
      "a successful apply is not evidence the board rendered it correctly",
    );
  });
});

// ---------------------------------------------------------------------------
describe("demonstration: a status change flows into a new projection", () => {
  it("moves a facility from IN_PROGRESS to READY and bumps the applied version", () => {
    // 1. Baseline: facility AFLH-P-001 has an outstanding required item.
    const beforeSnap = snapshot();
    const before = build(1, new Date("2026-11-15T12:00:00Z"), beforeSnap);
    const facilityBefore = before.cards.find((c) => c.id === "CC-FAC-AFLH-P-001")!;
    assert.equal(facilityBefore.status, "IN_PROGRESS");
    assert.equal(
      facilityBefore.metrics.find((m) => m.key === "requiredOutstanding")?.value,
      1,
    );

    const applied = decideApply(state(), before, new Date("2026-11-15T12:00:00Z")).nextState;
    assert.equal(applied.lastAppliedVersion, 1);

    // 2. A synthetic command-center change: the outstanding item completes.
    const afterSnap = snapshot();
    afterSnap.facilities[0].checklistItems = [
      { status: "COMPLETE", required: true },
      { status: "COMPLETE", required: true },
    ];
    const after = build(2, new Date("2026-11-15T13:00:00Z"), afterSnap);

    // 3. The projection reflects it, under the SAME stable card ID.
    const facilityAfter = after.cards.find((c) => c.id === "CC-FAC-AFLH-P-001")!;
    assert.equal(facilityAfter.status, "READY");
    assert.equal(facilityAfter.metrics.find((m) => m.key === "requiredOutstanding")?.value, 0);
    assert.equal(facilityAfter.metrics.find((m) => m.key === "percentComplete")?.value, 100);
    assert.notEqual(after.contentHash, before.contentHash);

    // 4. The new version applies; the old one is then stale.
    const second = decideApply(applied, after, new Date("2026-11-15T13:00:00Z"));
    assert.equal(second.outcome, "APPLIED");
    assert.equal(second.nextState.lastAppliedVersion, 2);
    assert.equal(
      decideApply(second.nextState, before, new Date("2026-11-15T14:00:00Z")).outcome,
      "REJECTED_STALE",
    );

    // 5. Still safe to publish after the change.
    assert.deepEqual(auditProjection(after), []);
  });

  it("gives a renamed agent a new card ID, leaving the old card orphaned", () => {
    // Documented limitation, asserted rather than hidden: card IDs are
    // derived from the agent's name, so renaming an automation produces a new
    // card. Whoever applies the projection must remove the superseded card —
    // which is exactly how stale agent names survive on a board.
    const renamed = snapshot();
    renamed.agents = [{ ...renamed.agents[0], agentName: "DEMO Readiness Sweep v2" }];

    const beforeIds = build(1).cards.filter((c) => c.kind === "AGENT_HEALTH").map((c) => c.id);
    const afterIds = build(2, GENERATED_AT, renamed)
      .cards.filter((c) => c.kind === "AGENT_HEALTH")
      .map((c) => c.id);

    assert.ok(beforeIds.includes("CC-AGENT-AFLH-DEMO-READINESS-SWEEP"));
    assert.ok(afterIds.includes("CC-AGENT-AFLH-DEMO-READINESS-SWEEP-V2"));
    assert.ok(
      !afterIds.includes("CC-AGENT-AFLH-DEMO-READINESS-SWEEP"),
      "the old ID is absent from the new projection, so it must be pruned on apply",
    );
  });

  it("keeps the projection id fixed across the whole flow", () => {
    assert.equal(build(1).projectionId, PROJECTION_ID);
    assert.equal(build(2).projectionId, PROJECTION_ID);
  });

  it("hashes identical regenerated content to the same value, so a no-op is detectable", () => {
    const snap = snapshot();
    const a = build(3, new Date("2026-11-15T12:00:00Z"), snap);
    const b = build(4, new Date("2026-11-16T12:00:00Z"), snap);
    assert.equal(a.contentHash, b.contentHash);
    assert.equal(projectionContentHash(a.cards), projectionContentHash(b.cards));
  });
});
