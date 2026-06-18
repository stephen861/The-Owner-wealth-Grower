import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  daysUntil,
  formatCurrency,
  formatDate,
  formatNumber,
  labelFor,
  EXCHANGE_NETWORKS,
  DEPOSIT_TYPES,
  DEPOSIT_STATUS,
} from "@/lib/format";
import {
  createMembership,
  deleteMembership,
  createDeposit,
  setDepositStatus,
  deleteDeposit,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function ExchangesPage() {
  const [memberships, timeshares] = await Promise.all([
    prisma.exchangeMembership.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        timeshare: true,
        deposits: { orderBy: { expiresAt: "asc" }, include: { timeshare: true } },
      },
    }),
    prisma.timeshare.findMany({ orderBy: { name: "asc" } }),
  ]);

  const allDeposits = memberships.flatMap((m) => m.deposits);
  const available = allDeposits.filter((d) => d.status === "AVAILABLE");
  const expiringSoon = available.filter((d) => {
    const dl = daysUntil(d.expiresAt);
    return dl != null && dl >= 0 && dl <= 90;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Exchanges & Memberships</h1>
          <p>RCI, Interval International, travel clubs and the weeks/points you trade.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Memberships</div>
          <div className="value">{memberships.filter((m) => m.active).length}</div>
        </div>
        <div className="card">
          <div className="label">Available deposits</div>
          <div className="value">{available.length}</div>
          <div className="sub">Weeks / points ready to trade</div>
        </div>
        <div className="card">
          <div className="label">Expiring ≤ 90 days</div>
          <div className="value">{expiringSoon.length}</div>
          <div className="sub">Use them or lose them</div>
        </div>
      </div>

      <div className="panel">
        <h2>Add a membership</h2>
        <form action={createMembership} className="grid">
          <div className="field">
            <label>Name *</label>
            <input name="name" required placeholder="RCI Weeks" />
          </div>
          <div className="field">
            <label>Network</label>
            <select name="network" defaultValue="RCI">
              {EXCHANGE_NETWORKS.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Member #</label>
            <input name="memberNumber" />
          </div>
          <div className="field">
            <label>Tier</label>
            <input name="tier" placeholder="Platinum" />
          </div>
          <div className="field">
            <label>Linked timeshare</label>
            <select name="timeshareId" defaultValue="">
              <option value="">— None —</option>
              {timeshares.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Join date</label>
            <input name="joinDate" type="date" />
          </div>
          <div className="field">
            <label>Expires</label>
            <input name="expiresAt" type="date" />
          </div>
          <div className="field">
            <label>Annual fee</label>
            <input name="membershipFee" type="number" step="0.01" placeholder="154.00" />
          </div>
          <div className="field full">
            <label>Notes</label>
            <input name="notes" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add membership
            </button>
          </div>
        </form>
      </div>

      {memberships.length === 0 ? (
        <div className="panel">
          <div className="empty">No memberships yet. Add RCI, Interval, or a travel club above.</div>
        </div>
      ) : null}

      {memberships.map((m) => (
        <div className="panel" key={m.id}>
          <div className="section-title">
            <h2>
              {m.name}{" "}
              <span className="badge blue">{labelFor(EXCHANGE_NETWORKS, m.network)}</span>
              {!m.active ? <span className="badge" style={{ marginLeft: 6 }}>Inactive</span> : null}
            </h2>
            <form action={deleteMembership} className="inline-form">
              <input type="hidden" name="id" value={m.id} />
              <button className="btn danger small" type="submit">
                Delete membership
              </button>
            </form>
          </div>

          <table style={{ marginBottom: 16 }}>
            <tbody>
              <tr>
                <td className="muted" style={{ width: 160 }}>Member #</td>
                <td>{m.memberNumber ?? "—"}</td>
                <td className="muted" style={{ width: 120 }}>Tier</td>
                <td>{m.tier ?? "—"}</td>
              </tr>
              <tr>
                <td className="muted">Linked timeshare</td>
                <td>
                  {m.timeshare ? (
                    <Link href={`/timeshares/${m.timeshare.id}`}>{m.timeshare.name}</Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="muted">Annual fee</td>
                <td>{formatCurrency(m.membershipFee)}</td>
              </tr>
              <tr>
                <td className="muted">Joined</td>
                <td>{formatDate(m.joinDate)}</td>
                <td className="muted">Expires</td>
                <td>{formatDate(m.expiresAt)}</td>
              </tr>
            </tbody>
          </table>
          {m.notes ? <p className="muted">{m.notes}</p> : null}

          <h3 style={{ fontSize: 14, margin: "8px 0" }} className="muted">
            DEPOSITS & TRADE CREDITS
          </h3>
          {m.deposits.length === 0 ? (
            <p className="muted">No deposits recorded yet.</p>
          ) : (
            <table style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th>Deposit</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th className="right">Trading power</th>
                  <th>Expires</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {m.deposits.map((d) => {
                  const dl = daysUntil(d.expiresAt);
                  const soon = d.status === "AVAILABLE" && dl != null && dl >= 0 && dl <= 90;
                  const expired = d.status === "AVAILABLE" && dl != null && dl < 0;
                  return (
                    <tr key={d.id}>
                      <td>
                        <strong>{d.description ?? "Deposit"}</strong>
                        {d.pointsValue != null ? (
                          <div className="subnote">{formatNumber(d.pointsValue)} pts</div>
                        ) : null}
                      </td>
                      <td>{labelFor(DEPOSIT_TYPES, d.depositType)}</td>
                      <td>{d.timeshare ? d.timeshare.name : "—"}</td>
                      <td className="right">{d.tradingPower != null ? d.tradingPower : "—"}</td>
                      <td>
                        {formatDate(d.expiresAt)}
                        {soon ? <div className="subnote">in {dl}d</div> : null}
                        {expired ? <div className="subnote">{Math.abs(dl!)}d ago</div> : null}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            d.status === "AVAILABLE"
                              ? expired
                                ? "red"
                                : soon
                                  ? "amber"
                                  : "green"
                              : d.status === "USED"
                                ? "blue"
                                : "red"
                          }`}
                        >
                          {labelFor(DEPOSIT_STATUS, d.status)}
                        </span>
                      </td>
                      <td className="right">
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          {d.status === "AVAILABLE" ? (
                            <form action={setDepositStatus} className="inline-form">
                              <input type="hidden" name="id" value={d.id} />
                              <input type="hidden" name="status" value="USED" />
                              <button className="btn ghost small" type="submit">
                                Mark traded
                              </button>
                            </form>
                          ) : null}
                          <form action={deleteDeposit} className="inline-form">
                            <input type="hidden" name="id" value={d.id} />
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

          <details>
            <summary className="muted" style={{ cursor: "pointer", marginBottom: 10 }}>
              + Deposit a week / points
            </summary>
            <form action={createDeposit} className="grid" style={{ marginTop: 10 }}>
              <input type="hidden" name="membershipId" value={m.id} />
              <div className="field">
                <label>Description</label>
                <input name="description" placeholder="2026 Week 26 — Bonnet Creek 2BR" />
              </div>
              <div className="field">
                <label>Type</label>
                <select name="depositType" defaultValue="WEEK">
                  {DEPOSIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Source timeshare</label>
                <select name="timeshareId" defaultValue={m.timeshareId ?? ""}>
                  <option value="">— None —</option>
                  {timeshares.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Trading power</label>
                <input name="tradingPower" type="number" step="0.01" />
              </div>
              <div className="field">
                <label>Points value</label>
                <input name="pointsValue" type="number" placeholder="(for points deposits)" />
              </div>
              <div className="field">
                <label>Deposit date</label>
                <input name="depositDate" type="date" />
              </div>
              <div className="field">
                <label>Expires</label>
                <input name="expiresAt" type="date" />
              </div>
              <div className="field">
                <label>Status</label>
                <select name="status" defaultValue="AVAILABLE">
                  {DEPOSIT_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button className="btn small" type="submit">
                  Add deposit
                </button>
              </div>
            </form>
          </details>
        </div>
      ))}
    </div>
  );
}
