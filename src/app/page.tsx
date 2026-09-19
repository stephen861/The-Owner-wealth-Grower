import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  commissionOf,
  contactName,
  daysUntil,
  formatCurrency,
  formatDate,
  formatNumber,
  labelFor,
  nights,
  weightedCommissionOf,
  ACTIVITY_ICONS,
  DEAL_STAGES,
  EXCHANGE_NETWORKS,
  FEE_TYPES,
  OPEN_STAGES,
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
        <Link className="btn" href="/timeshares/new">
          + Add timeshare
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
