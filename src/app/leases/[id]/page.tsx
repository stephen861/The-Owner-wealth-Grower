import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  contactName,
  formatCurrency,
  formatDate,
  formatPeriod,
  labelFor,
  leaseBalance,
  periodKey,
  CHARGE_TYPES,
  LEASE_STATUS,
  PAYMENT_METHODS,
} from "@/lib/format";
import {
  createCharge,
  deleteCharge,
  deleteLease,
  deletePayment,
  recordPayment,
  updateLeaseStatus,
} from "@/lib/pm-actions";

export const dynamic = "force-dynamic";

// One running-balance ledger built from charges and payments interleaved by date.
type Entry = {
  id: string;
  kind: "charge" | "payment";
  date: Date;
  label: string;
  detail: string;
  debit: number;
  credit: number;
};

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      tenant: true,
      unit: { include: { property: true } },
      charges: true,
      payments: true,
    },
  });
  if (!lease) notFound();

  const entries: Entry[] = [
    ...lease.charges.map((c) => ({
      id: c.id,
      kind: "charge" as const,
      date: c.dueDate,
      label: labelFor(CHARGE_TYPES, c.type),
      detail: [c.description, c.period ? formatPeriod(c.period) : null]
        .filter(Boolean)
        .join(" · "),
      debit: c.amount,
      credit: 0,
    })),
    ...lease.payments.map((p) => ({
      id: p.id,
      kind: "payment" as const,
      date: p.receivedAt,
      label: `Payment — ${labelFor(PAYMENT_METHODS, p.method)}`,
      detail: [p.reference, p.notes].filter(Boolean).join(" · "),
      debit: 0,
      credit: p.amount,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const ledger = entries.map((e) => {
    running += e.debit - e.credit;
    return { ...e, running };
  });

  const balance = leaseBalance(lease);
  const charged = lease.charges.reduce((s, c) => s + c.amount, 0);
  const paid = lease.payments.reduce((s, p) => s + p.amount, 0);
  const period = periodKey();

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{contactName(lease.tenant)}</h1>
          <p>
            <Link href={`/properties/${lease.unit.propertyId}`} className="link">
              {lease.unit.property.name}
            </Link>{" "}
            · Unit {lease.unit.label} · {labelFor(LEASE_STATUS, lease.status)}
          </p>
        </div>
        <div className="filters">
          <Link className="btn ghost small" href="/leases">
            ← Rent roll
          </Link>
          <Link className="btn ghost small" href={`/contacts/${lease.tenantId}`}>
            Tenant profile
          </Link>
          <form action={deleteLease} className="inline-form">
            <input type="hidden" name="id" value={lease.id} />
            <button className="btn danger small" type="submit">
              Delete lease
            </button>
          </form>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Balance owed</div>
          <div className="value">{formatCurrency(balance)}</div>
          <div className="sub">
            {balance > 0 ? "Past due" : balance < 0 ? "Credit on account" : "Current"}
          </div>
        </div>
        <div className="card">
          <div className="label">Monthly rent</div>
          <div className="value">{formatCurrency(lease.rentAmount)}</div>
          <div className="sub">
            Due day {lease.rentDueDay} · {lease.lateFeeAfterDay}-day grace
          </div>
        </div>
        <div className="card">
          <div className="label">Lifetime charged</div>
          <div className="value">{formatCurrency(charged)}</div>
          <div className="sub">{lease.charges.length} charges</div>
        </div>
        <div className="card">
          <div className="label">Lifetime paid</div>
          <div className="value">{formatCurrency(paid)}</div>
          <div className="sub">{lease.payments.length} payments</div>
        </div>
        <div className="card">
          <div className="label">Deposit held</div>
          <div className="value">{formatCurrency(lease.depositHeld)}</div>
          <div className="sub">of {formatCurrency(lease.depositAmount)} due</div>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Lease term</h2>
          <form action={updateLeaseStatus} className="stage-form">
            <input type="hidden" name="id" value={lease.id} />
            <select name="status" defaultValue={lease.status}>
              {LEASE_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="btn small ghost" type="submit">
              Update status
            </button>
          </form>
        </div>
        <table>
          <tbody>
            <tr>
              <td className="muted">Term</td>
              <td>
                {formatDate(lease.startDate)} → {formatDate(lease.endDate)}
              </td>
              <td className="muted">Moved in</td>
              <td>{formatDate(lease.moveInDate)}</td>
            </tr>
            <tr>
              <td className="muted">Late fee</td>
              <td>{formatCurrency(lease.lateFeeAmount)}</td>
              <td className="muted">Moved out</td>
              <td>{formatDate(lease.moveOutDate)}</td>
            </tr>
          </tbody>
        </table>
        {lease.notes ? <p className="subnote">{lease.notes}</p> : null}
      </div>

      <div className="panel">
        <h2>Record a payment</h2>
        <form action={recordPayment} className="grid">
          <input type="hidden" name="leaseId" value={lease.id} />
          <div className="field">
            <label>Amount *</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              required
              defaultValue={balance > 0 ? balance.toFixed(2) : lease.rentAmount.toFixed(2)}
            />
          </div>
          <div className="field">
            <label>Received on</label>
            <input name="receivedAt" type="date" />
          </div>
          <div className="field">
            <label>Method</label>
            <select name="method" defaultValue="ACH">
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Reference</label>
            <input name="reference" placeholder="Check #1042" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Record payment
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Post a charge</h2>
        <form action={createCharge} className="grid">
          <input type="hidden" name="leaseId" value={lease.id} />
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue="RENT">
              {CHARGE_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Amount *</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              required
              defaultValue={lease.rentAmount.toFixed(2)}
            />
          </div>
          <div className="field">
            <label>Due date *</label>
            <input name="dueDate" type="date" required />
          </div>
          <div className="field">
            <label>Period</label>
            <input name="period" placeholder={period} defaultValue={period} />
          </div>
          <div className="field">
            <label>Description</label>
            <input name="description" placeholder="Monthly rent" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Post charge
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Ledger ({ledger.length})</h2>
        {ledger.length === 0 ? (
          <div className="empty">Nothing posted to this lease yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th className="right">Charge</th>
                <th className="right">Payment</th>
                <th className="right">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={`${e.kind}-${e.id}`}>
                  <td>{formatDate(e.date)}</td>
                  <td>
                    <strong>{e.label}</strong>
                    {e.detail ? <div className="subnote">{e.detail}</div> : null}
                  </td>
                  <td className="right">
                    {e.debit > 0 ? formatCurrency(e.debit) : <span className="muted">—</span>}
                  </td>
                  <td className="right">
                    {e.credit > 0 ? (
                      <span style={{ color: "var(--green)" }}>
                        {formatCurrency(e.credit)}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="right">
                    <strong>{formatCurrency(e.running)}</strong>
                  </td>
                  <td className="right">
                    <form
                      action={e.kind === "charge" ? deleteCharge : deletePayment}
                      className="inline-form"
                    >
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
      </div>
    </div>
  );
}
