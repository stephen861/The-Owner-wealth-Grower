import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  commissionOf,
  contactName,
  daysUntil,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPeriod,
  labelFor,
  leaseBalance,
  nights,
  periodKey,
  weightedCommissionOf,
  ACTIVITY_ICONS,
  DEAL_STAGES,
  EXCHANGE_NETWORKS,
  FEE_TYPES,
  OPEN_STAGES,
  OPEN_WORK_ORDER_STATUS,
  WORK_ORDER_PRIORITY,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();

  const [
    timeshares,
    pointsAccounts,
    reservations,
    fees,
    deposits,
    perks,
    memberships,
    deals,
    openActivities,
    contactCount,
    properties,
    openWorkOrders,
    allPayments,
    allCharges,
  ] = await Promise.all([
    prisma.timeshare.findMany({ where: { active: true } }),
    prisma.pointsAccount.findMany({ where: { useYear: { gte: year } } }),
    prisma.reservation.findMany({
      where: { checkOut: { gte: now }, status: { not: "CANCELLED" } },
      orderBy: { checkIn: "asc" },
      take: 5,
      include: { timeshare: true },
    }),
    prisma.fee.findMany({
      where: { paid: false },
      orderBy: { dueDate: "asc" },
      include: { timeshare: true },
    }),
    prisma.exchangeDeposit.findMany({
      where: { status: "AVAILABLE" },
      orderBy: { expiresAt: "asc" },
      include: { membership: true, timeshare: true },
    }),
    prisma.membershipPerk.findMany({ include: { membership: true } }),
    prisma.exchangeMembership.findMany({ where: { active: true } }),
    prisma.deal.findMany({ include: { contact: true } }),
    prisma.activity.findMany({
      where: { done: false },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: { contact: true },
    }),
    prisma.contact.count(),
    prisma.property.findMany({
      where: { active: true },
      include: {
        units: {
          include: {
            leases: {
              where: { status: { in: ["ACTIVE", "NOTICE"] } },
              include: { tenant: true, charges: true, payments: true },
            },
          },
        },
      },
    }),
    prisma.workOrder.findMany({
      where: { status: { in: OPEN_WORK_ORDER_STATUS } },
      orderBy: { reportedAt: "asc" },
      include: { property: true, unit: true, vendor: true },
    }),
    prisma.payment.findMany({ select: { amount: true, receivedAt: true } }),
    prisma.charge.findMany({ select: { amount: true, period: true } }),
  ]);

  const availablePoints = pointsAccounts.reduce(
    (s, p) => s + (p.allotted + p.banked + p.borrowed - p.used),
    0,
  );
  const annualPoints = timeshares.reduce((s, t) => s + (t.annualPoints ?? 0), 0);
  const outstanding = fees.reduce((s, f) => s + f.amount, 0);
  const expiringDeposits = deposits.filter((d) => {
    const dl = daysUntil(d.expiresAt);
    return dl != null && dl >= 0 && dl <= 90;
  });
  const rewardsBalance = perks.reduce(
    (s, p) => s + Math.max(0, (p.value ?? 0) - p.used),
    0,
  );

  // Property-management metrics: occupancy, collections, delinquency.
  const period = periodKey();
  const allUnits = properties.flatMap((p) => p.units);
  const occupiedUnits = allUnits.filter((u) => u.status === "OCCUPIED").length;
  const occupancy =
    allUnits.length === 0 ? 0 : Math.round((occupiedUnits / allUnits.length) * 100);

  const activeLeases = allUnits.flatMap((u) => u.leases);
  const scheduledRent = activeLeases.reduce((s, l) => s + l.rentAmount, 0);

  const billedThisPeriod = allCharges
    .filter((c) => c.period === period)
    .reduce((s, c) => s + c.amount, 0);
  const collectedThisPeriod = allPayments
    .filter((p) => periodKey(p.receivedAt) === period)
    .reduce((s, p) => s + p.amount, 0);
  const collectionRate =
    billedThisPeriod === 0 ? 0 : Math.round((collectedThisPeriod / billedThisPeriod) * 100);

  const delinquent = properties
    .flatMap((p) =>
      p.units.flatMap((u) =>
        u.leases.map((l) => ({
          lease: l,
          unit: u,
          property: p,
          balance: leaseBalance(l),
        })),
      ),
    )
    .filter((x) => x.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const totalDelinquent = delinquent.reduce((s, d) => s + d.balance, 0);

  // Client-side metrics: what is in flight and what is owed a follow-up.
  const openDeals = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const wonDeals = deals.filter((d) => d.stage === "WON");
  const pipelineValue = openDeals.reduce((s, d) => s + d.value, 0);
  const commissionForecast = openDeals.reduce((s, d) => s + weightedCommissionOf(d), 0);
  const commissionWon = wonDeals.reduce((s, d) => s + commissionOf(d), 0);
  const dueActivities = openActivities.filter((a) => {
    const d = daysUntil(a.dueAt);
    return d != null && d <= 7;
  });
  const overdueActivities = dueActivities.filter((a) => (daysUntil(a.dueAt) ?? 0) < 0);
  const closingSoon = [...openDeals]
    .filter((d) => d.expectedCloseAt)
    .sort((a, b) => a.expectedCloseAt!.getTime() - b.expectedCloseAt!.getTime())
    .slice(0, 6);

  // Unified upcoming-dates feed: membership renewals + reward/credit
  // expirations within the next 120 days, soonest first.
  const WINDOW = 120;
  type RenewalItem = {
    key: string;
    kind: "renewal" | "reward";
    label: string;
    sub: string;
    when: Date;
    days: number;
    amount: number | null;
  };
  const renewals: RenewalItem[] = [];
  for (const m of memberships) {
    const d = daysUntil(m.expiresAt);
    if (m.expiresAt && d != null && d <= WINDOW) {
      renewals.push({
        key: `m-${m.id}`,
        kind: "renewal",
        label: `${m.name} renewal`,
        sub: labelFor(EXCHANGE_NETWORKS, m.network),
        when: m.expiresAt,
        days: d,
        amount: m.membershipFee,
      });
    }
  }
  for (const p of perks) {
    const d = daysUntil(p.expiresAt);
    const remaining = (p.value ?? 0) - p.used;
    if (p.expiresAt && d != null && d <= WINDOW && remaining > 0) {
      renewals.push({
        key: `p-${p.id}`,
        kind: "reward",
        label: `${p.name} expires`,
        sub: p.membership.name,
        when: p.expiresAt,
        days: d,
        amount: remaining,
      });
    }
  }
  renewals.sort((a, b) => a.days - b.days);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Your clients, your pipeline and your portfolio at a glance.</p>
        </div>
        <Link className="btn" href="/properties">
          + Add property
        </Link>
      </div>

      {timeshares.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <p>Welcome to Owner Wealth Grower 🌴</p>
            <p>
              Start by adding your first timeshare to track points, benefits,
              reservations and fees.
            </p>
            <Link className="btn" href="/timeshares/new">
              Add your first timeshare
            </Link>
          </div>
        </div>
      ) : null}

      <h2 className="group-heading">Property management</h2>
      <div className="cards">
        <div className="card">
          <div className="label">Occupancy</div>
          <div className="value">{occupancy}%</div>
          <div className="sub">
            {occupiedUnits} of {allUnits.length} units · {properties.length} properties
          </div>
        </div>
        <div className="card">
          <div className="label">Scheduled rent</div>
          <div className="value">{formatCurrency(scheduledRent)}</div>
          <div className="sub">Per month, {activeLeases.length} active leases</div>
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
          <div className="label">Open work orders</div>
          <div className="value">{openWorkOrders.length}</div>
          <div className="sub">
            {openWorkOrders.filter((w) => w.priority === "EMERGENCY").length} emergency ·{" "}
            {openWorkOrders.filter((w) => !w.vendorId).length} unassigned
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Who owes you money</h2>
          <Link className="btn ghost small" href="/leases">
            Rent roll
          </Link>
        </div>
        {delinquent.length === 0 ? (
          <div className="empty">Every tenant is current. 🎉</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Unit</th>
                <th className="right">Monthly rent</th>
                <th className="right">Balance</th>
                <th className="right">Months behind</th>
              </tr>
            </thead>
            <tbody>
              {delinquent.slice(0, 8).map(({ lease, unit, property, balance }) => {
                const months = lease.rentAmount > 0 ? balance / lease.rentAmount : 0;
                return (
                  <tr key={lease.id}>
                    <td>
                      <Link href={`/leases/${lease.id}`}>
                        <strong>{contactName(lease.tenant)}</strong>
                      </Link>
                      {lease.tenant.phone ? (
                        <div className="subnote">{lease.tenant.phone}</div>
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/properties/${property.id}`} className="link">
                        {property.name}
                      </Link>
                      <div className="subnote">Unit {unit.label}</div>
                    </td>
                    <td className="right">{formatCurrency(lease.rentAmount)}</td>
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
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Work orders needing attention</h2>
          <Link className="btn ghost small" href="/maintenance">
            All maintenance
          </Link>
        </div>
        {openWorkOrders.length === 0 ? (
          <div className="empty">No open work orders.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Work order</th>
                <th>Where</th>
                <th>Vendor</th>
                <th>Priority</th>
                <th className="right">Age</th>
              </tr>
            </thead>
            <tbody>
              {openWorkOrders.slice(0, 6).map((w) => {
                const age = Math.abs(daysUntil(w.reportedAt) ?? 0);
                return (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.title}</strong>
                    </td>
                    <td>
                      <Link href={`/properties/${w.propertyId}`} className="link">
                        {w.property.name}
                      </Link>
                      {w.unit ? <div className="subnote">Unit {w.unit.label}</div> : null}
                    </td>
                    <td>
                      {w.vendor?.name ?? <span className="badge amber">Unassigned</span>}
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
                    <td className="right">
                      <span className={`badge ${age > 14 ? "red" : age > 5 ? "amber" : ""}`}>
                        {age}d
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="group-heading">Revenue engine</h2>
      <div className="cards">
        <div className="card">
          <div className="label">Open pipeline</div>
          <div className="value">{formatCurrency(pipelineValue)}</div>
          <div className="sub">{openDeals.length} live deals</div>
        </div>
        <div className="card">
          <div className="label">Commission forecast</div>
          <div className="value">{formatCurrency(commissionForecast)}</div>
          <div className="sub">Weighted by probability</div>
        </div>
        <div className="card">
          <div className="label">Commission won</div>
          <div className="value">{formatCurrency(commissionWon)}</div>
          <div className="sub">{wonDeals.length} closed-won deals</div>
        </div>
        <div className="card">
          <div className="label">Follow-ups due</div>
          <div className="value">{dueActivities.length}</div>
          <div className="sub">
            {overdueActivities.length > 0
              ? `${overdueActivities.length} overdue`
              : "next 7 days"}
          </div>
        </div>
        <div className="card">
          <div className="label">Contacts</div>
          <div className="value">{contactCount}</div>
          <div className="sub">In your book of business</div>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Follow-ups due</h2>
          <Link className="btn ghost small" href="/activities">
            All activities
          </Link>
        </div>
        {dueActivities.length === 0 ? (
          <div className="empty">Nothing due in the next 7 days. 🎉</div>
        ) : (
          <div className="timeline">
            {dueActivities.slice(0, 8).map((a) => {
              const d = daysUntil(a.dueAt);
              return (
                <div key={a.id} className="timeline-item">
                  <span className="timeline-icon">{ACTIVITY_ICONS[a.type] ?? "📝"}</span>
                  <div className="timeline-body">
                    <strong>{a.subject}</strong>
                    <div className="subnote">
                      {a.contact ? (
                        <Link href={`/contacts/${a.contact.id}`} className="link">
                          {contactName(a.contact)}
                        </Link>
                      ) : (
                        "No contact"
                      )}
                      {" · due "}
                      {formatDate(a.dueAt)}
                    </div>
                  </div>
                  <div className="timeline-actions">
                    <span
                      className={`badge ${
                        d != null && d < 0 ? "red" : d === 0 ? "amber" : "blue"
                      }`}
                    >
                      {d != null && d < 0
                        ? `${Math.abs(d)}d overdue`
                        : d === 0
                          ? "Today"
                          : `${d}d`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Deals closing soon</h2>
          <Link className="btn ghost small" href="/pipeline">
            Full pipeline
          </Link>
        </div>
        {closingSoon.length === 0 ? (
          <div className="empty">No open deals with an expected close date.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Deal</th>
                <th>Client</th>
                <th>Stage</th>
                <th className="right">Value</th>
                <th className="right">Commission</th>
                <th className="right">Close</th>
              </tr>
            </thead>
            <tbody>
              {closingSoon.map((d) => {
                const days = daysUntil(d.expectedCloseAt);
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.title}</strong>
                      <div className="subnote">{d.probability}% likely</div>
                    </td>
                    <td>
                      <Link href={`/contacts/${d.contactId}`} className="link">
                        {contactName(d.contact)}
                      </Link>
                    </td>
                    <td>{labelFor(DEAL_STAGES, d.stage)}</td>
                    <td className="right">{formatCurrency(d.value)}</td>
                    <td className="right">{formatCurrency(commissionOf(d))}</td>
                    <td className="right">
                      <span
                        className={`badge ${
                          days != null && days < 0 ? "red" : days != null && days <= 14 ? "amber" : "blue"
                        }`}
                      >
                        {formatDate(d.expectedCloseAt)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="group-heading">Portfolio</h2>
      <div className="cards">
        <div className="card">
          <div className="label">Timeshares</div>
          <div className="value">{timeshares.length}</div>
          <div className="sub">Active ownerships</div>
        </div>
        <div className="card">
          <div className="label">Available points</div>
          <div className="value">{formatNumber(availablePoints)}</div>
          <div className="sub">{year}+ use years</div>
        </div>
        <div className="card">
          <div className="label">Annual point allotment</div>
          <div className="value">{formatNumber(annualPoints)}</div>
        </div>
        <div className="card">
          <div className="label">Outstanding fees</div>
          <div className="value">{formatCurrency(outstanding)}</div>
          <div className="sub">{fees.length} unpaid</div>
        </div>
        <div className="card">
          <div className="label">Exchange deposits</div>
          <div className="value">{deposits.length}</div>
          <div className="sub">
            {expiringDeposits.length > 0
              ? `${expiringDeposits.length} expiring ≤ 90d`
              : "available to trade"}
          </div>
        </div>
        <div className="card">
          <div className="label">Travel rewards & credits</div>
          <div className="value">{formatCurrency(rewardsBalance)}</div>
          <div className="sub">Unredeemed balance</div>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Upcoming trips</h2>
          <Link className="btn ghost small" href="/reservations">
            All reservations
          </Link>
        </div>
        {reservations.length === 0 ? (
          <div className="empty">No upcoming trips booked.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Resort</th>
                <th>Timeshare</th>
                <th>Check-in</th>
                <th className="right">Nights</th>
                <th className="right">Points</th>
                <th className="right">Countdown</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => {
                const d = daysUntil(r.checkIn);
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.resort}</strong>
                      {r.location ? <div className="subnote">{r.location}</div> : null}
                    </td>
                    <td>{r.timeshare?.name ?? "—"}</td>
                    <td>{formatDate(r.checkIn)}</td>
                    <td className="right">{nights(r.checkIn, r.checkOut)}</td>
                    <td className="right">{formatNumber(r.pointsUsed)}</td>
                    <td className="right">
                      {d != null && d >= 0 ? (
                        <span className="badge blue">{d === 0 ? "Today" : `${d}d`}</span>
                      ) : (
                        <span className="badge">In progress</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Fees due</h2>
          <Link className="btn ghost small" href="/fees">
            All fees
          </Link>
        </div>
        {fees.length === 0 ? (
          <div className="empty">No outstanding fees. 🎉</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Timeshare</th>
                <th>Type</th>
                <th>Due</th>
                <th className="right">Amount</th>
                <th className="right">Status</th>
              </tr>
            </thead>
            <tbody>
              {fees.slice(0, 6).map((f) => {
                const d = daysUntil(f.dueDate);
                const overdue = d != null && d < 0;
                const soon = d != null && d >= 0 && d <= 30;
                return (
                  <tr key={f.id}>
                    <td>{f.timeshare.name}</td>
                    <td>{labelFor(FEE_TYPES, f.type)}</td>
                    <td>{formatDate(f.dueDate)}</td>
                    <td className="right">{formatCurrency(f.amount)}</td>
                    <td className="right">
                      <span className={`badge ${overdue ? "red" : soon ? "amber" : ""}`}>
                        {overdue ? `${Math.abs(d!)}d overdue` : soon ? `in ${d}d` : "upcoming"}
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
        <div className="section-title">
          <h2>Exchange deposits expiring soon</h2>
          <Link className="btn ghost small" href="/exchanges">
            All exchanges
          </Link>
        </div>
        {expiringDeposits.length === 0 ? (
          <div className="empty">No deposits expiring in the next 90 days.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Deposit</th>
                <th>Network</th>
                <th>Expires</th>
                <th className="right">Countdown</th>
              </tr>
            </thead>
            <tbody>
              {expiringDeposits.map((d) => {
                const dl = daysUntil(d.expiresAt);
                return (
                  <tr key={d.id}>
                    <td>
                      <strong>{d.description ?? "Deposit"}</strong>
                      {d.timeshare ? <div className="subnote">{d.timeshare.name}</div> : null}
                    </td>
                    <td>{d.membership.name}</td>
                    <td>{formatDate(d.expiresAt)}</td>
                    <td className="right">
                      <span className="badge amber">{dl}d left</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Membership renewals & expiring rewards</h2>
          <Link className="btn ghost small" href="/exchanges">
            Manage memberships
          </Link>
        </div>
        {renewals.length === 0 ? (
          <div className="empty">Nothing renewing or expiring in the next {WINDOW} days.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Program</th>
                <th>Date</th>
                <th className="right">Amount</th>
                <th className="right">Countdown</th>
              </tr>
            </thead>
            <tbody>
              {renewals.map((r) => {
                const overdue = r.days < 0;
                const soon = r.days >= 0 && r.days <= 30;
                return (
                  <tr key={r.key}>
                    <td>
                      <strong>{r.label}</strong>
                      <div className="subnote">
                        {r.kind === "renewal" ? "Membership renewal" : "Reward / credit"}
                      </div>
                    </td>
                    <td>{r.sub}</td>
                    <td>{formatDate(r.when)}</td>
                    <td className="right">
                      {r.amount != null ? formatCurrency(r.amount) : "—"}
                    </td>
                    <td className="right">
                      <span className={`badge ${overdue ? "red" : soon ? "amber" : "blue"}`}>
                        {overdue
                          ? `${Math.abs(r.days)}d ago`
                          : r.days === 0
                            ? "Today"
                            : `${r.days}d`}
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
