import { prisma } from "@/lib/prisma";
import { daysUntil, formatDate, OPEN_WORK_ORDER_STATUS } from "@/lib/format";
import { filterByDivision } from "@/lib/command-center/domain";
import { formatCents, readDivision } from "@/lib/command-center/view";

export const dynamic = "force-dynamic";

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);
  const all = await prisma.demoWorkOrder.findMany({
    orderBy: [{ status: "asc" }, { reportedAt: "desc" }],
    include: { property: true },
  });
  const workOrders = filterByDivision(all, division);
  const open = workOrders.filter((w) => OPEN_WORK_ORDER_STATUS.includes(w.status));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Work orders</h1>
          <p>Every row carries its source ID, so a re-import cannot duplicate it.</p>
        </div>
      </div>

      <div className="cc-notice info">
        <strong>Source ID is part of the record.</strong> The pair{" "}
        <span className="cc-mono">(division, sourceId)</span> is unique in the database, so
        importing the same row twice is refused rather than silently creating a second
        copy. Duplicates are reported on the Modules &amp; import screen.
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Open</div>
          <div className="value">{open.length}</div>
        </div>
        <div className="card">
          <div className="label">Emergency</div>
          <div className="value">
            {open.filter((w) => w.priority === "EMERGENCY").length}
          </div>
        </div>
        <div className="card">
          <div className="label">Blocked</div>
          <div className="value">{open.filter((w) => w.blocked).length}</div>
        </div>
        <div className="card">
          <div className="label">Complete</div>
          <div className="value">
            {workOrders.filter((w) => w.status === "COMPLETE").length}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Work orders ({workOrders.length})</h2>
        {workOrders.length === 0 ? (
          <div className="empty">No work orders in this filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source ID</th>
                <th>Work order</th>
                <th>Property</th>
                <th>Priority</th>
                <th>Age</th>
                <th className="right">Estimate / actual</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => {
                const age = Math.abs(daysUntil(wo.reportedAt) ?? 0);
                return (
                  <tr key={wo.id}>
                    <td className="cc-mono">{wo.sourceId}</td>
                    <td>
                      <strong>{wo.title}</strong>
                      <div className="subnote">{wo.category}</div>
                      {wo.blocked ? (
                        <div className="subnote">
                          <span className="badge red">Blocked</span> {wo.blockedReason}
                        </div>
                      ) : null}
                    </td>
                    <td className="cc-mono">
                      {wo.property?.sourceId ?? <span className="muted">detached</span>}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          wo.priority === "EMERGENCY"
                            ? "red"
                            : wo.priority === "HIGH"
                              ? "amber"
                              : ""
                        }`}
                      >
                        {wo.priority}
                      </span>
                    </td>
                    <td>
                      {wo.status === "COMPLETE" ? (
                        <span className="muted">{formatDate(wo.completedAt)}</span>
                      ) : (
                        <span className={`badge ${age > 14 ? "red" : age > 5 ? "amber" : ""}`}>
                          {age}d
                        </span>
                      )}
                    </td>
                    <td className="right">
                      {formatCents(wo.estimateCents)}
                      {wo.actualCents != null ? (
                        <div className="subnote">actual {formatCents(wo.actualCents)}</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`badge ${wo.status === "COMPLETE" ? "green" : "blue"}`}
                      >
                        {wo.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
