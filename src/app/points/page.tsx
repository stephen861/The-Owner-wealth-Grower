import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  formatNumber,
  labelFor,
  toDateInput,
  BENEFIT_CATEGORIES,
} from "@/lib/format";
import {
  upsertPointsAccount,
  deletePointsAccount,
  createBenefit,
  deleteBenefit,
  redeemBenefit,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function PointsPage() {
  const timeshares = await prisma.timeshare.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      pointsAccounts: { orderBy: { useYear: "desc" } },
      benefits: { orderBy: { createdAt: "desc" } },
    },
  });

  const currentYear = new Date().getFullYear();

  const totalAvailable = timeshares.reduce(
    (sum, t) =>
      sum +
      t.pointsAccounts
        .filter((p) => p.useYear >= currentYear)
        .reduce((s, p) => s + (p.allotted + p.banked + p.borrowed - p.used), 0),
    0,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Points & Benefits</h1>
          <p>Track point balances by use year and your membership perks.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Available points ({currentYear}+)</div>
          <div className="value">{formatNumber(totalAvailable)}</div>
          <div className="sub">Across all active timeshares</div>
        </div>
        <div className="card">
          <div className="label">Active benefits</div>
          <div className="value">
            {timeshares.reduce((s, t) => s + t.benefits.filter((b) => b.active).length, 0)}
          </div>
        </div>
      </div>

      {timeshares.length === 0 ? (
        <div className="panel">
          <div className="empty">
            Add a timeshare first to start tracking points.{" "}
            <Link href="/timeshares/new">Add timeshare</Link>
          </div>
        </div>
      ) : null}

      {timeshares.map((t) => (
        <div className="panel" key={t.id}>
          <div className="section-title">
            <h2>
              <Link href={`/timeshares/${t.id}`}>{t.name}</Link>
            </h2>
            <span className="badge blue">{t.brand ?? "Timeshare"}</span>
          </div>

          <h3 style={{ fontSize: 14, margin: "4px 0 8px" }} className="muted">
            POINTS BY USE YEAR
          </h3>
          {t.pointsAccounts.length === 0 ? (
            <p className="muted">No point balances recorded yet.</p>
          ) : (
            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="right">Allotted</th>
                  <th className="right">Used</th>
                  <th className="right">Banked</th>
                  <th className="right">Borrowed</th>
                  <th className="right">Available</th>
                  <th>Expires</th>
                  <th></th>
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
                        <strong className={available < 0 ? "" : ""}>
                          {formatNumber(available)}
                        </strong>
                      </td>
                      <td>{formatDate(p.expiresAt)}</td>
                      <td className="right">
                        <form action={deletePointsAccount} className="inline-form">
                          <input type="hidden" name="id" value={p.id} />
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

          <details>
            <summary className="muted" style={{ cursor: "pointer", marginBottom: 10 }}>
              + Add / update a use year
            </summary>
            <form action={upsertPointsAccount} className="grid" style={{ marginTop: 10 }}>
              <input type="hidden" name="timeshareId" value={t.id} />
              <div className="field">
                <label>Use year</label>
                <input name="useYear" type="number" defaultValue={currentYear} required />
              </div>
              <div className="field">
                <label>Allotted</label>
                <input name="allotted" type="number" defaultValue={t.annualPoints ?? 0} />
              </div>
              <div className="field">
                <label>Used</label>
                <input name="used" type="number" defaultValue={0} />
              </div>
              <div className="field">
                <label>Banked</label>
                <input name="banked" type="number" defaultValue={0} />
              </div>
              <div className="field">
                <label>Borrowed</label>
                <input name="borrowed" type="number" defaultValue={0} />
              </div>
              <div className="field">
                <label>Expires</label>
                <input name="expiresAt" type="date" />
              </div>
              <div className="form-actions">
                <button className="btn small" type="submit">
                  Save use year
                </button>
              </div>
            </form>
          </details>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "18px 0" }} />

          <h3 style={{ fontSize: 14, margin: "4px 0 8px" }} className="muted">
            BENEFITS & PERKS
          </h3>
          {t.benefits.length === 0 ? (
            <p className="muted">No benefits recorded yet.</p>
          ) : (
            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Benefit</th>
                  <th>Category</th>
                  <th>Tier</th>
                  <th>Usage</th>
                  <th>Expires</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {t.benefits.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <strong>{b.name}</strong>
                      {b.description ? <div className="subnote">{b.description}</div> : null}
                    </td>
                    <td>
                      <span className="badge">{labelFor(BENEFIT_CATEGORIES, b.category)}</span>
                    </td>
                    <td>{b.tier ?? "—"}</td>
                    <td>
                      {b.totalAllowance != null ? (
                        <span>
                          {b.usedAllowance} / {b.totalAllowance}
                          <div className="progress">
                            <span
                              style={{
                                width: `${Math.min(
                                  100,
                                  (b.usedAllowance / Math.max(1, b.totalAllowance)) * 100,
                                )}%`,
                              }}
                            />
                          </div>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDate(b.expiresAt)}</td>
                    <td className="right">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {b.totalAllowance != null && b.usedAllowance < b.totalAllowance ? (
                          <form action={redeemBenefit} className="inline-form">
                            <input type="hidden" name="id" value={b.id} />
                            <button className="btn ghost small" type="submit" title="Redeem one">
                              Redeem
                            </button>
                          </form>
                        ) : null}
                        <form action={deleteBenefit} className="inline-form">
                          <input type="hidden" name="id" value={b.id} />
                          <button className="btn danger small" type="submit">
                            ✕
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <details>
            <summary className="muted" style={{ cursor: "pointer", marginBottom: 10 }}>
              + Add a benefit
            </summary>
            <form action={createBenefit} className="grid" style={{ marginTop: 10 }}>
              <input type="hidden" name="timeshareId" value={t.id} />
              <div className="field">
                <label>Name *</label>
                <input name="name" required placeholder="Guest certificates" />
              </div>
              <div className="field">
                <label>Category</label>
                <select name="category" defaultValue="PERK">
                  {BENEFIT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Tier</label>
                <input name="tier" placeholder="Platinum" />
              </div>
              <div className="field">
                <label>Total allowance</label>
                <input name="totalAllowance" type="number" placeholder="(blank = unlimited)" />
              </div>
              <div className="field">
                <label>Used</label>
                <input name="usedAllowance" type="number" defaultValue={0} />
              </div>
              <div className="field">
                <label>Expires</label>
                <input name="expiresAt" type="date" />
              </div>
              <div className="field full">
                <label>Description</label>
                <input name="description" placeholder="3 free guest certificates per year" />
              </div>
              <div className="form-actions">
                <button className="btn small" type="submit">
                  Add benefit
                </button>
              </div>
            </form>
          </details>
        </div>
      ))}
    </div>
  );
}
