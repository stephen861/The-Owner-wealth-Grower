// End-to-end demonstration, against the local database only.
//
//   1. apply a projection to the LOCAL board          -> APPLIED v1
//   2. replay the same version                        -> REJECTED_DUPLICATE
//   3. change a synthetic command-center status
//   4. apply again                                    -> APPLIED v2, new hash
//   5. re-apply the superseded payload                -> REJECTED_STALE
//   6. simulate a transport failure                   -> stays visibly FAILED
//
// No external board is contacted at any point.
import { prisma } from "../src/lib/prisma";
import { resetDemoData } from "../src/lib/command-center/seed";
import { DEMO_DATASET_NAME } from "../src/lib/command-center/demo-data";
import {
  auditProjection,
  buildProjection,
  decideApply,
  recordFailure,
  syncStatus,
  type ProjectionSnapshot,
  type TargetSyncState,
} from "../src/lib/command-center/whiteboard";

async function loadSnapshot(): Promise<ProjectionSnapshot> {
  const [facilities, referrals, workOrders, jobs, tasks, agents, approvals] =
    await Promise.all([
      prisma.demoProperty.findMany({
        include: { checklistItems: { select: { status: true, required: true } } },
      }),
      prisma.demoReferral.findMany({ select: { division: true, stage: true, blocked: true } }),
      prisma.demoWorkOrder.findMany({
        select: { division: true, status: true, priority: true, blocked: true, blockedReason: true },
      }),
      prisma.demoJob.findMany({
        select: { sourceId: true, division: true, status: true, blocked: true, blockedReason: true },
      }),
      prisma.demoTask.findMany({ select: { division: true, status: true } }),
      prisma.demoAgentCheckIn.findMany(),
      prisma.demoApproval.findMany({ select: { division: true, state: true } }),
    ]);
  return {
    facilities: facilities.map((f) => ({
      sourceId: f.sourceId,
      division: f.division,
      licenseStatus: f.licenseStatus,
      checklistItems: f.checklistItems,
    })),
    referrals,
    workOrders,
    jobs,
    tasks,
    agents: agents.map((a) => ({
      agentName: a.agentName,
      division: a.division,
      lastCheckInAt: a.lastCheckInAt,
      lastEvidenceNote: a.lastEvidenceNote,
      blocked: a.blocked,
      blockedReason: a.blockedReason,
    })),
    approvals,
  };
}

async function project(version: number, at: Date) {
  return buildProjection(await loadSnapshot(), {
    version,
    generatedAt: at,
    sourceDataset: DEMO_DATASET_NAME,
    now: at,
  });
}

const line = (s = "") => console.log(s);
const step = (n: number, t: string) => line(`\n── ${n}. ${t} ${"─".repeat(Math.max(0, 54 - t.length))}`);

async function main() {
  await resetDemoData();
  line("Local-only whiteboard projection demonstration");
  line("No external board is contacted. Target: local://command-center/whiteboard");

  let state: TargetSyncState = {
    targetKey: "local-projection",
    enabled: true, // local render only
    lastAppliedVersion: null,
    lastAppliedContentHash: null,
    lastAppliedAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastError: null,
    consecutiveFailures: 0,
  };

  // Pick a facility that still has an outstanding required item.
  const facility = await prisma.demoProperty.findFirstOrThrow({
    where: { division: "AFLH", checklistItems: { some: { status: { not: "COMPLETE" } } } },
    include: { checklistItems: true },
  });

  step(1, "Apply v1 to the local projection");
  const t1 = new Date("2026-11-15T09:00:00Z");
  const v1 = await project(1, t1);
  const card1 = v1.cards.find((c) => c.id === `CC-FAC-${facility.sourceId}`)!;
  line(`   facility card      ${card1.id}`);
  line(`   status             ${card1.status}`);
  line(`   requiredOutstanding ${card1.metrics.find((m) => m.key === "requiredOutstanding")?.value}`);
  line(`   leak audit         ${auditProjection(v1).length === 0 ? "CLEAN" : "FAILED"}`);
  const d1 = decideApply(state, v1, t1);
  state = d1.nextState;
  line(`   outcome            ${d1.outcome}  (hash ${v1.contentHash.slice(0, 12)}…)`);
  line(`   sync status        ${syncStatus(state, t1).health}`);

  step(2, "Replay the SAME version — must be rejected as a duplicate");
  const replay = decideApply(state, v1, new Date("2026-11-15T09:05:00Z"));
  line(`   outcome            ${replay.outcome}`);
  line(`   detail             ${replay.detail}`);
  line(`   failures counted   ${replay.nextState.consecutiveFailures} (a rejection is not a failure)`);

  step(3, "Change a synthetic command-center status");
  const outstanding = facility.checklistItems.filter((i) => i.status !== "COMPLETE");
  for (const item of outstanding) {
    await prisma.demoChecklistItem.update({
      where: { id: item.id },
      data: { status: "COMPLETE", completedAt: new Date(), blockedReason: null,
              evidenceNote: "Completed during the demonstration." },
    });
  }
  line(`   completed ${outstanding.length} checklist item(s) on ${facility.sourceId}`);

  step(4, "Apply v2 — the projection reflects the change");
  const t2 = new Date("2026-11-15T10:00:00Z");
  const v2 = await project(2, t2);
  const card2 = v2.cards.find((c) => c.id === `CC-FAC-${facility.sourceId}`)!;
  line(`   facility card      ${card2.id}   (same stable ID)`);
  line(`   status             ${card1.status} -> ${card2.status}`);
  line(`   requiredOutstanding ${card2.metrics.find((m) => m.key === "requiredOutstanding")?.value}`);
  line(`   percentComplete    ${card2.metrics.find((m) => m.key === "percentComplete")?.value}`);
  line(`   content hash       ${v1.contentHash.slice(0, 12)}… -> ${v2.contentHash.slice(0, 12)}…`);
  line(`   leak audit         ${auditProjection(v2).length === 0 ? "CLEAN" : "FAILED"}`);
  const d2 = decideApply(state, v2, t2);
  state = d2.nextState;
  line(`   outcome            ${d2.outcome}`);
  line(`   sync status        ${syncStatus(state, t2).health}`);

  step(5, "Re-apply the superseded v1 — must be rejected as stale");
  const stale = decideApply(state, v1, new Date("2026-11-15T10:05:00Z"));
  line(`   outcome            ${stale.outcome}`);
  line(`   detail             ${stale.detail}`);

  step(6, "Simulate a transport failure — must stay visibly failed");
  const t3 = new Date("2026-11-15T11:00:00Z");
  state = recordFailure(state, "Simulated apply failure (demonstration).", t3);
  const after = syncStatus(state, new Date("2026-11-15T11:30:00Z"));
  line(`   health             ${after.health}`);
  line(`   label              ${after.label}`);
  line(`   healthy            ${after.healthy}`);
  line(`   verified           ${after.verified}  (never claimed, whatever the timestamps say)`);
  line(`   last success       ${state.lastSuccessAt?.toISOString()} (still on record)`);
  line(`   last error         ${state.lastError}`);
  line(`   consecutive fails  ${state.consecutiveFailures}`);

  line("\n── Result ──────────────────────────────────────────────────");
  line("   A status change produced an updated projection under the same");
  line("   stable card ID; duplicate and stale payloads were rejected; and");
  line("   an earlier success did not mask the later failure.");
  line("   Nothing left this machine.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
