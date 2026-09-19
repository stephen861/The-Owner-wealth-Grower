import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  commissionOf,
  contactName,
  daysUntil,
  formatCurrency,
  formatDate,
  weightedCommissionOf,
  DEAL_STAGES,
  OPEN_STAGES,
} from "@/lib/format";
import { createDeal, updateDealStage } from "../contacts/actions";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [deals, contacts] = await Promise.all([
    prisma.deal.findMany({
      orderBy: [{ expectedCloseAt: "asc" }, { createdAt: "desc" }],
      include: { contact: true },
    }),
    prisma.contact.findMany({ orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
  ]);

  const open = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const won = deals.filter((d) => d.stage === "WON");
  const lost = deals.filter((d) => d.stage === "LOST");

  const pipelineValue = open.reduce((s, d) => s + d.value, 0);
  const forecast = open.reduce((s, d) => s + weightedCommissionOf(d), 0);
  const wonCommission = won.reduce((s, d) => s + commissionOf(d), 0);
  const closed = won.length + lost.length;
  const winRate = closed === 0 ? 0 : Math.round((won.length / closed) * 100);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <p>Every deal in flight, what it is worth, and what closes next.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Open pipeline</div>
          <div className="value">{formatCurrency(pipelineValue)}</div>
          <div className="sub">{open.length} live deals</div>
        </div>
        <div className="card">
          <div className="label">Weighted commission forecast</div>
          <div className="value">{formatCurrency(forecast)}</div>
          <div className="sub">Adjusted for probability</div>
        </div>
        <div className="card">
          <div className="label">Commission won</div>
          <div className="value">{formatCurrency(wonCommission)}</div>
          <div className="sub">{won.length} closed-won</div>
        </div>
        <div className="card">
          <div className="label">Win rate</div>
          <div className="value">{winRate}%</div>
          <div className="sub">{closed} deals closed</div>
        </div>
      </div>

      <div className="panel">
        <h2>Board</h2>
        <div className="board">
          {DEAL_STAGES.map((stage) => {
            const rows = deals.filter((d) => d.stage === stage.value);
            const total = rows.reduce((s, d) => s + d.value, 0);
            return (
              <div key={stage.value} className="board-col">
                <div className="board-head">
                  <span>{stage.label}</span>
                  <span className="badge">{rows.length}</span>
                </div>
                <div className="board-total">{formatCurrency(total)}</div>
                {rows.length === 0 ? (
                  <div className="board-empty">—</div>
                ) : (
                  rows.map((d) => {
                    const days = daysUntil(d.expectedCloseAt);
                    return (
                      <div key={d.id} className="deal-card">
                        <strong>{d.title}</strong>
                        <Link href={`/contacts/${d.contactId}`} className="subnote link">
                          {contactName(d.contact)}
                        </Link>
                        <div className="deal-figures">
                          <span>{formatCurrency(d.value)}</span>
                          <span className="muted">{formatCurrency(commissionOf(d))} comm.</span>
                        </div>
                        {d.expectedCloseAt ? (
                          <div className="subnote">
                            Close {formatDate(d.expectedCloseAt)}
                            {days != null && days < 0 && stage.open ? (
                              <span className="badge red" style={{ marginLeft: 6 }}>
                                overdue
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        {stage.open ? (
                          <form action={updateDealStage} className="stage-form">
                            <input type="hidden" name="id" value={d.id} />
                            <select name="stage" defaultValue={d.stage}>
                              {DEAL_STAGES.map((s) => (
                                <option key={s.value} value={s.value}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                            <button className="btn small ghost" type="submit" title="Move">
                              →
                            </button>
                          </form>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>Add a deal</h2>
        {contacts.length === 0 ? (
          <div className="empty">
            Add a contact first — every deal belongs to someone.{" "}
            <Link href="/contacts">Go to contacts</Link>
          </div>
        ) : (
          <form action={createDeal} className="grid">
            <div className="field">
              <label>Contact *</label>
              <select name="contactId" required defaultValue="">
                <option value="" disabled>
                  — Select —
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {contactName(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Deal title *</label>
              <input name="title" required placeholder="Maui 10-night — Chen family" />
            </div>
            <div className="field">
              <label>Stage</label>
              <select name="stage" defaultValue="NEW">
                {DEAL_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Value ($)</label>
              <input name="value" type="number" step="0.01" defaultValue={0} />
            </div>
            <div className="field">
              <label>Commission rate (%)</label>
              <input name="commissionRate" type="number" step="0.1" defaultValue={10} />
            </div>
            <div className="field">
              <label>Probability (%)</label>
              <input name="probability" type="number" min={0} max={100} defaultValue={25} />
            </div>
            <div className="field">
              <label>Expected close</label>
              <input name="expectedCloseAt" type="date" />
            </div>
            <div className="field full">
              <label>Notes</label>
              <textarea name="notes" />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">
                Add deal
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
