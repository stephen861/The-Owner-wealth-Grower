import { prisma } from "@/lib/prisma";
import {
  daysUntil,
  formatCurrency,
  formatDate,
  labelFor,
  OPEN_WORK_ORDER_STATUS,
  TRADES,
} from "@/lib/format";
import { createVendor, deleteVendor } from "@/lib/pm-actions";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: { workOrders: true, expenses: true },
  });

  const totalPaid = vendors.reduce(
    (s, v) => s + v.expenses.reduce((t, e) => t + e.amount, 0),
    0,
  );
  const compliance = vendors.filter((v) => {
    const d = daysUntil(v.insuredUntil);
    return !v.w9OnFile || v.insuredUntil == null || (d != null && d < 30);
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Vendors</h1>
          <p>Your trade bench — who you call, what you pay them, and their paperwork.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Vendors</div>
          <div className="value">{vendors.length}</div>
          <div className="sub">{vendors.filter((v) => v.active).length} active</div>
        </div>
        <div className="card">
          <div className="label">Paid to date</div>
          <div className="value">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="card">
          <div className="label">Compliance gaps</div>
          <div className="value">{compliance.length}</div>
          <div className="sub">Missing W-9 or insurance</div>
        </div>
      </div>

      <div className="panel">
        <h2>Add a vendor</h2>
        <form action={createVendor} className="grid">
          <div className="field">
            <label>Name *</label>
            <input name="name" required placeholder="Gulf Coast Plumbing" />
          </div>
          <div className="field">
            <label>Trade</label>
            <select name="trade" defaultValue="GENERAL">
              {TRADES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Contact name</label>
            <input name="contactName" />
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input name="phone" />
          </div>
          <div className="field">
            <label>Hourly rate</label>
            <input name="hourlyRate" type="number" step="0.01" />
          </div>
          <div className="field">
            <label>Insured until</label>
            <input name="insuredUntil" type="date" />
          </div>
          <div className="field">
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input name="w9OnFile" type="checkbox" style={{ width: "auto" }} />
              W-9 on file
            </label>
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea name="notes" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add vendor
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Bench ({vendors.length})</h2>
        {vendors.length === 0 ? (
          <div className="empty">No vendors yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Trade</th>
                <th>Contact</th>
                <th className="right">Open jobs</th>
                <th className="right">Paid</th>
                <th>Paperwork</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const openJobs = v.workOrders.filter((w) =>
                  OPEN_WORK_ORDER_STATUS.includes(w.status),
                ).length;
                const paid = v.expenses.reduce((s, e) => s + e.amount, 0);
                const insDays = daysUntil(v.insuredUntil);
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                      {v.hourlyRate ? (
                        <div className="subnote">{formatCurrency(v.hourlyRate)}/hr</div>
                      ) : null}
                    </td>
                    <td>{labelFor(TRADES, v.trade)}</td>
                    <td>
                      <div className="stack">
                        {v.contactName ? <span>{v.contactName}</span> : null}
                        {v.phone ? <span className="subnote">{v.phone}</span> : null}
                        {v.email ? <span className="subnote">{v.email}</span> : null}
                        {!v.contactName && !v.phone && !v.email ? (
                          <span className="muted">—</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="right">{openJobs}</td>
                    <td className="right">{formatCurrency(paid)}</td>
                    <td>
                      <div className="stack">
                        <span className={`badge ${v.w9OnFile ? "green" : "red"}`}>
                          {v.w9OnFile ? "W-9 ✓" : "W-9 missing"}
                        </span>
                        {v.insuredUntil ? (
                          <span
                            className={`badge ${
                              insDays != null && insDays < 0
                                ? "red"
                                : insDays != null && insDays < 30
                                  ? "amber"
                                  : "green"
                            }`}
                          >
                            Ins. {formatDate(v.insuredUntil)}
                          </span>
                        ) : (
                          <span className="badge red">No insurance date</span>
                        )}
                      </div>
                    </td>
                    <td className="right">
                      <form action={deleteVendor} className="inline-form">
                        <input type="hidden" name="id" value={v.id} />
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
      </div>
    </div>
  );
}
