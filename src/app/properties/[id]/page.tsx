import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  contactName,
  formatCurrency,
  formatDate,
  labelFor,
  leaseBalance,
  propertyAddress,
  toDateInput,
  EXPENSE_CATEGORIES,
  LEASE_STATUS,
  OPEN_WORK_ORDER_STATUS,
  PROPERTY_TYPES,
  UNIT_STATUS,
  WORK_ORDER_CATEGORIES,
  WORK_ORDER_PRIORITY,
  WORK_ORDER_STATUS,
} from "@/lib/format";
import {
  createExpense,
  createUnit,
  createWorkOrder,
  deleteExpense,
  deleteProperty,
  deleteUnit,
  updateProperty,
  updateUnitStatus,
  updateWorkOrderStatus,
} from "@/lib/pm-actions";

export const dynamic = "force-dynamic";

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [property, owners, vendors] = await Promise.all([
    prisma.property.findUnique({
      where: { id },
      include: {
        owner: true,
        units: {
          orderBy: { label: "asc" },
          include: {
            leases: {
              orderBy: { startDate: "desc" },
              include: { tenant: true, charges: true, payments: true },
            },
          },
        },
        workOrders: {
          orderBy: [{ status: "asc" }, { reportedAt: "desc" }],
          include: { vendor: true, unit: true },
        },
        expenses: { orderBy: { paidAt: "desc" }, include: { vendor: true } },
      },
    }),
    prisma.contact.findMany({
      where: { type: { in: ["OWNER", "CLIENT", "PARTNER"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.vendor.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  if (!property) notFound();

  const units = property.units;
  const occupied = units.filter((u) => u.status === "OCCUPIED").length;
  const occupancy = units.length === 0 ? 0 : Math.round((occupied / units.length) * 100);

  const activeLeases = units.flatMap((u) =>
    u.leases.filter((l) => l.status === "ACTIVE" || l.status === "NOTICE"),
  );
  const scheduledRent = activeLeases.reduce((s, l) => s + l.rentAmount, 0);
  const outstanding = activeLeases.reduce((s, l) => s + Math.max(0, leaseBalance(l)), 0);

  const collected = units
    .flatMap((u) => u.leases)
    .flatMap((l) => l.payments)
    .reduce((s, p) => s + p.amount, 0);
  const spent = property.expenses.reduce((s, e) => s + e.amount, 0);
  const openWorkOrders = property.workOrders.filter((w) =>
    OPEN_WORK_ORDER_STATUS.includes(w.status),
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{property.name}</h1>
          <p>
            {labelFor(PROPERTY_TYPES, property.type)}
            {propertyAddress(property) ? ` · ${propertyAddress(property)}` : ""}
          </p>
        </div>
        <div className="filters">
          <Link className="btn ghost small" href="/properties">
            ← All properties
          </Link>
          <form action={deleteProperty} className="inline-form">
            <input type="hidden" name="id" value={property.id} />
            <button className="btn danger small" type="submit">
              Delete property
            </button>
          </form>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Occupancy</div>
          <div className="value">{occupancy}%</div>
          <div className="sub">
            {occupied} of {units.length} units
          </div>
        </div>
        <div className="card">
          <div className="label">Scheduled rent</div>
          <div className="value">{formatCurrency(scheduledRent)}</div>
          <div className="sub">Per month, active leases</div>
        </div>
        <div className="card">
          <div className="label">Tenant balance owed</div>
          <div className="value">{formatCurrency(outstanding)}</div>
          <div className="sub">{outstanding > 0 ? "Chase this" : "All current"}</div>
        </div>
        <div className="card">
          <div className="label">Net to date</div>
          <div className="value">{formatCurrency(collected - spent)}</div>
          <div className="sub">
            {formatCurrency(collected)} in − {formatCurrency(spent)} out
          </div>
        </div>
        <div className="card">
          <div className="label">Open work orders</div>
          <div className="value">{openWorkOrders.length}</div>
          <div className="sub">
            {openWorkOrders.filter((w) => w.priority === "EMERGENCY").length} emergency
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Units ({units.length})</h2>
        {units.length === 0 ? (
          <div className="empty">No units yet — add one below.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Beds / baths</th>
                <th>Tenant</th>
                <th className="right">Rent</th>
                <th className="right">Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const lease = u.leases.find(
                  (l) => l.status === "ACTIVE" || l.status === "NOTICE",
                );
                const balance = lease ? leaseBalance(lease) : 0;
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.label}</strong>
                      {u.sqft ? <div className="subnote">{u.sqft} sq ft</div> : null}
                    </td>
                    <td>
                      {u.beds} bd / {u.baths} ba
                    </td>
                    <td>
                      {lease ? (
                        <>
                          <Link href={`/leases/${lease.id}`} className="link">
                            {contactName(lease.tenant)}
                          </Link>
                          <div className="subnote">
                            {labelFor(LEASE_STATUS, lease.status)} · through{" "}
                            {formatDate(lease.endDate)}
                          </div>
                        </>
                      ) : (
                        <span className="muted">Vacant</span>
                      )}
                    </td>
                    <td className="right">
                      {formatCurrency(lease ? lease.rentAmount : u.marketRent)}
                      {!lease ? <div className="subnote">market</div> : null}
                    </td>
                    <td className="right">
                      {balance > 0 ? (
                        <span className="badge red">{formatCurrency(balance)}</span>
                      ) : balance < 0 ? (
                        <span className="badge green">
                          {formatCurrency(Math.abs(balance))} credit
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <form action={updateUnitStatus} className="stage-form">
                        <input type="hidden" name="id" value={u.id} />
                        <select name="status" defaultValue={u.status}>
                          {UNIT_STATUS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <button className="btn small ghost" type="submit" title="Update">
                          ✓
                        </button>
                      </form>
                    </td>
                    <td className="right">
                      <form action={deleteUnit} className="inline-form">
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn danger small" type="submit">
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <h2 style={{ marginTop: 24 }}>Add a unit</h2>
        <form action={createUnit} className="grid">
          <input type="hidden" name="propertyId" value={property.id} />
          <div className="field">
            <label>Unit label *</label>
            <input name="label" required placeholder="101" />
          </div>
          <div className="field">
            <label>Beds</label>
            <input name="beds" type="number" step="0.5" defaultValue={2} />
          </div>
          <div className="field">
            <label>Baths</label>
            <input name="baths" type="number" step="0.5" defaultValue={1} />
          </div>
          <div className="field">
            <label>Square feet</label>
            <input name="sqft" type="number" />
          </div>
          <div className="field">
            <label>Market rent</label>
            <input name="marketRent" type="number" step="0.01" defaultValue={0} />
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue="VACANT">
              {UNIT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add unit
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Work orders ({property.workOrders.length})</h2>
          <Link className="btn ghost small" href="/maintenance">
            All maintenance
          </Link>
        </div>
        {property.workOrders.length === 0 ? (
          <div className="empty">No work orders on this property.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Work order</th>
                <th>Unit</th>
                <th>Vendor</th>
                <th>Priority</th>
                <th className="right">Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {property.workOrders.map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong>{w.title}</strong>
                    <div className="subnote">
                      {labelFor(WORK_ORDER_CATEGORIES, w.category)} · reported{" "}
                      {formatDate(w.reportedAt)}
                    </div>
                  </td>
                  <td>{w.unit?.label ?? <span className="muted">Property</span>}</td>
                  <td>{w.vendor?.name ?? <span className="muted">Unassigned</span>}</td>
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
                  <td className="right">
                    {formatCurrency(w.actualCost ?? w.estimatedCost)}
                    {w.actualCost == null ? <div className="subnote">est.</div> : null}
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
                      <button className="btn small ghost" type="submit" title="Update">
                        ✓
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h2 style={{ marginTop: 24 }}>Open a work order</h2>
        <form action={createWorkOrder} className="grid">
          <input type="hidden" name="propertyId" value={property.id} />
          <div className="field">
            <label>Title *</label>
            <input name="title" required placeholder="Kitchen faucet leaking" />
          </div>
          <div className="field">
            <label>Unit</label>
            <select name="unitId" defaultValue="">
              <option value="">— Whole property —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
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
      </div>

      <div className="panel">
        <h2>Expenses ({property.expenses.length})</h2>
        {property.expenses.length === 0 ? (
          <div className="empty">No expenses booked yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Vendor</th>
                <th className="right">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {property.expenses.slice(0, 20).map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.paidAt)}</td>
                  <td>{labelFor(EXPENSE_CATEGORIES, e.category)}</td>
                  <td>{e.description ?? <span className="muted">—</span>}</td>
                  <td>{e.vendor?.name ?? <span className="muted">—</span>}</td>
                  <td className="right">{formatCurrency(e.amount)}</td>
                  <td className="right">
                    <form action={deleteExpense} className="inline-form">
                      <input type="hidden" name="id" value={e.id} />
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

        <h2 style={{ marginTop: 24 }}>Book an expense</h2>
        <form action={createExpense} className="grid">
          <input type="hidden" name="propertyId" value={property.id} />
          <div className="field">
            <label>Category</label>
            <select name="category" defaultValue="REPAIRS">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Amount *</label>
            <input name="amount" type="number" step="0.01" required />
          </div>
          <div className="field">
            <label>Paid on *</label>
            <input name="paidAt" type="date" required />
          </div>
          <div className="field">
            <label>Unit</label>
            <select name="unitId" defaultValue="">
              <option value="">— Whole property —</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Vendor</label>
            <select name="vendorId" defaultValue="">
              <option value="">— None —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <input name="description" placeholder="Water heater replacement" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Book expense
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Property details</h2>
        <form action={updateProperty} className="grid">
          <input type="hidden" name="id" value={property.id} />
          <div className="field">
            <label>Name *</label>
            <input name="name" required defaultValue={property.name} />
          </div>
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue={property.type}>
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <select name="ownerId" defaultValue={property.ownerId ?? ""}>
              <option value="">— I own it —</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {contactName(o)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Street address</label>
            <input name="addressLine1" defaultValue={property.addressLine1 ?? ""} />
          </div>
          <div className="field">
            <label>City</label>
            <input name="city" defaultValue={property.city ?? ""} />
          </div>
          <div className="field">
            <label>State</label>
            <input name="state" defaultValue={property.state ?? ""} />
          </div>
          <div className="field">
            <label>ZIP</label>
            <input name="zip" defaultValue={property.zip ?? ""} />
          </div>
          <div className="field">
            <label>Management fee (%)</label>
            <input
              name="managementFeeRate"
              type="number"
              step="0.1"
              defaultValue={property.managementFeeRate}
            />
          </div>
          <div className="field">
            <label>Purchase date</label>
            <input
              name="purchaseDate"
              type="date"
              defaultValue={toDateInput(property.purchaseDate)}
            />
          </div>
          <div className="field">
            <label>Purchase price</label>
            <input
              name="purchasePrice"
              type="number"
              step="0.01"
              defaultValue={property.purchasePrice ?? ""}
            />
          </div>
          <div className="field">
            <label>Market value</label>
            <input
              name="marketValue"
              type="number"
              step="0.01"
              defaultValue={property.marketValue ?? ""}
            />
          </div>
          <div className="field">
            <label>Mortgage balance</label>
            <input
              name="mortgageBalance"
              type="number"
              step="0.01"
              defaultValue={property.mortgageBalance ?? ""}
            />
          </div>
          <div className="field">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                name="active"
                type="checkbox"
                defaultChecked={property.active}
                style={{ width: "auto" }}
              />
              Active in portfolio
            </label>
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea name="notes" defaultValue={property.notes ?? ""} />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
