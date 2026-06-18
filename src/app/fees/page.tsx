import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  daysUntil,
  formatCurrency,
  formatDate,
  labelFor,
  FEE_TYPES,
  RECURRENCE,
} from "@/lib/format";
import { createFee, deleteFee, togglePaid } from "./actions";

export const dynamic = "force-dynamic";

export default async function FeesPage() {
  const [timeshares, fees] = await Promise.all([
    prisma.timeshare.findMany({ orderBy: { name: "asc" } }),
    prisma.fee.findMany({
      orderBy: { dueDate: "asc" },
      include: { timeshare: true },
    }),
  ]);

  const year = new Date().getFullYear();
  const outstanding = fees.filter((f) => !f.paid);
  const totalOutstanding = outstanding.reduce((s, f) => s + f.amount, 0);
  const paidThisYear = fees
    .filter((f) => f.paid && f.paidDate && f.paidDate.getFullYear() === year)
    .reduce((s, f) => s + f.amount, 0);
  const annualObligations = fees
    .filter((f) => f.dueDate.getFullYear() === year)
    .reduce((s, f) => s + f.amount, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Fees & Finances</h1>
          <p>Maintenance fees, assessments, dues and loan payments.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Outstanding</div>
          <div className="value">{formatCurrency(totalOutstanding)}</div>
          <div className="sub">{outstanding.length} unpaid item(s)</div>
        </div>
        <div className="card">
          <div className="label">Paid in {year}</div>
          <div className="value">{formatCurrency(paidThisYear)}</div>
        </div>
        <div className="card">
          <div className="label">Total {year} obligations</div>
          <div className="value">{formatCurrency(annualObligations)}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Add a fee</h2>
        {timeshares.length === 0 ? (
          <div className="empty">
            Add a timeshare first. <Link href="/timeshares/new">Add timeshare</Link>
          </div>
        ) : (
          <form action={createFee} className="grid">
            <div className="field">
              <label>Timeshare *</label>
              <select name="timeshareId" required defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {timeshares.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Type</label>
              <select name="type" defaultValue="MAINTENANCE">
                {FEE_TYPES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount *</label>
              <input name="amount" type="number" step="0.01" required placeholder="1250.00" />
            </div>
            <div className="field">
              <label>Due date *</label>
              <input name="dueDate" type="date" required />
            </div>
            <div className="field">
              <label>Recurrence</label>
              <select name="recurrence" defaultValue="ANNUAL">
                {RECURRENCE.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Already paid?</label>
              <select name="paid" defaultValue="false">
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div className="field full">
              <label>Description</label>
              <input name="description" placeholder="2026 annual maintenance fee" />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">
                Add fee
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="panel">
        <h2>All fees</h2>
        {fees.length === 0 ? (
          <div className="empty">No fees recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Timeshare</th>
                <th>Type</th>
                <th>Due</th>
                <th className="right">Amount</th>
                <th>Recurrence</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => {
                const dleft = daysUntil(f.dueDate);
                const overdue = !f.paid && dleft != null && dleft < 0;
                const soon = !f.paid && dleft != null && dleft >= 0 && dleft <= 30;
                return (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/timeshares/${f.timeshare.id}`}>{f.timeshare.name}</Link>
                    </td>
                    <td>
                      {labelFor(FEE_TYPES, f.type)}
                      {f.description ? <div className="subnote">{f.description}</div> : null}
                    </td>
                    <td>
                      {formatDate(f.dueDate)}
                      {!f.paid && dleft != null ? (
                        <div className={`subnote ${overdue ? "" : ""}`}>
                          {overdue
                            ? `${Math.abs(dleft)}d overdue`
                            : soon
                              ? `in ${dleft}d`
                              : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="right">{formatCurrency(f.amount)}</td>
                    <td>{labelFor(RECURRENCE, f.recurrence)}</td>
                    <td>
                      <span
                        className={`badge ${
                          f.paid ? "green" : overdue ? "red" : soon ? "amber" : ""
                        }`}
                      >
                        {f.paid ? "Paid" : overdue ? "Overdue" : "Due"}
                      </span>
                    </td>
                    <td className="right">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <form action={togglePaid} className="inline-form">
                          <input type="hidden" name="id" value={f.id} />
                          <button className="btn ghost small" type="submit">
                            {f.paid ? "Mark unpaid" : "Mark paid"}
                          </button>
                        </form>
                        <form action={deleteFee} className="inline-form">
                          <input type="hidden" name="id" value={f.id} />
                          <button className="btn danger small" type="submit">
                            ✕
                          </button>
                        </form>
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
