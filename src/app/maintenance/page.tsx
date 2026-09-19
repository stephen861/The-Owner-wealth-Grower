import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  daysUntil,
  formatCurrency,
  formatDate,
  labelFor,
  OPEN_WORK_ORDER_STATUS,
  WORK_ORDER_CATEGORIES,
  WORK_ORDER_PRIORITY,
  WORK_ORDER_STATUS,
} from "@/lib/format";
import {
  completeWorkOrder,
  createWorkOrder,
  deleteWorkOrder,
  updateWorkOrderStatus,
} from "@/lib/pm-actions";

export const dynamic = "force-dynamic";

const PRIORITY_RANK: Record<string, number> = {
  EMERGENCY: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

export default async function MaintenancePage() {
  const [workOrders, properties, vendors] = await Promise.all([
    prisma.workOrder.findMany({
      orderBy: { reportedAt: "desc" },
      include: { property: true, unit: true, vendor: true },
    }),
    prisma.property.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { units: { orderBy: { label: "asc" } } },
    }),
    prisma.vendor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  const open = workOrders
    .filter((w) => OPEN_WORK_ORDER_STATUS.includes(w.status))
    .sort(
      (a, b) =>
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
        a.reportedAt.getTime() - b.reportedAt.getTime(),
    );
  const closed = workOrders.filter((w) => !OPEN_WORK_ORDER_STATUS.includes(w.status));

  const emergencies = open.filter((w) => w.priority === "EMERGENCY");
  const unassigned = open.filter((w) => !w.vendorId);
  const committed = open.reduce((s, w) => s + (w.estimatedCost ?? 0), 0);
  const spent = closed.reduce((s, w) => s + (w.actualCost ?? 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Maintenance</h1>
          <p>Work orders, who is on them, and what they cost.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Open work orders</div>
          <div className="value">{open.length}</div>
          <div className="sub">{unassigned.length} unassigned</div>
        </div>
        <div className="card">
          <div className="label">Emergencies</div>
          <div className="value">{emergencies.length}</div>
          <div className="sub">{emergencies.length > 0 ? "Dispatch now" : "All clear"}</div>
        </div>
        <div className="card">
          <div className="label">Committed spend</div>
          <div className="value">{formatCurrency(committed)}</div>
          <div className="sub">Estimated, still open</div>
        </div>
        <div className="card">
          <div className="label">Completed spend</div>
          <div className="value">{formatCurrency(spent)}</div>
          <div className="sub">{closed.length} closed</div>
        </div>
      </div>

      <div className="panel">
        <h2>Open queue ({open.length})</h2>
        {open.length === 0 ? (
          <div className="empty">Nothing open. 🎉</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Work order</th>
                <th>Where</th>
                <th>Vendor</th>
                <th>Priority</th>
                <th>Age</th>
                <th>Status</th>
                <th>Close out</th>
              </tr>
            </thead>
            <tbody>
              {open.map((w) => {
                const age = Math.abs(daysUntil(w.reportedAt) ?? 0);
                return (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.title}</strong>
                      <div className="subnote">
                        {labelFor(WORK_ORDER_CATEGORIES, w.category)}
                        {w.billToTenant ? " · rebills tenant" : ""}
                      </div>
                    </td>
                    <td>
                      <Link href={`/properties/${w.propertyId}`} className="link">
                        {w.property.name}
                      </Link>
                      {w.unit ? <div className="subnote">Unit {w.unit.label}</div> : null}
                    </td>
                    <td>
                      {w.vendor?.name ?? <span className="badge amber">Unassigned</span>}
                      {w.scheduledFor ? (
                        <div className="subnote">{formatDate(w.scheduledFor)}</div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          w.priority === "EMERGENCY"
                            ? "red"
                            : w.priority === "HIGH"
                              ? "amber"
                              : ""
                        }`}
                      >
                        {labelFor(WORK_ORDER_PRIORITY, w.priority)}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${age > 14 ? "red" : age > 5 ? "amber" : ""}`}>
                        {age}d
                      </span>
                    </td>
                    <td>
                      <form action={updateWorkOrderStatus} className="stage-form">
                        <input type="hidden" name="id" value={w.id} />
                        <select name="status" defaultValue={w.status}>
                          {WORK_ORDER_STATUS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <button className="btn small ghost" type="submit">
                          ✓
                        </button>
                      </form>
                    </td>
                    <td>
                      <form action={completeWorkOrder} className="stage-form">
                        <input type="hidden" name="id" value={w.id} />
                        <input
                          name="actualCost"
                          type="number"
                          step="0.01"
                          placeholder="Cost"
                          defaultValue={w.estimatedCost ?? ""}
                          style={{ width: 90, padding: "4px 6px", fontSize: 12 }}
                        />
                        <button className="btn small" type="submit" title="Complete & book expense">
                          Done
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="subnote" style={{ marginTop: 12 }}>
          &ldquo;Done&rdquo; closes the work order, books the cost as a property expense,
          and rebills the tenant when the order was flagged billable.
        </p>
      </div>

      <div className="panel">
        <h2>Open a work order</h2>
        {properties.length === 0 ? (
          <div className="empty">
            Add a property first. <Link href="/properties">Go to properties</Link>
          </div>
        ) : (
          <form action={createWorkOrder} className="grid">
            <div className="field">
              <label>Property *</label>
              <select name="propertyId" required defaultValue="">
                <option value="" disabled>
                  — Select —
                </option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Unit</label>
              <select name="unitId" defaultValue="">
                <option value="">— Whole property —</option>
                {properties.flatMap((p) =>
                  p.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {p.name} — {u.label}
                    </option>
                  )),
                )}
              </select>
            </div>
            <div className="field">
              <label>Title *</label>
              <input name="title" required placeholder="No hot water in unit 2" />
            </div>
            <div className="field">
              <label>Category</label>
              <select name="category" defaultValue="GENERAL">
                {WORK_ORDER_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Priority</label>
              <select name="priority" defaultValue="NORMAL">
                {WORK_ORDER_PRIORITY.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Assign vendor</label>
              <select name="vendorId" defaultValue="">
                <option value="">— Unassigned —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Scheduled for</label>
              <input name="scheduledFor" type="date" />
            </div>
            <div className="field">
              <label>Estimated cost</label>
              <input name="estimatedCost" type="number" step="0.01" />
            </div>
            <div className="field">
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input name="billToTenant" type="checkbox" style={{ width: "auto" }} />
                Rebill tenant on completion
              </label>
            </div>
            <div className="field full">
              <label>Description</label>
              <textarea name="description" />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">
                Open work order
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>Closed ({closed.length})</h2>
        {closed.length === 0 ? (
          <div className="empty">Nothing closed yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Work order</th>
                <th>Where</th>
                <th>Vendor</th>
                <th>Completed</th>
                <th className="right">Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {closed.slice(0, 25).map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong>{w.title}</strong>
                    <div className="subnote">
                      {labelFor(WORK_ORDER_STATUS, w.status)}
                    </div>
                  </td>
                  <td>
                    {w.property.name}
                    {w.unit ? <div className="subnote">Unit {w.unit.label}</div> : null}
                  </td>
                  <td>{w.vendor?.name ?? <span className="muted">—</span>}</td>
                  <td>{formatDate(w.completedAt)}</td>
                  <td className="right">{formatCurrency(w.actualCost)}</td>
                  <td className="right">
                    <form action={deleteWorkOrder} className="inline-form">
                      <input type="hidden" name="id" value={w.id} />
                      <button className="btn danger small" type="submit">
                        ✕
                      </button>
                    </form>
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
