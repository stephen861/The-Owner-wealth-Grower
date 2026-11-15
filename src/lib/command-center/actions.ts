"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { str } from "@/lib/form";
import {
  evaluateApprovalGate,
  evaluateReferralTransition,
} from "./domain";
import { DEMO_DATASET_NAME } from "./demo-data";
import { resetDemoData } from "./seed";
import {
  buildProjection,
  decideApply,
  recordFailure,
  WHITEBOARD_TARGETS,
  type ProjectionSnapshot,
} from "./whiteboard";

const BASE = "/command-center";

function refresh() {
  for (const p of [
    BASE,
    `${BASE}/readiness`,
    `${BASE}/referrals`,
    `${BASE}/tasks`,
    `${BASE}/work-orders`,
    `${BASE}/jobs`,
    `${BASE}/agents`,
    `${BASE}/approvals`,
    `${BASE}/whiteboard`,
    `${BASE}/modules`,
  ]) {
    revalidatePath(p);
  }
}

async function audit(entry: {
  division?: string;
  actor: string;
  actorKind?: string;
  action: string;
  subjectType?: string;
  subjectId?: string;
  detail?: string;
}) {
  await prisma.demoAuditEvent.create({
    data: {
      division: entry.division ?? "FGW",
      actor: entry.actor,
      actorKind: entry.actorKind ?? "HUMAN",
      action: entry.action,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      detail: entry.detail,
    },
  });
}

// --- Demo dataset control --------------------------------------------------

export async function resetDemoDatasetAction() {
  await resetDemoData();
  await audit({
    actor: "prototype operator",
    actorKind: "HUMAN",
    action: "DEMO_DATASET_RESET",
    detail: `Reloaded ${DEMO_DATASET_NAME}. Demo tables only.`,
  });
  refresh();
}

// --- Readiness -------------------------------------------------------------

export async function setChecklistStatusAction(formData: FormData) {
  const id = str(formData.get("id"));
  const status = str(formData.get("status"));
  if (!id || !status) return;

  const item = await prisma.demoChecklistItem.update({
    where: { id },
    data: {
      status,
      completedAt: status === "COMPLETE" ? new Date() : null,
      evidenceNote:
        status === "COMPLETE"
          ? str(formData.get("evidenceNote")) ?? "Marked complete in the prototype."
          : null,
      blockedReason: status === "BLOCKED" ? "Awaiting vendor appointment." : null,
    },
    include: { property: true },
  });

  await audit({
    division: item.property.division,
    actor: "prototype operator",
    action: "CHECKLIST_STATUS_SET",
    subjectType: "CHECKLIST_ITEM",
    subjectId: item.sourceId,
    detail: `${item.label} -> ${status}`,
  });
  refresh();
}

export async function setExpectedFeesAction(formData: FormData) {
  const id = str(formData.get("id"));
  const dollars = Number(str(formData.get("expectedFeesDollars")) ?? "");
  if (!id || !Number.isFinite(dollars) || dollars < 0) return;

  const property = await prisma.demoProperty.update({
    where: { id },
    data: { expectedFeesCents: Math.round(dollars * 100) },
  });
  await audit({
    division: property.division,
    actor: "prototype operator",
    action: "EXPECTED_FEES_SET",
    subjectType: "PROPERTY",
    subjectId: property.sourceId,
    detail: `Expected fees set to ${dollars.toFixed(2)} (per-property, configurable).`,
  });
  refresh();
}

// --- Referrals -------------------------------------------------------------

/**
 * Advance a referral one administrative stage. The gate refuses a blocked
 * referral, a skipped stage, or a decision stage with no named person. No
 * clinical or eligibility determination happens here.
 */
export async function advanceReferralAction(formData: FormData) {
  const id = str(formData.get("id"));
  const nextStage = str(formData.get("nextStage"));
  if (!id || !nextStage) return;

  const referral = await prisma.demoReferral.findUnique({ where: { id } });
  if (!referral) return;

  const recordedBy =
    str(formData.get("decisionRecordedBy")) ?? referral.decisionRecordedBy ?? null;

  const decision = evaluateReferralTransition(
    { ...referral, decisionRecordedBy: recordedBy },
    nextStage,
  );

  if (!decision.allowed) {
    await audit({
      division: referral.division,
      actor: "prototype operator",
      action: "REFERRAL_ADVANCE_REFUSED",
      subjectType: "REFERRAL",
      subjectId: referral.sourceId,
      detail: decision.blockers.join(" | "),
    });
    refresh();
    return;
  }

  const entersDecision =
    nextStage === "HUMAN_DECISION_RECORDED" || nextStage === "MOVE_IN_CHECKLIST";

  await prisma.demoReferral.update({
    where: { id },
    data: {
      stage: nextStage,
      decisionRecordedBy: recordedBy,
      decisionNote: entersDecision
        ? str(formData.get("decisionNote")) ??
          "Administrative decision recorded by a person."
        : referral.decisionNote,
      decisionAt: entersDecision ? referral.decisionAt ?? new Date() : referral.decisionAt,
    },
  });

  await audit({
    division: referral.division,
    actor: recordedBy ?? "prototype operator",
    action: "REFERRAL_STAGE_ADVANCED",
    subjectType: "REFERRAL",
    subjectId: referral.sourceId,
    detail: `${referral.stage} -> ${nextStage}${
      decision.warnings.length ? ` (warnings: ${decision.warnings.join("; ")})` : ""
    }`,
  });
  refresh();
}

