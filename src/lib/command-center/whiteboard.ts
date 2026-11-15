// Whiteboard projection adapter — SYNTHETIC, OUTBOUND-ONLY, NOT CONNECTED.
//
// What this is:
//   A pure transform from the demo dataset into a sanitized, versioned
//   payload with stable IDs, plus the state machine that decides whether a
//   given payload may be applied to a target board.
//
// What this is NOT:
//   It is not a live connection to claude.ai. Nothing in this module opens a
//   socket, and no function here fetches or edits an artifact. A projection is
//   generated locally; applying it to a real board is a deliberate human step,
//   documented in docs/command-center-prototype.md.
//
// Why the allowlist is strict:
//   The target boards are shared with anyone who has the link. A public
//   surface gets codes and counts — never money, names, addresses, contact
//   details, occupant identifiers or free-text notes. Synthetic is not the
//   same as safe-to-publish, so the allowlist is enforced on shape AND
//   re-audited on the serialized output.

import { createHash } from "node:crypto";

import {
  checkInHealth,
  readinessSummary,
  referralStageLabel,
  REFERRAL_STAGES,
  type DivisionFilter,
} from "./domain";

export const PROJECTION_SCHEMA_VERSION = "cc-whiteboard/1";
export const PROJECTION_ID = "cc-aflh-fgw-command-center";

/**
 * Declared capabilities of this adapter. Asserted in tests so the guarantees
 * cannot be quietly widened.
 */
export const WHITEBOARD_ADAPTER_CAPABILITIES = {
  /** Generates a payload locally. */
  outboundProjection: true,
  /** Never writes back into the command center from a board payload. */
  reverseWrite: false,
  /** Never opens a network connection. */
  networkAccess: false,
  /** Never reads or edits a live claude.ai artifact. */
  liveArtifactSync: false,
  /** A person applies the payload; no scheduler does. */
  autonomousApply: false,
} as const;

export function describeReverseWritePolicy(): string {
  return (
    "One-way by construction. This module exports no function that accepts a " +
    "board payload and mutates command-center records. Changes observed on a " +
    "board are never trusted as input."
  );
}

// ---------------------------------------------------------------------------
// Field allowlist
// ---------------------------------------------------------------------------

/** The only keys a projected card may carry. */
export const CARD_ALLOWLIST = [
  "id",
  "kind",
  "division",
  "code",
  "status",
  "blocked",
  "blockedReasonCode",
  "metrics",
  "version",
  "updatedAt",
] as const;

/**
 * Patterns that must never appear in a serialized projection. Defence in
 * depth behind the shape allowlist: if a future card builder forgets to
 * sanitize, the audit fails loudly instead of publishing.
 */
const LEAK_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "currency symbol", pattern: /[$£€]/ },
  { label: "cents/amount field name", pattern: /cents|amount|price|cost|revenue|fee/i },
  { label: "email address", pattern: /@/ },
  { label: "phone number", pattern: /\b\d{3}-\d{4}\b/ },
  { label: "fictional-person marker", pattern: /FICTIONAL/i },
  { label: "street address", pattern: /\b(Way|Street|Lane|Terrace|Drive)\b/ },
  { label: "occupant identifier", pattern: /occupant|OCC-/i },
  { label: "free-text demo name", pattern: /DEMO\s+—/ },
];

export type ProjectionAuditFinding = { label: string; sample: string };

