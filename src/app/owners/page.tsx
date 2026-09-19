import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  contactName,
  formatCurrency,
  formatPeriod,
  labelFor,
  periodKey,
  propertyAddress,
  EXPENSE_CATEGORIES,
} from "@/lib/format";

export const dynamic = "force-dynamic";

// The last 12 month-keys, newest first, for the statement period picker.
function recentPeriods(count = 12): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    out.push(periodKey(d));
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

function monthRange(period: string): { start: Date; end: Date } | null {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return null;
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: requested } = await searchParams;
  const periods = recentPeriods();
  const period = requested && periods.includes(requested) ? requested : periods[0];
  const range = monthRange(period)!;

  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
    include: {
      owner: true,
      units: {
        include: {
          leases: {
            include: {
              payments: { where: { receivedAt: { gte: range.start, lt: range.end } } },
            },
          },
        },
      },
      expenses: { where: { paidAt: { gte: range.start, lt: range.end } } },
    },
  });

  // Roll each property into its owner's statement. Properties with no owner
  // set are yours, grouped under "Self-owned".
  type Line = {
    property: (typeof properties)[number];
    collected: number;
    expenses: number;
    mgmtFee: number;
    net: number;
  };
  type Statement = {
    key: string;
    ownerId: string | null;
    ownerLabel: string;
    lines: Line[];
    collected: number;
    expenses: number;
    mgmtFee: number;
    net: number;
  };

  const byOwner = new Map<string, Statement>();

  for (const p of properties) {
    const collected = p.units
      .flatMap((u) => u.leases)
      .flatMap((l) => l.payments)
      .reduce((s, pay) => s + pay.amount, 0);
    const expenses = p.expenses.reduce((s, e) => s + e.amount, 0);
    const mgmtFee = (collected * p.managementFeeRate) / 100;
    const net = collected - expenses - mgmtFee;

    const key = p.ownerId ?? "self";
    if (!byOwner.has(key)) {
      byOwner.set(key, {
        key,
        ownerId: p.ownerId,
        ownerLabel: p.owner ? contactName(p.owner) : "Self-owned",
        lines: [],
        collected: 0,
        expenses: 0,
        mgmtFee: 0,
        net: 0,
      });
    }
    const st = byOwner.get(key)!;
    st.lines.push({ property: p, collected, expenses, mgmtFee, net });
    st.collected += collected;
    st.expenses += expenses;
    st.mgmtFee += mgmtFee;
    st.net += net;
  }

  const statements = [...byOwner.values()].sort((a, b) => b.collected - a.collected);
  const totalCollected = statements.reduce((s, x) => s + x.collected, 0);
  const totalExpenses = statements.reduce((s, x) => s + x.expenses, 0);
  const totalMgmtFee = statements.reduce((s, x) => s + x.mgmtFee, 0);
  const totalNet = statements.reduce((s, x) => s + x.net, 0);

  // Expense breakdown for the month, biggest category first.
  const byCategory = new Map<string, number>();
  for (const p of properties) {
    for (const e of p.expenses) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    }
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Owner statements</h1>
          <p>What each owner collected, spent, and is owed for {formatPeriod(period)}.</p>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Statement period</h2>
        </div>
        <div className="filters">
          {periods.slice(0, 6).map((p) => (
            <Link
              key={p}
              className={`btn ghost small${p === period ? " active" : ""}`}
              href={`/owners?period=${p}`}
            >
              {formatPeriod(p)}
            </Link>
          ))}
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Rent collected</div>
          <div className="value">{formatCurrency(totalCollected)}</div>
          <div className="sub">{formatPeriod(period)}</div>
        </div>
        <div className="card">
          <div className="label">Operating expenses</div>
          <div className="value">{formatCurrency(totalExpenses)}</div>
        </div>
        <div className="card">
          <div className="label">Management fees earned</div>
          <div className="value">{formatCurrency(totalMgmtFee)}</div>
          <div className="sub">Your revenue this month</div>
        </div>
        <div className="card">
          <div className="label">Net to owners</div>
          <div className="value">{formatCurrency(totalNet)}</div>
          <div className="sub">Distributable</div>
        </div>
      </div>

      {statements.length === 0 ? (
        <div className="panel">
          <div className="empty">
            No properties yet. <Link href="/properties">Add one</Link> to start producing
            statements.
          </div>
        </div>
      ) : (
        statements.map((st) => (
          <div className="panel" key={st.key}>
            <div className="section-title">
              <h2>
                {st.ownerId ? (
                  <Link href={`/contacts/${st.ownerId}`} className="link">
                    {st.ownerLabel}
                  </Link>
                ) : (
                  st.ownerLabel
                )}
              </h2>
              <span className={`badge ${st.net >= 0 ? "green" : "red"}`}>
                Net {formatCurrency(st.net)}
              </span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th className="right">Collected</th>
                  <th className="right">Expenses</th>
                  <th className="right">Mgmt fee</th>
                  <th className="right">Net</th>
                </tr>
              </thead>
              <tbody>
                {st.lines.map((line) => (
                  <tr key={line.property.id}>
                    <td>
                      <Link href={`/properties/${line.property.id}`}>
                        <strong>{line.property.name}</strong>
                      </Link>
                      <div className="subnote">
                        {propertyAddress(line.property) || "No address"}
                        {line.property.managementFeeRate > 0
                          ? ` · ${line.property.managementFeeRate}% fee`
                          : ""}
                      </div>
                    </td>
                    <td className="right">{formatCurrency(line.collected)}</td>
                    <td className="right">
                      {line.expenses > 0 ? (
                        <span style={{ color: "var(--red)" }}>
                          −{formatCurrency(line.expenses)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="right">
                      {line.mgmtFee > 0 ? (
                        <span style={{ color: "var(--red)" }}>
                          −{formatCurrency(line.mgmtFee)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="right">
                      <strong>{formatCurrency(line.net)}</strong>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td className="right">
                    <strong>{formatCurrency(st.collected)}</strong>
                  </td>
                  <td className="right">
                    <strong>{formatCurrency(st.expenses)}</strong>
                  </td>
                  <td className="right">
                    <strong>{formatCurrency(st.mgmtFee)}</strong>
                  </td>
                  <td className="right">
                    <strong>{formatCurrency(st.net)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ))
      )}

      <div className="panel">
        <h2>Expense breakdown — {formatPeriod(period)}</h2>
        {categories.length === 0 ? (
          <div className="empty">No expenses booked this month.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="right">Amount</th>
                <th className="right">Share</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(([cat, amount]) => {
                const share = totalExpenses === 0 ? 0 : (amount / totalExpenses) * 100;
                return (
                  <tr key={cat}>
                    <td>{labelFor(EXPENSE_CATEGORIES, cat)}</td>
                    <td className="right">{formatCurrency(amount)}</td>
                    <td className="right">
                      {share.toFixed(0)}%
                      <div className="progress">
                        <span style={{ width: `${share}%` }} />
                      </div>
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
