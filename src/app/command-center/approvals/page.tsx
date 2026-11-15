import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  approvalConsistencyWarnings,
  evaluateApprovalGate,
  filterByDivision,
} from "@/lib/command-center/domain";
import { formatCents, readDivision } from "@/lib/command-center/view";
import {
  clearJobBlockAction,
  decideApprovalAction,
} from "@/lib/command-center/actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);

  const [allApprovals, jobs, workOrders, referrals, allAudit] = await Promise.all([
    prisma.demoApproval.findMany({ orderBy: [{ state: "asc" }, { createdAt: "asc" }] }),
    prisma.demoJob.findMany(),
    prisma.demoWorkOrder.findMany(),
    prisma.demoReferral.findMany(),
    prisma.demoAuditEvent.findMany({ orderBy: { at: "desc" }, take: 60 }),
  ]);

  const approvals = filterByDivision(allApprovals, division);
  const audit = filterByDivision(allAudit, division);

  /** Resolve a subject's blocked state by its source ID. */
  function subjectState(subjectType: string, subjectId: string) {
    if (subjectType === "JOB") {
      const job = jobs.find((j) => j.sourceId === subjectId);
      return { blocked: job?.blocked ?? false, reason: job?.blockedReason ?? null, job };
    }
    if (subjectType === "WORK_ORDER") {
      const wo = workOrders.find((w) => w.sourceId === subjectId);
      return { blocked: wo?.blocked ?? false, reason: wo?.blockedReason ?? null };
    }
    if (subjectType === "REFERRAL") {
      const r = referrals.find((x) => x.sourceId === subjectId);
      return { blocked: r?.blocked ?? false, reason: r?.blockedReason ?? null };
    }
    return { blocked: false, reason: null };
  }

  const pending = approvals.filter((a) => a.state === "PENDING");
  const decided = approvals.filter((a) => a.state !== "PENDING");

  // Rows whose recorded state contradicts their note — surfaced, not tolerated.
  const inconsistent = approvals
    .map((approval) => ({
      approval,
      warnings: approvalConsistencyWarnings({
        state: approval.state,
        decisionNote: approval.decisionNote,
        subjectBlocked: subjectState(approval.subjectType, approval.subjectId).blocked,
      }),
    }))
    .filter((x) => x.warnings.length > 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Approval queue</h1>
          <p>A person decides, every time. Blocked means blocked.</p>
        </div>
      </div>

      <div className="cc-notice danger">
        <strong>No automated approvals.</strong> Every decision requires the name of the
        person making it, and approval is refused while the subject is blocked — an
        approving note cannot override a block. There is no agent or scheduled path to a
        decision, and nothing here transfers funds, hires, deletes or changes an account.
      </div>

      {inconsistent.length > 0 ? (
        <div className="panel">
          <h2>Contradictions needing reconciliation ({inconsistent.length})</h2>
          <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
            These are exactly the inconsistencies the source base tolerated. They are
            reported here rather than left to sit.
          </p>
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>State</th>
                <th>Problem</th>
              </tr>
            </thead>
            <tbody>
              {inconsistent.map(({ approval, warnings }) => (
                <tr key={approval.id}>
                  <td>
                    <strong>{approval.title}</strong>
                    <div className="subnote cc-mono">
                      {approval.subjectType} {approval.subjectId}
                    </div>
                  </td>
                  <td>
                    <span className="badge amber">{approval.state}</span>
                  </td>
                  <td>
                    <ul className="cc-warnings">
                      {warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="panel">
        <h2>Pending ({pending.length})</h2>
        {pending.length === 0 ? (
          <div className="empty">Nothing awaiting a decision.</div>
        ) : (
          pending.map((approval) => {
            const subject = subjectState(approval.subjectType, approval.subjectId);
            const gate = evaluateApprovalGate({
              state: approval.state,
              decision: "APPROVE",
              decidedBy: "preview",
              decisionNote: approval.decisionNote,
              subjectBlocked: subject.blocked,
              subjectBlockedReason: subject.reason,
              actorIsHuman: true,
            });

            return (
              <div
                key={approval.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 16,
                  marginTop: 16,
                }}
              >
                <div className="section-title">
                  <h2 style={{ fontSize: 16 }}>{approval.title}</h2>
                  <span className={`badge ${subject.blocked ? "red" : "blue"}`}>
                    {subject.blocked ? "SUBJECT BLOCKED" : "READY TO DECIDE"}
                  </span>
                </div>
                <p className="subnote">
                  <span className="cc-mono">
                    {approval.subjectType} {approval.subjectId}
                  </span>{" "}
                  · requested by {approval.requestedBy}
                  {approval.amountCents != null
                    ? ` · ${formatCents(approval.amountCents)}`
                    : ""}
                </p>

                {approval.decisionNote ? (
                  <p className="subnote">
                    Existing note on file: &ldquo;{approval.decisionNote}&rdquo;
                  </p>
                ) : null}

                {!gate.allowed ? (
                  <div className="cc-notice danger">
                    <strong>Approval is gated.</strong>
                    <ul className="cc-warnings">
                      {gate.blockers
                        .filter((b) => !/name of the person/i.test(b))
                        .map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      {gate.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                    {subject.blocked && approval.subjectType === "JOB" ? (
                      <form action={clearJobBlockAction} className="inline-form">
                        <input type="hidden" name="sourceId" value={approval.subjectId} />
                        <input type="hidden" name="division" value={approval.division} />
                        <button className="btn ghost small" type="submit">
                          Clear the block first
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}

                <form action={decideApprovalAction} className="grid">
                  <input type="hidden" name="id" value={approval.id} />
                  <div className="field">
                    <label>Decided by (a person) *</label>
                    <input name="decidedBy" required placeholder="Name of the decider" />
                  </div>
                  <div className="field">
                    <label>Decision note</label>
                    <input name="decisionNote" />
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn"
                      type="submit"
                      name="decision"
                      value="APPROVE"
                      disabled={subject.blocked}
                    >
                      Approve
                    </button>
                    <button
                      className="btn ghost"
                      type="submit"
                      name="decision"
                      value="REJECT"
                    >
                      Reject
                    </button>
                  </div>
                </form>
              </div>
            );
          })
        )}
      </div>

      <div className="panel">
        <h2>Decided ({decided.length})</h2>
        {decided.length === 0 ? (
          <div className="empty">Nothing decided yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Request</th>
                <th>State</th>
                <th>Decided by</th>
                <th>When</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((approval) => (
                <tr key={approval.id}>
                  <td>
                    <strong>{approval.title}</strong>
                    <div className="subnote cc-mono">
                      {approval.subjectType} {approval.subjectId}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        approval.state === "APPROVED" ? "green" : "red"
                      }`}
                    >
                      {approval.state}
                    </span>
                  </td>
                  <td>{approval.decidedBy ?? <span className="muted">—</span>}</td>
                  <td>{formatDate(approval.decidedAt)}</td>
                  <td>{approval.decisionNote ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Audit history ({audit.length})</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          Append-only. Refusals are recorded as well as decisions, so a gate that blocked
          something leaves a trace.
        </p>
        {audit.length === 0 ? (
          <div className="empty">No audit events yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Subject</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((event) => (
                <tr key={event.id}>
                  <td>
                    {formatDate(event.at)}
                    <div className="subnote">
                      {event.at.toISOString().slice(11, 19)}Z
                    </div>
                  </td>
                  <td>
                    {event.actor}
                    <div className="subnote">
                      <span
                        className={`badge ${event.actorKind === "HUMAN" ? "green" : ""}`}
                      >
                        {event.actorKind}
                      </span>
                    </div>
                  </td>
                  <td className="cc-mono">{event.action}</td>
                  <td className="cc-mono">
                    {event.subjectId ?? <span className="muted">—</span>}
                  </td>
                  <td>{event.detail ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
