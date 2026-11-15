import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  assessRevenueEligibility,
  checkInHealth,
  feePosition,
  filterByDivision,
  readinessSummary,
  sumCents,
  REFERRAL_STAGES,
} from "@/lib/command-center/domain";
import { OPEN_WORK_ORDER_STATUS } from "@/lib/format";
import { formatCents, readDivision } from "@/lib/command-center/view";

export const dynamic = "force-dynamic";

export default async function CommandCenterOverview({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);

  const [properties, referrals, workOrders, jobs, tasks, agents, approvals, moneyEntries] =
    await Promise.all([
      prisma.demoProperty.findMany({ include: { checklistItems: true } }),
      prisma.demoReferral.findMany(),
      prisma.demoWorkOrder.findMany(),
      prisma.demoJob.findMany(),
      prisma.demoTask.findMany(),
      prisma.demoAgentCheckIn.findMany(),
      prisma.demoApproval.findMany(),
      prisma.demoMoneyEntry.findMany(),
    ]);

  const p = filterByDivision(properties, division);
  const r = filterByDivision(referrals, division);
  const wo = filterByDivision(workOrders, division);
  const j = filterByDivision(jobs, division);
  const t = filterByDivision(tasks, division);
  const ag = filterByDivision(agents, division);
  const ap = filterByDivision(approvals, division);
  const money = filterByDivision(moneyEntries, division);

  const facilities = p.filter((x) => x.checklistItems.length > 0);
  const readyFacilities = facilities.filter(
    (f) => readinessSummary(f.checklistItems).ready,
  ).length;

  const openWo = wo.filter((x) => OPEN_WORK_ORDER_STATUS.includes(x.status));
  const openTasks = t.filter((x) => x.status !== "DONE" && x.status !== "CANCELLED");
  const pendingApprovals = ap.filter((x) => x.state === "PENDING");
  const blockedItems =
    openWo.filter((x) => x.blocked).length +
    j.filter((x) => x.blocked).length +
    r.filter((x) => x.blocked).length +
    t.filter((x) => x.status === "BLOCKED").length;

  // Fee position per facility, from each facility's own expected amount.
  const feeRows = p
    .filter((x) => x.division === "AFLH")
    .map((facility) => {
      const paid = sumCents(
        money.filter((m) => m.propertyId === facility.id && m.kind === "FEE_PAYMENT"),
        (m) => m.amountCents,
      );
      return { facility, position: feePosition(facility.expectedFeesCents, paid) };
    });

  const totalOwed = sumCents(feeRows, (x) => x.position.owedCents);
  const totalCredit = sumCents(feeRows, (x) => x.position.creditCents);

  // Any record whose typed status and stored flags disagree.
  const mismatches = p.flatMap((facility) => {
    const assessment = assessRevenueEligibility(facility);
    return assessment.warnings.map((w) => ({ code: facility.sourceId, warning: w }));
  });

  const unhealthyAgents = ag
    .map((a) => ({ agent: a, ...checkInHealth(a) }))
    .filter((x) => x.health !== "FRESH");

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>FGW / AFLH Command Center</h1>
          <p>
            Owner overview across {division === "ALL" ? "both divisions" : division}.
            Synthetic prototype.
          </p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Properties & facilities</div>
          <div className="value">{p.length}</div>
          <div className="sub">
            {facilities.length} licensed facilities · {readyFacilities} fully ready
          </div>
        </div>
        <div className="card">
          <div className="label">Blocked items</div>
          <div className="value">{blockedItems}</div>
          <div className="sub">Across work, jobs, referrals and tasks</div>
        </div>
        <div className="card">
          <div className="label">Open work orders</div>
          <div className="value">{openWo.length}</div>
          <div className="sub">
            {openWo.filter((x) => x.priority === "EMERGENCY").length} emergency
          </div>
        </div>
        <div className="card">
          <div className="label">Open tasks</div>
          <div className="value">{openTasks.length}</div>
          <div className="sub">{t.filter((x) => x.status === "BLOCKED").length} blocked</div>
        </div>
        <div className="card">
          <div className="label">Pending approvals</div>
          <div className="value">{pendingApprovals.length}</div>
          <div className="sub">All decided by a person</div>
        </div>
        <div className="card">
          <div className="label">Fees outstanding</div>
          <div className="value">{formatCents(totalOwed)}</div>
          <div className="sub">
            {totalCredit > 0
              ? `${formatCents(totalCredit)} held as credit`
              : "no credit balances"}
          </div>
        </div>
      </div>

      <div className="cc-notice info">
        <strong>Credit is reported separately from debt.</strong> An overpaid facility shows
        a credit balance, never a negative amount owed, and each facility&rsquo;s expected
        fee is its own configurable figure rather than one shared constant.
      </div>

      {mismatches.length > 0 ? (
        <div className="panel">
          <div className="section-title">
            <h2>Status mismatches needing review ({mismatches.length})</h2>
            <Link className="btn ghost small" href="/command-center/readiness">
              Readiness
            </Link>
          </div>
          <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
            A typed status that disagrees with its source string or its revenue flag is
            surfaced here instead of silently producing a zero.
          </p>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Warning</th>
              </tr>
            </thead>
            <tbody>
              {mismatches.map((m, i) => (
                <tr key={`${m.code}-${i}`}>
                  <td className="cc-mono">{m.code}</td>
                  <td>{m.warning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="panel">
        <div className="section-title">
          <h2>Referral pipeline</h2>
          <Link className="btn ghost small" href="/command-center/referrals">
            Open pipeline
          </Link>
        </div>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          Administrative stages only. Nothing here determines clinical admission or
          programme eligibility.
        </p>
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th className="right">Referrals</th>
            </tr>
          </thead>
          <tbody>
            {REFERRAL_STAGES.map((stage) => (
              <tr key={stage.value}>
                <td>{stage.label}</td>
                <td className="right">
                  {r.filter((x) => x.stage === stage.value).length}
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Blocked</strong>
              </td>
              <td className="right">
                <span className={`badge ${r.some((x) => x.blocked) ? "red" : ""}`}>
                  {r.filter((x) => x.blocked).length}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Agent check-ins</h2>
          <Link className="btn ghost small" href="/command-center/agents">
            All agents
          </Link>
        </div>
        {unhealthyAgents.length === 0 ? (
          <div className="empty">Every agent has a recent check-in with evidence.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>State</th>
                <th>Last check-in</th>
                <th>Last evidence</th>
              </tr>
            </thead>
            <tbody>
              {unhealthyAgents.map(({ agent, health, hoursSince }) => (
                <tr key={agent.id}>
                  <td>
                    <strong>{agent.agentName}</strong>
                    <div className="subnote">{agent.scope}</div>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        health === "BLOCKED" || health === "NEVER"
                          ? "red"
                          : health === "STALE"
                            ? "amber"
                            : ""
                      }`}
                    >
                      {health}
                    </span>
                  </td>
                  <td>
                    {agent.lastCheckInAt ? formatDate(agent.lastCheckInAt) : "never"}
                    {hoursSince != null ? (
                      <div className="subnote">{Math.round(hoursSince)}h ago</div>
                    ) : null}
                  </td>
                  <td>
                    {agent.blocked ? (
                      <span className="muted">
                        Blocked: {agent.blockedReason} — any claim in its own note is
                        disregarded.
                      </span>
                    ) : (
                      agent.lastEvidenceNote ?? (
                        <span className="muted">No evidence recorded</span>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Fee position by facility</h2>
        </div>
        {feeRows.length === 0 ? (
          <div className="empty">No licensed facilities in this division filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Facility code</th>
                <th className="right">Expected</th>
                <th className="right">Paid</th>
                <th className="right">Owed</th>
                <th className="right">Credit</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {feeRows.map(({ facility, position }) => (
                <tr key={facility.id}>
                  <td className="cc-mono">{facility.sourceId}</td>
                  <td className="right">{formatCents(position.expectedCents)}</td>
                  <td className="right">{formatCents(position.paidCents)}</td>
                  <td className="right">
                    {position.owedCents > 0 ? (
                      <span className="badge red">{formatCents(position.owedCents)}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="right">
                    {position.creditCents > 0 ? (
                      <span className="badge green">
                        {formatCents(position.creditCents)}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        position.state === "OWED"
                          ? "red"
                          : position.state === "CREDIT"
                            ? "green"
                            : position.state === "NOT_CONFIGURED"
                              ? "amber"
                              : ""
                      }`}
                    >
                      {position.state.replace("_", " ")}
                    </span>
                    {position.warnings.length > 0 ? (
                      <ul className="cc-warnings">
                        {position.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