// --- Approvals -------------------------------------------------------------

/** Look a subject up by its source ID and report whether it is blocked. */
async function subjectBlockState(subjectType: string, subjectSourceId: string) {
  if (subjectType === "JOB") {
    const job = await prisma.demoJob.findFirst({ where: { sourceId: subjectSourceId } });
    return { blocked: job?.blocked ?? false, reason: job?.blockedReason ?? null };
  }
  if (subjectType === "WORK_ORDER") {
    const wo = await prisma.demoWorkOrder.findFirst({ where: { sourceId: subjectSourceId } });
    return { blocked: wo?.blocked ?? false, reason: wo?.blockedReason ?? null };
  }
  if (subjectType === "REFERRAL") {
    const r = await prisma.demoReferral.findFirst({ where: { sourceId: subjectSourceId } });
    return { blocked: r?.blocked ?? false, reason: r?.blockedReason ?? null };
  }
  return { blocked: false, reason: null };
}

/**
 * Decide an approval. Always a person: `actorIsHuman` is hard-coded true
 * because this action is only reachable from the UI form, and the gate
 * refuses any decision without a named decider. There is no agent path.
 */
export async function decideApprovalAction(formData: FormData) {
  const id = str(formData.get("id"));
  const decision = str(formData.get("decision"));
  if (!id || (decision !== "APPROVE" && decision !== "REJECT")) return;

  const approval = await prisma.demoApproval.findUnique({ where: { id } });
  if (!approval) return;

  const decidedBy = str(formData.get("decidedBy"));
  const decisionNote = str(formData.get("decisionNote"));
  const subject = await subjectBlockState(approval.subjectType, approval.subjectId);

  const gate = evaluateApprovalGate({
    state: approval.state,
    decision,
    decidedBy,
    decisionNote,
    subjectBlocked: subject.blocked,
    subjectBlockedReason: subject.reason,
    actorIsHuman: true,
  });

  if (!gate.allowed) {
    await audit({
      division: approval.division,
      actor: decidedBy ?? "unnamed",
      action: "APPROVAL_REFUSED_BY_GATE",
      subjectType: approval.subjectType,
      subjectId: approval.subjectId,
      detail: [...gate.blockers, ...gate.warnings].join(" | "),
    });
    refresh();
    return;
  }

  await prisma.demoApproval.update({
    where: { id },
    data: {
      state: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      decidedBy,
      decisionNote,
      decidedAt: new Date(),
    },
  });

  await audit({
    division: approval.division,
    actor: decidedBy!,
    action: decision === "APPROVE" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
    subjectType: approval.subjectType,
    subjectId: approval.subjectId,
    detail: decisionNote ?? undefined,
  });
  refresh();
}

/** Clear a subject's block so a refused approval can legitimately proceed. */
export async function clearJobBlockAction(formData: FormData) {
  const sourceId = str(formData.get("sourceId"));
  const division = str(formData.get("division"));
  if (!sourceId || !division) return;

  await prisma.demoJob.updateMany({
    where: { sourceId, division },
    data: { blocked: false, blockedReason: null },
  });
  await audit({
    division,
    actor: "prototype operator",
    action: "JOB_BLOCK_CLEARED",
    subjectType: "JOB",
    subjectId: sourceId,
    detail: "Block cleared, so the approval gate can be satisfied.",
  });
  refresh();
}

// --- Agent check-ins -------------------------------------------------------

export async function recordAgentCheckInAction(formData: FormData) {
  const id = str(formData.get("id"));
  if (!id) return;
  const evidence = str(formData.get("lastEvidenceNote"));

  const agent = await prisma.demoAgentCheckIn.update({
    where: { id },
    data: { lastCheckInAt: new Date(), lastEvidenceNote: evidence },
  });
  await audit({
    division: agent.division,
    actor: "prototype operator",
    actorKind: "HUMAN",
    action: "AGENT_CHECK_IN_RECORDED",
    subjectType: "AGENT",
    subjectId: agent.agentName,
    detail: evidence
      ? `Evidence recorded: ${evidence}`
      : "Check-in recorded with NO evidence attached.",
  });
  refresh();
}

