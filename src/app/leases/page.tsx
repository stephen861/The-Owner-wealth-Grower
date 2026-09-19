import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  contactName,
  daysUntil,
  formatCurrency,
  formatDate,
  formatPeriod,
  labelFor,
  leaseBalance,
  periodKey,
  LEASE_STATUS,
} from "@/lib/format";
import { assessLateFees, createLease, postMonthlyRent } from "@/lib/pm-actions";

export const dynamic = "force-dynamic";

export default async function LeasesPage() {
  const period = periodKey();

  const [leases, vacantUnits, tenants] = await Promise.all([
    prisma.lease.findMany({
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      include: {
        tenant: true,
        unit: { include: { property: true } },
        charges: true,
        payments: true,
      },
    }),
    prisma.unit.findMany({
      where: { status: { in: ["VACANT", "NOTICE"] } },
      orderBy: [{ property: { name: "asc" } }, { label: "asc" }],
      include: { property: true },
    }),
    prisma.contact.findMany({
      where: { type: { in: ["TENANT", "LEAD", "CLIENT"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);

  const active = leases.filter((l) => l.status === "ACTIVE" || l.status === "NOTICE");
  const scheduledRent = active.reduce((s, l) => s + l.rentAmount, 0);

  // This month's collection performance across the whole book.
  const billedThisPeriod = leases
    .flatMap((l) => l.charges)
    .filter((c) => c.period === period)
    .reduce((s, c) => s + c.amount, 0);
  const collectedThisPeriod = leases
    .flatMap((l) => l.payments)
    .filter((p) => periodKey(p.receivedAt) === period)
    .reduce((s, p) => s + p.amount, 0);
  const collectionRate =
    billedThisPeriod === 0 ? 0 : Math.round((collectedThisPeriod / billedThisPeriod) * 100);

  const delinquent = active
    .map((l) => ({ lease: l, balance: leaseBalance(l) }))
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const totalDelinquent = delinquent.reduce((s, d) => s + d.balance, 0);

  const alreadyPosted = leases.some((l) =>
    l.charges.some((c) => c.period === period && c.type === "RENT"),
  );

  const expiring = active.filter((l) => {
    const d = daysUntil(l.endDate);
    return d != null && d <= 90;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Rent roll</h1>
          <p>Every lease, what it bills, and who is behind.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Active leases</div>
          <div className="value">{active.length}</div>
          <div className="sub">{leases.length} total on file</div>
        </div>
        <div className="card">
          <div className="label">Scheduled rent</div>
          <div className="value">{formatCurrency(scheduledRent)}</div>
          <div className="sub">Per month</div>
        </div>
        <div className="card">
          <div className="label">Collected {formatPeriod(period)}</div>
          <div className="value">{collectionRate}%</div>
          <div className="sub">
            {formatCurrency(collectedThisPeriod)} of {formatCurrency(billedThisPeriod)}
          </div>
        </div>
        <div className="card">
          <div className="label">Delinquent</div>
          <div className="value">{formatCurrency(totalDelinquent)}</div>
          <div className="sub">{delinquent.length} leases behind</div>
        </div>
        <div className="card">
          <div className="label">Expiring ≤ 90 days</div>
          <div className="value">{expiring.length}</div>
          <div className="sub">Start renewals now</div>
        </div>
      </div>

      <div className="panel">
        <h2>Month-end run</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 14 }}>
          Both actions are safe to run twice — a lease already billed for{" "}
          {formatPeriod(period)} is skipped.
        </p>
        <div className="filters">
          <form action={postMonthlyRent} className="inline-form">
            <input type="hidden" name="period" value={period} />
            <button className="btn" type="submit">
              Post {formatPeriod(period)} rent to all active leases
            </button>
          </form>
          <form action={assessLateFees} className="inline-form">
            <input type="hidden" name="period" value={period} />
            <button className="btn ghost" type="submit">
              Assess late fees
            </button>
          </form>
          {alreadyPosted ? (
            <span className="badge green">{formatPeriod(period)} rent posted</span>
          ) : (
            <span className="badge amber">{formatPeriod(period)} rent not posted yet</span>
          )}
        </div>
      </div>

      {delinquent.length > 0 ? (
        <div className="panel">
          <h2>Delinquency ({delinquent.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th className="right">Monthly rent</th>
                <th className="right">Balance owed</th>
                <th className="right">Months behind</th>
              </tr>
            </thead>
            <tbody>
              {delinquent.map(({ lease: l, balance }) => {
                const months = l.rentAmount > 0 ? balance / l.rentAmount : 0;
                return (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/leases/${l.id}`}>
                        <strong>{contactName(l.tenant)}</strong>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/properties/${l.unit.propertyId}`} className="link">
                        {l.unit.property.name}
                      </Link>
                      <div className="subnote">Unit {l.unit.label}</div>
                    </td>
                    <td className="right">{formatCurrency(l.rentAmount)}</td>
                    <td className="right">
                      <span className="badge red">{formatCurrency(balance)}</span>
                    </td>
                    <td className="right">
                      <span className={`badge ${months >= 2 ? "red" : "amber"}`}>
                        {months.toFixed(1)}×
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="panel">
        <h2>All leases ({leases.length})</h2>
        {leases.length === 0 ? (
          <div className="empty">No leases yet. Sign one below.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Property / unit</th>
                <th>Term</th>
                <th className="right">Rent</th>
                <th className="right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leases.map((l) => {
                const balance = leaseBalance(l);
                const d = daysUntil(l.endDate);
                return (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/leases/${l.id}`}>
                        <strong>{contactName(l.tenant)}</strong>
                      </Link>
                      {l.tenant.phone ? (
                        <div className="subnote">{l.tenant.phone}</div>
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/properties/${l.unit.propertyId}`} className="link">
                        {l.unit.property.name}
                      </Link>
                      <div className="subnote">Unit {l.unit.label}</div>
                    </td>
                    <td>
                      {formatDate(l.startDate)}
                      <div className="subnote">
                        → {formatDate(l.endDate)}
                        {d != null && d >= 0 && d <= 90 ? (
                          <span className="badge amber" style={{ marginLeft: 6 }}>
                            {d}d
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="right">
                      {formatCurrency(l.rentAmount)}
                      <div className="subnote">due day {l.rentDueDay}</div>
                    </td>
                    <td className="right">
                      {balance > 0 ? (
                        <span className="badge red">{formatCurrency(balance)}</span>
                      ) : balance < 0 ? (
                        <span className="badge green">
                          {formatCurrency(Math.abs(balance))} credit
                        </span>
                      ) : (
                        <span className="badge green">Current</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          l.status === "ACTIVE"
                            ? "green"
                            : l.status === "EVICTION"
                              ? "red"
                              : l.status === "NOTICE"
                                ? "amber"
                                : ""
                        }`}
                      >
                        {labelFor(LEASE_STATUS, l.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Sign a lease</h2>
        {vacantUnits.length === 0 || tenants.length === 0 ? (
          <div className="empty">
            {vacantUnits.length === 0
              ? "No vacant units. "
              : "No tenant contacts yet. "}
            <Link href={vacantUnits.length === 0 ? "/properties" : "/contacts"}>
              {vacantUnits.length === 0 ? "Add a property" : "Add a contact"}
            </Link>
          </div>
        ) : (
          <form action={createLease} className="grid">
            <div className="field">
              <label>Unit *</label>
              <select name="unitId" required defaultValue="">
                <option value="" disabled>
                  — Select a vacant unit —
                </option>
                {vacantUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.property.name} — {u.label} ({formatCurrency(u.marketRent)})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Tenant *</label>
              <select name="tenantId" required defaultValue="">
                <option value="" disabled>
                  — Select —
                </option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {contactName(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Start date *</label>
              <input name="startDate" type="date" required />
            </div>
            <div className="field">
              <label>End date</label>
              <input name="endDate" type="date" />
            </div>
            <div className="field">
              <label>Monthly rent *</label>
              <input name="rentAmount" type="number" step="0.01" required />
            </div>
            <div className="field">
              <label>Rent due day</label>
              <input name="rentDueDay" type="number" min={1} max={28} defaultValue={1} />
            </div>
            <div className="field">
              <label>Deposit amount</label>
              <input name="depositAmount" type="number" step="0.01" defaultValue={0} />
            </div>
            <div className="field">
              <label>Deposit held</label>
              <input name="depositHeld" type="number" step="0.01" defaultValue={0} />
            </div>
            <div className="field">
              <label>Late fee</label>
              <input name="lateFeeAmount" type="number" step="0.01" defaultValue={0} />
            </div>
            <div className="field">
              <label>Grace period (days)</label>
              <input name="lateFeeAfterDay" type="number" min={0} defaultValue={5} />
            </div>
            <div className="field">
              <label>Status</label>
              <select name="status" defaultValue="ACTIVE">
                {LEASE_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label>Notes</label>
              <textarea name="notes" />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">
                Sign lease
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
