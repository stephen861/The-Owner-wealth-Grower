import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatNumber, labelFor, OWNERSHIP_TYPES } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TimesharesPage() {
  const timeshares = await prisma.timeshare.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { reservations: true, fees: true, benefits: true } },
    },
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Timeshares</h1>
          <p>Every contract and membership you own.</p>
        </div>
        <Link className="btn" href="/timeshares/new">
          + Add timeshare
        </Link>
      </div>

      <div className="panel">
        {timeshares.length === 0 ? (
          <div className="empty">
            No timeshares yet. <Link href="/timeshares/new">Add your first one.</Link>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Brand</th>
                <th>Type</th>
                <th>Location</th>
                <th className="right">Annual points</th>
                <th className="right">Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {timeshares.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/timeshares/${t.id}`}>
                      <strong>{t.name}</strong>
                    </Link>
                    {!t.active ? <span className="badge" style={{ marginLeft: 8 }}>Inactive</span> : null}
                    {t.resort ? <div className="subnote">{t.resort}</div> : null}
                  </td>
                  <td>{t.brand ?? "—"}</td>
                  <td>
                    <span className="badge blue">{labelFor(OWNERSHIP_TYPES, t.ownershipType)}</span>
                  </td>
                  <td>{t.location ?? "—"}</td>
                  <td className="right">{formatNumber(t.annualPoints)}</td>
                  <td className="right">{formatCurrency(t.purchasePrice)}</td>
                  <td className="right">
                    <Link className="btn ghost small" href={`/timeshares/${t.id}`}>
                      View
                    </Link>
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