// --- Whiteboard projection -------------------------------------------------

/** Read the demo dataset into the adapter's snapshot shape. */
async function loadProjectionSnapshot(): Promise<ProjectionSnapshot> {
  const [facilities, referrals, workOrders, jobs, tasks, agents, approvals] =
    await Promise.all([
      prisma.demoProperty.findMany({
        include: { checklistItems: { select: { status: true, required: true } } },
      }),
      prisma.demoReferral.findMany({
        select: { division: true, stage: true, blocked: true },
      }),
      prisma.demoWorkOrder.findMany({
        select: {
          division: true, status: true, priority: true, blocked: true, blockedReason: true,
        },
      }),
      prisma.demoJob.findMany({
        select: {
          sourceId: true, division: true, status: true, blocked: true, blockedReason: true,
        },
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
      sourceId: a.sourceId,
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

/** Ensure the two documented targets exist, disabled. */
export async function ensureWhiteboardTargets() {
  for (const target of WHITEBOARD_TARGETS) {
    await prisma.demoWhiteboardTarget.upsert({
      where: { targetKey: target.targetKey },
      update: { label: target.label, targetUrl: target.targetUrl },
      create: {
        targetKey: target.targetKey,
        label: target.label,
        targetUrl: target.targetUrl,
        enabled: false,
      },
    });
  }
}

export async function buildCurrentProjection(version: number, now: Date = new Date()) {
  const snapshot = await loadProjectionSnapshot();
  return buildProjection(snapshot, {
    version,
    generatedAt: now,
    sourceDataset: DEMO_DATASET_NAME,
    now,
  });
}

/**
 * Generate a projection and record the apply ATTEMPT against a target.
 *
 * The target is disabled, so the attempt is rejected as REJECTED_DISABLED —
 * which is the honest outcome: the prototype cannot and does not apply
 * anything to a live board. The payload is still generated and logged so the
 * export contract is demonstrable.
 */
export async function generateProjectionAction(formData: FormData) {
  const targetKey = str(formData.get("targetKey"));
  if (!targetKey) return;

  await ensureWhiteboardTargets();
  const target = await prisma.demoWhiteboardTarget.findUnique({ where: { targetKey } });
  if (!target) return;

  const now = new Date();
  const nextVersion = (target.lastAppliedVersion ?? 0) + 1;
  const projection = await buildCurrentProjection(nextVersion, now);

  const decision = decideApply(
    {
      targetKey: target.targetKey,
      enabled: target.enabled,
      lastAppliedVersion: target.lastAppliedVersion,
      lastAppliedContentHash: target.lastAppliedContentHash,
      lastAppliedAt: target.lastAppliedAt,
      lastSuccessAt: target.lastSuccessAt,
      lastErrorAt: target.lastErrorAt,
      lastError: target.lastError,
      consecutiveFailures: target.consecutiveFailures,
    },
    projection,
    now,
  );

  await prisma.demoWhiteboardEvent.create({
    data: {
      targetId: target.id,
      projectionId: projection.projectionId,
      version: projection.version,
      contentHash: projection.contentHash,
      generatedAt: new Date(projection.generatedAt),
      outcome: decision.outcome,
      detail: decision.detail,
    },
  });

  if (decision.accepted) {
    await prisma.demoWhiteboardTarget.update({
      where: { id: target.id },
      data: {
        lastAppliedVersion: decision.nextState.lastAppliedVersion,
        lastAppliedContentHash: decision.nextState.lastAppliedContentHash,
        lastAppliedAt: decision.nextState.lastAppliedAt,
        lastSuccessAt: decision.nextState.lastSuccessAt,
        consecutiveFailures: 0,
      },
    });
  }

  await audit({
    actor: "prototype operator",
    action: "WHITEBOARD_PROJECTION_GENERATED",
    subjectType: "WHITEBOARD_TARGET",
    subjectId: target.targetKey,
    detail: `v${projection.version} hash ${projection.contentHash} -> ${decision.outcome}`,
  });
  refresh();
}

/**
 * Record a local-only apply against a LOCAL projection target, so the
 * prototype can demonstrate a successful version bump and the subsequent
 * duplicate/stale rejections without touching any external board.
 */
export async function applyToLocalProjectionAction() {
  const targetKey = "local-projection";
  await prisma.demoWhiteboardTarget.upsert({
    where: { targetKey },
    update: {},
    create: {
      targetKey,
      label: "Local projection board (this prototype only)",
      targetUrl: "local://command-center/whiteboard",
      // Enabled because it IS local: nothing leaves this machine.
      enabled: true,
    },
  });

  const target = await prisma.demoWhiteboardTarget.findUniqueOrThrow({ where: { targetKey } });
  const now = new Date();
  const nextVersion = (target.lastAppliedVersion ?? 0) + 1;
  const projection = await buildCurrentProjection(nextVersion, now);

  const decision = decideApply(
    {
      targetKey: target.targetKey,
      enabled: target.enabled,
      lastAppliedVersion: target.lastAppliedVersion,
      lastAppliedContentHash: target.lastAppliedContentHash,
      lastAppliedAt: target.lastAppliedAt,
      lastSuccessAt: target.lastSuccessAt,
      lastErrorAt: target.lastErrorAt,
      lastError: target.lastError,
      consecutiveFailures: target.consecutiveFailures,
    },
    projection,
    now,
  );

  await prisma.demoWhiteboardEvent.create({
    data: {
      targetId: target.id,
      projectionId: projection.projectionId,
      version: projection.version,
      contentHash: projection.contentHash,
      generatedAt: new Date(projection.generatedAt),
      outcome: decision.outcome,
      detail: decision.detail,
    },
  });

  if (decision.accepted) {
    await prisma.demoWhiteboardTarget.update({
      where: { id: target.id },
      data: {
        lastAppliedVersion: decision.nextState.lastAppliedVersion,
        lastAppliedContentHash: decision.nextState.lastAppliedContentHash,
        lastAppliedAt: decision.nextState.lastAppliedAt,
        lastSuccessAt: decision.nextState.lastSuccessAt,
        consecutiveFailures: 0,
      },
    });
  }
  refresh();
}

/** Re-apply the SAME version, to demonstrate duplicate rejection. */
export async function replayLastProjectionAction() {
  const target = await prisma.demoWhiteboardTarget.findUnique({
    where: { targetKey: "local-projection" },
  });
  if (!target || target.lastAppliedVersion == null) return;

  const now = new Date();
  const projection = await buildCurrentProjection(target.lastAppliedVersion, now);
  const decision = decideApply(
    {
      targetKey: target.targetKey,
      enabled: target.enabled,
      lastAppliedVersion: target.lastAppliedVersion,
      lastAppliedContentHash: target.lastAppliedContentHash,
      lastAppliedAt: target.lastAppliedAt,
      lastSuccessAt: target.lastSuccessAt,
      lastErrorAt: target.lastErrorAt,
      lastError: target.lastError,
      consecutiveFailures: target.consecutiveFailures,
    },
    projection,
    now,
  );

  await prisma.demoWhiteboardEvent.create({
    data: {
      targetId: target.id,
      projectionId: projection.projectionId,
      version: projection.version,
      contentHash: projection.contentHash,
      generatedAt: new Date(projection.generatedAt),
      outcome: decision.outcome,
      detail: decision.detail,
    },
  });
  refresh();
}

/**
 * Record a simulated transport failure, to demonstrate that a failed sync
 * stays visibly failed and that an earlier success does not mask it.
 */
export async function simulateSyncFailureAction(formData: FormData) {
  const targetKey = str(formData.get("targetKey")) ?? "local-projection";
  const target = await prisma.demoWhiteboardTarget.findUnique({ where: { targetKey } });
  if (!target) return;

  const now = new Date();
  const error = "Simulated apply failure (prototype demonstration).";
  const next = recordFailure(
    {
      targetKey: target.targetKey,
      enabled: target.enabled,
      lastAppliedVersion: target.lastAppliedVersion,
      lastAppliedContentHash: target.lastAppliedContentHash,
      lastAppliedAt: target.lastAppliedAt,
      lastSuccessAt: target.lastSuccessAt,
      lastErrorAt: target.lastErrorAt,
      lastError: target.lastError,
      consecutiveFailures: target.consecutiveFailures,
    },
    error,
    now,
  );

  await prisma.demoWhiteboardTarget.update({
    where: { id: target.id },
    data: {
      lastErrorAt: next.lastErrorAt,
      lastError: next.lastError,
      consecutiveFailures: next.consecutiveFailures,
    },
  });

  await prisma.demoWhiteboardEvent.create({
    data: {
      targetId: target.id,
      projectionId: "cc-aflh-fgw-command-center",
      version: target.lastAppliedVersion ?? 0,
      contentHash: target.lastAppliedContentHash ?? "n/a",
      generatedAt: now,
      outcome: "FAILED",
      detail: error,
    },
  });
  refresh();
}
