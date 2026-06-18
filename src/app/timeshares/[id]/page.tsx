import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deleteTimeshare } from "../actions";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  labelFor,
  nights,
  OWNERSHIP_TYPES,
  FEE_TYPES,
  RESERVATION_STATUS,
  EXCHANGE_NETWORKS,
  DEPOSIT_STATUS,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TimeshareDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await prisma.timeshare.findUnique({
    where: { id },
    include: {
      pointsAccounts: { orderBy: { useYear: "desc" } },
      benefits: { orderBy: { createdAt: "desc" } },
      reservations: { orderBy: { checkIn: "desc" } },
      fees: { orderBy: { dueDate: "asc" } },
      exchangeMemberships: true,
      exchangeDeposits: { orderBy: { expiresAt: "asc" }, include: { membership: true } },
    },
  });
  if (!t) notFound();

  const detail: [string, string][] = [
    ["Brand / Club", t.brand ?? "—"],
    ["Ownership type", labelFor(OWNERSHIP_TYPES, t.ownershipType)],
    ["Resort", t.resort ?? "—"],
    ["Location", t.location ?? "—"],
    ["Unit type", t.unitType ?? "—"],
    ["Annual points", formatNumber(t.annualPoints)],
    ["Use year", t.useYear ?? "—"],
    ["Deeded week", t.deededWeek ?? "—"],
    ["Ownership share", t.ownershipShare != null ? `${t.ownershipShare}%` : "—"],
    ["Contract #", t.contractNumber ?? "—"],
    ["Member #", t.memberNumber ?? "—"],
    ["Purchase date", formatDate(t.purchaseDate)],
    ["Purchase price", formatCurrency(t.purchasePrice)],
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{t.name}</h1>
          <p>
            <Link href="/timeshares" className="muted">
              ← Back to timeshares
            </Link>
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link className="btn ghost" href={`/timeshares/${t.id}/edit`}>
            Edit
          </Link>
          <form action={deleteTimeshare} className="inline-form">
            <input type="hidden" name="id" value={t.id} />
            <button className="btn danger" type="submit">
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="panel">
        <h2>Details</h2>
        <table>
          <tbody>
            {detail.map(([k, val]) => (
              <tr key={k}>
                <td className="muted" style={{ width: 200 }}>
                  {k}
                </td>
                <td>{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {t.notes ? <p className="muted" style={{ marginTop: 14 }}>{t.notes}</p> : null}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Points by use year</h2>
          <Link className="btn ghost small" href="/points">
            Manage points
          </Link>
        </div>
        {t.pointsAccounts.length === 0 ? (
          <div className="empty">No points tracked yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Use year</th>
                <th className="right">Allotted</th>
                <th className="right">Used</th>
                <th className="right">Banked</th>
                <th className="right">Borrowed</th>
                <th className="right">Available</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {t.pointsAccounts.map((p) => {
                const available = p.allotted + p.banked + p.borrowed - p.used;
                return (
                  <tr key={p.id}>
                    <td>{p.useYear}</td>
                    <td className="right">{formatNumber(p.allotted)}</td>
                    <td className="right">{formatNumber(p.used)}</td>
                    <td className="right">{formatNumber(p.banked)}</td>
                    <td className="right">{formatNumber(p.borrowed)}</td>
                    <td className="right">
                      <strong>{formatNumber(available)}</strong>
                    </td>
                    <td>{formatDate(p.expiresAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Benefits</h2>
          <Link className="btn ghost small" href="/points">
            Manage benefits
          </Link>
        </div>
        {t.benefits.length === 0 ? (
          <div className="empty">No benefits tracked yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Benefit</th>
                <th>Tier</th>
                <th>Usage</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {t.benefits.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.name}</strong>
                    {b.description ? <div className="subnote">{b.description}</div> : null}
                  </td>
                  <td>{b.tier ?? "—"}</td>
                  <td>
                    {b.totalAllowance != null
                      ? `${b.usedAllowance} / ${b.totalAllowance}`
                      : "—"}
                  </td>
                  <td>{formatDate(b.expiresAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Reservations</h2>
          <Link className="btn ghost small" href="/reservations">
            Manage reservations
          </Link>
        </div>
        {t.reservations.length === 0 ? (
          <div className="empty">No reservations yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Resort</th>
                <th>Dates</th>
                <th className="right">Nights</th>
                <th className="right">Points</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {t.reservations.map((r) => (
                <tr key={r.id}>
                  <td>{r.resort}</td>
                  <td>
                    {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                  </td>
                  <td className="right">{nights(r.checkIn, r.checkOut)}</td>
                  <td className="right">{formatNumber(r.pointsUsed)}</td>
                  <td>
                    <span className="badge">{labelFor(RESERVATION_STATUS, r.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Fees</h2>
          <Link className="btn ghost small" href="/fees">
            Manage fees
          </Link>
        </div>
        {t.fees.length === 0 ? (
          <div className="empty">No fees tracked yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Due</th>
                <th className="right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {t.fees.map((f) => (
                <tr key={f.id}>
                  <td>{labelFor(FEE_TYPES, f.type)}</td>
                  <td>{formatDate(f.dueDate)}</td>
                  <td className="right">{formatCurrency(f.amount)}</td>
                  <td>
                    <span className={`badge ${f.paid ? "green" : "amber"}`}>
                      {f.paid ? "Paid" : "Due"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Exchanges & memberships</h2>
          <Link className="btn ghost small" href="/exchanges">
            Manage exchanges
          </Link>
        </div>
        {t.exchangeMemberships.length === 0 && t.exchangeDeposits.length === 0 ? (
          <div className="empty">No exchange memberships or deposits linked to this timeshare.</div>
        ) : (
          <>
            {t.exchangeMemberships.length > 0 ? (
              <table style={{ marginBottom: t.exchangeDeposits.length > 0 ? 16 : 0 }}>
                <thead>
                  <tr>
                    <th>Membership</th>
                    <th>Network</th>
                    <th>Member #</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {t.exchangeMemberships.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>
                        <span className="badge blue">{labelFor(EXCHANGE_NETWORKS, m.network)}</span>
                      </td>
                      <td>{m.memberNumber ?? "—"}</td>
                      <td>{m.tier ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {t.exchangeDeposits.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Deposit</th>
                    <th>Into</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {t.exchangeDeposits.map((d) => (
                    <tr key={d.id}>
                      <td>{d.description ?? "Deposit"}</td>
                      <td>{d.membership.name}</td>
                      <td>{formatDate(d.expiresAt)}</td>
                      <td>
                        <span className="badge">{labelFor(DEPOSIT_STATUS, d.status)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
