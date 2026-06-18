import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  daysUntil,
  formatCurrency,
  formatDate,
  formatNumber,
  labelFor,
  nights,
  FEE_TYPES,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();

  const [timeshares, pointsAccounts, reservations, fees] = await Promise.all([
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
  ]);

  const availablePoints = pointsAccounts.reduce(
    (s, p) => s + (p.allotted + p.banked + p.borrowed - p.used),
    0,
  );
  const annualPoints = timeshares.reduce((s, t) => s + (t.annualPoints ?? 0), 0);
  const outstanding = fees.reduce((s, f) => s + f.amount, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Your timeshare portfolio at a glance.</p>
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
    </div>
  );
}