/** Scan the serialized payload for anything the allowlist should have removed. */
export function auditProjection(projection: WhiteboardProjection): ProjectionAuditFinding[] {
  // Audit only the card payload. The envelope deliberately carries human-
  // readable notices and the dataset name, which are not record data.
  const serialized = JSON.stringify(projection.cards);
  const findings: ProjectionAuditFinding[] = [];
  for (const { label, pattern } of LEAK_PATTERNS) {
    const match = serialized.match(pattern);
    if (match) findings.push({ label, sample: match[0] });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Card shape
// ---------------------------------------------------------------------------

export type CardKind =
  | "ROLLUP"
  | "FACILITY_READINESS"
  | "REFERRAL_FUNNEL"
  | "WORK_ORDER_QUEUE"
  | "JOB_STATUS"
  | "TASK_QUEUE"
  | "AGENT_HEALTH"
  | "APPROVAL_QUEUE";

export type CardMetric = { key: string; value: number };

export type WhiteboardCard = {
  /** Stable across reseeds: derived from source IDs, never from a row's cuid. */
  id: string;
  kind: CardKind;
  division: "FGW" | "AFLH" | "ALL";
  /** A code or typed token. Never a name, address or free-text note. */
  code: string;
  status: string;
  blocked: boolean;
  /** A slug, not the operator's free-text reason. */
  blockedReasonCode: string | null;
  metrics: CardMetric[];
  version: number;
  updatedAt: string;
};

export type WhiteboardProjection = {
  projectionId: string;
  schemaVersion: string;
  /** Monotonic. Incremented by the caller when the content changes. */
  version: number;
  generatedAt: string;
  /** Stable hash of the card content only — the envelope is excluded. */
  contentHash: string;
  sourceDataset: string;
  synthetic: true;
  cards: WhiteboardCard[];
  /** Statements that travel with the payload so a reader is not misled. */
  notices: string[];
};

const SAFE_CODE = /^[A-Z0-9][A-Z0-9._-]*$/;
const SAFE_TOKEN = /^[A-Z0-9_]+$/;

/**
 * Force a card through the allowlist. Unknown keys are dropped, codes and
 * status tokens must match a safe shape, and metric values must be finite
 * integers — so no amount can ride along as a "metric".
 */
export function sanitizeCard(input: Record<string, unknown>): WhiteboardCard {
  const code = String(input.code ?? "");
  if (!SAFE_CODE.test(code)) {
    throw new Error(`Card code "${code}" is not an allowed code shape.`);
  }
  const status = String(input.status ?? "");
  if (!SAFE_TOKEN.test(status)) {
    throw new Error(`Card status "${status}" must be an uppercase token.`);
  }

  const reason = input.blockedReasonCode == null ? null : String(input.blockedReasonCode);
  if (reason != null && !SAFE_TOKEN.test(reason)) {
    throw new Error(`Blocked reason "${reason}" must be a slug, not free text.`);
  }

  const rawMetrics = Array.isArray(input.metrics) ? input.metrics : [];
  const metrics: CardMetric[] = rawMetrics.map((m) => {
    const metric = m as { key?: unknown; value?: unknown };
    const key = String(metric.key ?? "");
    if (!/^[a-z][a-zA-Z]*$/.test(key)) {
      throw new Error(`Metric key "${key}" must be a short camelCase name.`);
    }
    const value = Number(metric.value);
    if (!Number.isInteger(value)) {
      throw new Error(`Metric "${key}" must be an integer count, not ${String(metric.value)}.`);
    }
    return { key, value };
  });

  return {
    id: String(input.id ?? ""),
    kind: input.kind as CardKind,
    division: input.division as "FGW" | "AFLH" | "ALL",
    code,
    status,
    blocked: Boolean(input.blocked),
    blockedReasonCode: reason,
    metrics,
    version: Number(input.version ?? 1),
    updatedAt: String(input.updatedAt ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Stable IDs
// ---------------------------------------------------------------------------

const KIND_PREFIX: Record<CardKind, string> = {
  ROLLUP: "CC-ROLL",
  FACILITY_READINESS: "CC-FAC",
  REFERRAL_FUNNEL: "CC-FUNNEL",
  WORK_ORDER_QUEUE: "CC-WOQ",
  JOB_STATUS: "CC-JOB",
  TASK_QUEUE: "CC-TASKQ",
  AGENT_HEALTH: "CC-AGENT",
  APPROVAL_QUEUE: "CC-APPQ",
};

/**
 * Build a card ID from the kind plus a source-stable discriminator.
 * Deliberately NOT derived from a database id, so reseeding the demo dataset
 * reproduces the same card IDs — the same property the board's R-xx IDs have.
 */
export function cardId(kind: CardKind, ...parts: string[]): string {
  const tail = parts
    .map((p) => p.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join("-");
  return tail ? `${KIND_PREFIX[kind]}-${tail}` : KIND_PREFIX[kind];
}

function slugReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const lowered = reason.toLowerCase();
  if (lowered.includes("permit")) return "AWAITING_PERMIT";
  if (lowered.includes("access")) return "ACCESS_UNAVAILABLE";
  if (lowered.includes("vendor")) return "AWAITING_VENDOR";
  if (lowered.includes("document") || lowered.includes("legible")) return "DOCUMENTS_OUTSTANDING";
  if (lowered.includes("integration")) return "INTEGRATION_NOT_CONNECTED";
  return "OTHER";
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Hash the card content only, so a regenerated-but-identical payload matches. */
export function projectionContentHash(cards: WhiteboardCard[]): string {
  const withoutVolatile = cards.map(({ updatedAt: _updatedAt, version: _version, ...rest }) => rest);
  return createHash("sha256").update(canonicalJson(withoutVolatile)).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// The projection itself
// ---------------------------------------------------------------------------

export type ProjectionSnapshot = {
  facilities: {
    sourceId: string;
    division: string;
    licenseStatus: string;
    checklistItems: { status: string; required: boolean }[];
  }[];
  referrals: { division: string; stage: string; blocked: boolean }[];
  workOrders: {
    division: string;
    status: string;
    priority: string;
    blocked: boolean;
    blockedReason?: string | null;
  }[];
  jobs: {
    sourceId: string;
    division: string;
    status: string;
    blocked: boolean;
    blockedReason?: string | null;
  }[];
  tasks: { division: string; status: string }[];
  agents: {
    agentName: string;
    division: string;
    lastCheckInAt: Date | null;
    lastEvidenceNote: string | null;
    blocked: boolean;
    blockedReason?: string | null;
  }[];
  approvals: { division: string; state: string }[];
};

export const PROJECTION_NOTICES = [
  "SYNTHETIC DEMO DATA ONLY. No real property, person, referral or financial record is represented.",
  "Generated by a local prototype. This payload is NOT applied automatically and is NOT a live sync.",
  "Codes and counts only: no amounts, names, addresses or contact details are projected by design.",
  "A generated-at timestamp records when this payload was built, not that any board actually received or correctly applied it. Check the target's last-success and last-error status instead.",
];

export function buildProjection(
  snapshot: ProjectionSnapshot,
  options: {
    version: number;
    generatedAt: Date;
    sourceDataset: string;
    /** Treated as the current time for agent freshness. */
    now?: Date;
  },
): WhiteboardProjection {
  const now = options.now ?? options.generatedAt;
  const updatedAt = options.generatedAt.toISOString();
  const raw: Record<string, unknown>[] = [];

  const divisions: ("FGW" | "AFLH")[] = ["FGW", "AFLH"];

  // --- Division rollups --------------------------------------------------
  for (const division of divisions) {
    const facilities = snapshot.facilities.filter((f) => f.division === division);
    const workOrders = snapshot.workOrders.filter((w) => w.division === division);
    const tasks = snapshot.tasks.filter((t) => t.division === division);
    const approvals = snapshot.approvals.filter((a) => a.division === division);
    const jobs = snapshot.jobs.filter((j) => j.division === division);

    const openWorkOrders = workOrders.filter(
      (w) => w.status !== "COMPLETE" && w.status !== "CANCELLED",
    );
    const blockedCount =
      openWorkOrders.filter((w) => w.blocked).length + jobs.filter((j) => j.blocked).length;

    raw.push({
      id: cardId("ROLLUP", division),
      kind: "ROLLUP",
      division,
      code: `${division}-ROLLUP`,
      status: blockedCount > 0 ? "ATTENTION" : "STEADY",
      blocked: false,
      blockedReasonCode: null,
      metrics: [
        { key: "facilities", value: facilities.length },
        { key: "openWorkOrders", value: openWorkOrders.length },
        { key: "blockedItems", value: blockedCount },
        { key: "openTasks", value: tasks.filter((t) => t.status !== "DONE" && t.status !== "CANCELLED").length },
        { key: "pendingApprovals", value: approvals.filter((a) => a.state === "PENDING").length },
      ],
      version: options.version,
      updatedAt,
    });
  }

  // --- Facility readiness: stable CODE, never the facility name ----------
  for (const facility of snapshot.facilities) {
    if (facility.checklistItems.length === 0) continue;
    const summary = readinessSummary(facility.checklistItems);
    raw.push({
      id: cardId("FACILITY_READINESS", facility.sourceId),
      kind: "FACILITY_READINESS",
      division: facility.division,
      code: facility.sourceId,
      status: summary.ready ? "READY" : summary.blocked > 0 ? "BLOCKED" : "IN_PROGRESS",
      blocked: summary.blocked > 0,
      blockedReasonCode: summary.blocked > 0 ? "AWAITING_VENDOR" : null,
      metrics: [
        { key: "requiredTotal", value: summary.requiredTotal },
        { key: "requiredComplete", value: summary.requiredComplete },
        { key: "requiredOutstanding", value: summary.requiredOutstanding },
        { key: "blockedItems", value: summary.blocked },
        { key: "percentComplete", value: summary.percent },
      ],
      version: options.version,
      updatedAt,
    });
  }

  // --- Referral funnel: STAGE COUNTS ONLY, never per-referral cards ------
  for (const division of divisions) {
    const referrals = snapshot.referrals.filter((r) => r.division === division);
    if (referrals.length === 0) continue;
    raw.push({
      id: cardId("REFERRAL_FUNNEL", division),
      kind: "REFERRAL_FUNNEL",
      division,
      code: `${division}-REFERRAL-FUNNEL`,
      status: referrals.some((r) => r.blocked) ? "ATTENTION" : "STEADY",
      blocked: false,
      blockedReasonCode: null,
      metrics: [
        ...REFERRAL_STAGES.map((stage) => ({
          // camelCase metric key per stage, e.g. stageHumanReview
          key: `stage${stage.value
            .toLowerCase()
            .split("_")
            .map((w) => w[0].toUpperCase() + w.slice(1))
            .join("")}`,
          value: referrals.filter((r) => r.stage === stage.value).length,
        })),
        { key: "blockedReferrals", value: referrals.filter((r) => r.blocked).length },
      ],
      version: options.version,
      updatedAt,
    });
  }

  // --- Work order queue --------------------------------------------------
  for (const division of divisions) {
    const workOrders = snapshot.workOrders.filter((w) => w.division === division);
    if (workOrders.length === 0) continue;
    const open = workOrders.filter((w) => w.status !== "COMPLETE" && w.status !== "CANCELLED");
    raw.push({
      id: cardId("WORK_ORDER_QUEUE", division),
      kind: "WORK_ORDER_QUEUE",
      division,
      code: `${division}-WORK-ORDERS`,
      status: open.some((w) => w.priority === "EMERGENCY") ? "EMERGENCY_PRESENT" : "STEADY",
      blocked: open.some((w) => w.blocked),
      blockedReasonCode: slugReason(open.find((w) => w.blocked)?.blockedReason ?? null),
      metrics: [
        { key: "open", value: open.length },
        { key: "emergency", value: open.filter((w) => w.priority === "EMERGENCY").length },
        { key: "blocked", value: open.filter((w) => w.blocked).length },
        { key: "complete", value: workOrders.filter((w) => w.status === "COMPLETE").length },
      ],
      version: options.version,
      updatedAt,
    });
  }

  // --- Blocked jobs: a card each, by code. No amounts. -------------------
  for (const job of snapshot.jobs.filter((j) => j.blocked)) {
    raw.push({
      id: cardId("JOB_STATUS", job.sourceId),
      kind: "JOB_STATUS",
      division: job.division,
      code: job.sourceId,
      status: "BLOCKED",
      blocked: true,
      blockedReasonCode: slugReason(job.blockedReason),
      metrics: [],
      version: options.version,
      updatedAt,
    });
  }

  // --- Task queue --------------------------------------------------------
  for (const division of divisions) {
    const tasks = snapshot.tasks.filter((t) => t.division === division);
    if (tasks.length === 0) continue;
    raw.push({
      id: cardId("TASK_QUEUE", division),
      kind: "TASK_QUEUE",
      division,
      code: `${division}-TASKS`,
      status: tasks.some((t) => t.status === "BLOCKED") ? "ATTENTION" : "STEADY",
      blocked: tasks.some((t) => t.status === "BLOCKED"),
      blockedReasonCode: tasks.some((t) => t.status === "BLOCKED") ? "AWAITING_VENDOR" : null,
      metrics: [
        { key: "open", value: tasks.filter((t) => t.status === "OPEN").length },
        { key: "inProgress", value: tasks.filter((t) => t.status === "IN_PROGRESS").length },
        { key: "blocked", value: tasks.filter((t) => t.status === "BLOCKED").length },
        { key: "done", value: tasks.filter((t) => t.status === "DONE").length },
      ],
      version: options.version,
      updatedAt,
    });
  }

  // --- Agent health: a blocked agent reports BLOCKED whatever its note says
  for (const agent of snapshot.agents) {
    const { health } = checkInHealth(agent, now);
    raw.push({
      id: cardId("AGENT_HEALTH", agent.division, agent.agentName),
      kind: "AGENT_HEALTH",
      division: agent.division,
      code: cardId("AGENT_HEALTH", agent.division, agent.agentName).replace("CC-AGENT-", ""),
      status: health,
      blocked: agent.blocked,
      blockedReasonCode: slugReason(agent.blockedReason),
      metrics: [{ key: "hasEvidence", value: (agent.lastEvidenceNote ?? "").trim() ? 1 : 0 }],
      version: options.version,
      updatedAt,
    });
  }

  // --- Approval queue ----------------------------------------------------
  for (const division of divisions) {
    const approvals = snapshot.approvals.filter((a) => a.division === division);
    if (approvals.length === 0) continue;
    raw.push({
      id: cardId("APPROVAL_QUEUE", division),
      kind: "APPROVAL_QUEUE",
      division,
      code: `${division}-APPROVALS`,
      status: approvals.some((a) => a.state === "PENDING") ? "PENDING_PRESENT" : "CLEAR",
      blocked: false,
      blockedReasonCode: null,
      metrics: [
        { key: "pending", value: approvals.filter((a) => a.state === "PENDING").length },
        { key: "approved", value: approvals.filter((a) => a.state === "APPROVED").length },
        { key: "rejected", value: approvals.filter((a) => a.state === "REJECTED").length },
      ],
      version: options.version,
      updatedAt,
    });
  }

  const cards = raw.map(sanitizeCard).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    projectionId: PROJECTION_ID,
    schemaVersion: PROJECTION_SCHEMA_VERSION,
    version: options.version,
    generatedAt: options.generatedAt.toISOString(),
    contentHash: projectionContentHash(cards),
    sourceDataset: options.sourceDataset,
    synthetic: true,
    cards,
    notices: [...PROJECTION_NOTICES],
  };
}

// ---------------------------------------------------------------------------
// Apply decision: duplicate / stale / conflict rejection
// ---------------------------------------------------------------------------

export type TargetSyncState = {
  targetKey: string;
  enabled: boolean;
  lastAppliedVersion: number | null;
  lastAppliedContentHash: string | null;
  lastAppliedAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
};

export type ApplyOutcome =
  | "APPLIED"
  | "REJECTED_DUPLICATE"
  | "REJECTED_STALE"
  | "REJECTED_VERSION_CONFLICT"
  | "REJECTED_UNKNOWN_TARGET"
  | "REJECTED_DISABLED";

export type ApplyDecision = {
  outcome: ApplyOutcome;
  accepted: boolean;
  detail: string;
  nextState: TargetSyncState;
};

/**
 * Decide whether a projection may be applied to a target, and return the
 * target's next state. Pure: the caller persists the result.
 *
 * Rejection rules, in order:
 *   - unknown or disabled target;
 *   - a version already applied with the same content (duplicate replay);
 *   - the SAME version carrying DIFFERENT content (version conflict — this is
 *     the case a timestamp alone would hide);
 *   - a version lower than the one already applied, or a payload generated
 *     before the last successful apply (stale/out-of-order delivery).
 */
export function decideApply(
  state: TargetSyncState | null,
  projection: Pick<WhiteboardProjection, "projectionId" | "version" | "contentHash" | "generatedAt">,
  at: Date,
): ApplyDecision {
  if (state == null) {
    return {
      outcome: "REJECTED_UNKNOWN_TARGET",
      accepted: false,
      detail: "No such projection target is registered.",
      nextState: {
        targetKey: "unknown",
        enabled: false,
        lastAppliedVersion: null,
        lastAppliedContentHash: null,
        lastAppliedAt: null,
        lastSuccessAt: null,
        lastErrorAt: at,
        lastError: "Unknown target",
        consecutiveFailures: 1,
      },
    };
  }

  const reject = (outcome: ApplyOutcome, detail: string): ApplyDecision => ({
    outcome,
    accepted: false,
    detail,
    // A rejection is NOT a transport failure: it does not reset last-success
    // and does not increment the failure counter.
    nextState: { ...state },
  });

  if (projection.projectionId !== PROJECTION_ID) {
    return reject(
      "REJECTED_UNKNOWN_TARGET",
      `Payload is for projection "${projection.projectionId}", not "${PROJECTION_ID}".`,
    );
  }

  if (!state.enabled) {
    return reject(
      "REJECTED_DISABLED",
      "Target is disabled. The prototype never enables outbound apply; a person applies the payload.",
    );
  }

  const generatedAt = new Date(projection.generatedAt);

  if (state.lastAppliedVersion != null) {
    if (projection.version === state.lastAppliedVersion) {
      if (projection.contentHash === state.lastAppliedContentHash) {
        return reject(
          "REJECTED_DUPLICATE",
          `Version ${projection.version} with identical content was already applied.`,
        );
      }
      return reject(
        "REJECTED_VERSION_CONFLICT",
        `Version ${projection.version} was already applied with different content. ` +
          "Bump the version rather than re-publishing the same one.",
      );
    }
    if (projection.version < state.lastAppliedVersion) {
      return reject(
        "REJECTED_STALE",
        `Version ${projection.version} is older than the applied version ${state.lastAppliedVersion}.`,
      );
    }
  }

  if (state.lastSuccessAt != null && generatedAt < state.lastSuccessAt) {
    return reject(
      "REJECTED_STALE",
      "Payload was generated before the last successful apply — out-of-order delivery.",
    );
  }

  return {
    outcome: "APPLIED",
    accepted: true,
    detail: `Applied version ${projection.version}.`,
    nextState: {
      ...state,
      lastAppliedVersion: projection.version,
      lastAppliedContentHash: projection.contentHash,
      lastAppliedAt: at,
      lastSuccessAt: at,
      lastErrorAt: state.lastErrorAt,
      lastError: state.lastError,
      consecutiveFailures: 0,
    },
  };
}

/** Record a transport/apply failure. A failure never clears last-success. */
export function recordFailure(
  state: TargetSyncState,
  error: string,
  at: Date,
): TargetSyncState {
  return {
    ...state,
    lastErrorAt: at,
    lastError: error,
    consecutiveFailures: state.consecutiveFailures + 1,
  };
}

// ---------------------------------------------------------------------------
// Status derivation
// ---------------------------------------------------------------------------

export type SyncHealth =
  | "NEVER_ATTEMPTED"
  | "FAILED"
  | "SUCCEEDED_THEN_FAILED"
  | "STALE_SUCCESS"
  | "OK";

export type SyncStatus = {
  health: SyncHealth;
  label: string;
  /** False unless a successful apply is the most recent outcome. */
  healthy: boolean;
  /**
   * Always false in this prototype: nothing here verifies that a board
   * actually rendered the payload correctly. A "last synced" label is a claim,
   * not evidence.
   */
  verified: false;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  hoursSinceSuccess: number | null;
};

export function syncStatus(
  state: TargetSyncState,
  now: Date = new Date(),
  staleAfterHours = 26,
): SyncStatus {
  const hoursSinceSuccess =
    state.lastSuccessAt == null
      ? null
      : (now.getTime() - state.lastSuccessAt.getTime()) / 3_600_000;

  const failedAfterSuccess =
    state.lastErrorAt != null &&
    (state.lastSuccessAt == null || state.lastErrorAt > state.lastSuccessAt);

  let health: SyncHealth;
  if (state.lastSuccessAt == null && state.lastErrorAt == null) {
    health = "NEVER_ATTEMPTED";
  } else if (failedAfterSuccess) {
    // A past success does not soften a current failure.
    health = state.lastSuccessAt == null ? "FAILED" : "SUCCEEDED_THEN_FAILED";
  } else if (hoursSinceSuccess != null && hoursSinceSuccess > staleAfterHours) {
    health = "STALE_SUCCESS";
  } else {
    health = "OK";
  }

  const label = {
    NEVER_ATTEMPTED: "Never attempted",
    FAILED: "Failing — no successful apply on record",
    SUCCEEDED_THEN_FAILED: "FAILING — last attempt errored after an earlier success",
    STALE_SUCCESS: "Stale — last success is older than the expected cadence",
    OK: "Last attempt succeeded",
  }[health];

  return {
    health,
    label,
    healthy: health === "OK",
    verified: false,
    lastSuccessAt: state.lastSuccessAt,
    lastErrorAt: state.lastErrorAt,
    lastError: state.lastError,
    consecutiveFailures: state.consecutiveFailures,
    hoursSinceSuccess,
  };
}

// ---------------------------------------------------------------------------
// Registered targets — recorded for documentation, never contacted.
// ---------------------------------------------------------------------------

export const WHITEBOARD_TARGETS = [
  {
    targetKey: "ai-team-board",
    label: "AI team board (external, shared by link)",
    targetUrl: "https://claude.ai/artifact/RWbJpisn7Z7FNQx3eZUamx",
  },
  {
    targetKey: "roadmap-board",
    label: "Roadmap board (external, shared by link)",
    targetUrl: "https://claude.ai/artifact/PCbFYEcJXPCnk3z6zHti1v",
  },
] as const;

export function projectionForDivision(
  projection: WhiteboardProjection,
  division: DivisionFilter,
): WhiteboardCard[] {
  return division === "ALL"
    ? projection.cards
    : projection.cards.filter((c) => c.division === division || c.division === "ALL");
}
