import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  commissionOf,
  contactName,
  daysUntil,
  formatCurrency,
  formatDate,
  labelFor,
  nights,
  toDateInput,
  ACTIVITY_ICONS,
  ACTIVITY_TYPES,
  CONTACT_SOURCES,
  CONTACT_STATUS,
  CONTACT_TYPES,
  DEAL_STAGES,
  OPEN_STAGES,
} from "@/lib/format";
import {
  completeActivity,
  createDeal,
  deleteActivity,
  deleteContact,
  deleteDeal,
  logActivity,
  updateContact,
  updateDealStage,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      deals: { orderBy: { createdAt: "desc" } },
      activities: { orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }] },
      reservations: { orderBy: { checkIn: "desc" }, include: { timeshare: true } },
    },
  });
  if (!contact) notFound();

  const openDeals = contact.deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const wonDeals = contact.deals.filter((d) => d.stage === "WON");
  const lifetimeValue = wonDeals.reduce((s, d) => s + d.value, 0);
  const earned =
    wonDeals.reduce((s, d) => s + commissionOf(d), 0) +
    contact.reservations.reduce((s, r) => s + r.commission, 0);
  const openPipeline = openDeals.reduce((s, d) => s + commissionOf(d), 0);
  const openTasks = contact.activities.filter((a) => !a.done);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{contactName(contact)}</h1>
          <p>
            {labelFor(CONTACT_TYPES, contact.type)} ·{" "}
            {labelFor(CONTACT_STATUS, contact.status)}
            {contact.source ? ` · via ${labelFor(CONTACT_SOURCES, contact.source)}` : ""}
          </p>
        </div>
        <div className="filters">
          <Link className="btn ghost small" href="/contacts">
            ← All contacts
          </Link>
          <form action={deleteContact} className="inline-form">
            <input type="hidden" name="id" value={contact.id} />
            <button className="btn danger small" type="submit">
              Delete contact
            </button>
          </form>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Lifetime value</div>
          <div className="value">{formatCurrency(lifetimeValue)}</div>
          <div className="sub">{wonDeals.length} won deals</div>
        </div>
        <div className="card">
          <div className="label">Commission earned</div>
          <div className="value">{formatCurrency(earned)}</div>
          <div className="sub">Deals + bookings</div>
        </div>
        <div className="card">
          <div className="label">Open pipeline</div>
          <div className="value">{formatCurrency(openPipeline)}</div>
          <div className="sub">{openDeals.length} live deals</div>
        </div>
        <div className="card">
          <div className="label">Open follow-ups</div>
          <div className="value">{openTasks.length}</div>
          <div className="sub">
            {contact.lastContactAt
              ? `Last touch ${formatDate(contact.lastContactAt)}`
              : "No touchpoints logged"}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Log a touchpoint or follow-up</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 14 }}>
          Leave the due date blank to log something that already happened; set one to
          create an open follow-up.
        </p>
        <form action={logActivity} className="grid">
          <input type="hidden" name="contactId" value={contact.id} />
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue="CALL">
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Subject *</label>
            <input name="subject" required placeholder="Sent Cancun quote" />
          </div>
          <div className="field">
            <label>Related deal</label>
            <select name="dealId" defaultValue="">
              <option value="">— None —</option>
              {contact.deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Due (makes it a follow-up)</label>
            <input name="dueAt" type="date" />
          </div>
          <div className="field full">
            <label>Details</label>
            <textarea name="body" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Save activity
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Timeline ({contact.activities.length})</h2>
        {contact.activities.length === 0 ? (
          <div className="empty">Nothing logged yet.</div>
        ) : (
          <div className="timeline">
            {contact.activities.map((a) => {
              const d = daysUntil(a.dueAt);
              return (
                <div key={a.id} className={`timeline-item${a.done ? " done" : ""}`}>
                  <span className="timeline-icon">{ACTIVITY_ICONS[a.type] ?? "📝"}</span>
                  <div className="timeline-body">
                    <strong>{a.subject}</strong>
                    <div className="subnote">
                      {labelFor(ACTIVITY_TYPES, a.type)} ·{" "}
                      {a.done
                        ? `Done ${formatDate(a.doneAt ?? a.createdAt)}`
                        : a.dueAt
                          ? `Due ${formatDate(a.dueAt)}`
                          : `Logged ${formatDate(a.createdAt)}`}
                    </div>
                    {a.body ? <div className="timeline-note">{a.body}</div> : null}
                  </div>
                  <div className="timeline-actions">
                    {!a.done && d != null ? (
                      <span className={`badge ${d < 0 ? "red" : d <= 3 ? "amber" : "blue"}`}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `${d}d`}
                      </span>
                    ) : null}
                    {!a.done ? (
                      <form action={completeActivity} className="inline-form">
                        <input type="hidden" name="id" value={a.id} />
                        <button className="btn ghost small" type="submit">
                          Done
                        </button>
                      </form>
                    ) : null}
                    <form action={deleteActivity} className="inline-form">
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn danger small" type="submit">
                        ✕
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Deals ({contact.deals.length})</h2>
        <form action={createDeal} className="grid" style={{ marginBottom: 20 }}>
          <input type="hidden" name="contactId" value={contact.id} />
          <div className="field">
            <label>Deal title *</label>
            <input name="title" required placeholder="Cancun 7-night all-inclusive" />
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
          <div className="form-actions">
            <button className="btn" type="submit">
              Add deal
            </button>
          </div>
        </form>

        {contact.deals.length === 0 ? (
          <div className="empty">No deals for this contact yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Deal</th>
                <th>Stage</th>
                <th className="right">Value</th>
                <th className="right">Commission</th>
                <th className="right">Expected close</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contact.deals.map((d) => (
                <tr key={d.id}>
                  <td>
                    <strong>{d.title}</strong>
                    {d.notes ? <div className="subnote">{d.notes}</div> : null}
                  </td>
                  <td>
                    <form action={updateDealStage} className="stage-form">
                      <input type="hidden" name="id" value={d.id} />
                      <select name="stage" defaultValue={d.stage}>
                        {DEAL_STAGES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button className="btn small ghost" type="submit" title="Update stage">
                        ✓
                      </button>
                    </form>
                  </td>
                  <td className="right">{formatCurrency(d.value)}</td>
                  <td className="right">
                    {formatCurrency(commissionOf(d))}
                    <div className="subnote">{d.commissionRate}%</div>
                  </td>
                  <td className="right">{formatDate(d.expectedCloseAt)}</td>
                  <td className="right">
                    <form action={deleteDeal} className="inline-form">
                      <input type="hidden" name="id" value={d.id} />
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

      <div className="panel">
        <div className="section-title">
          <h2>Trips booked ({contact.reservations.length})</h2>
          <Link className="btn ghost small" href="/reservations">
            Book a stay
          </Link>
        </div>
        {contact.reservations.length === 0 ? (
          <div className="empty">No stays booked for this contact yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Resort</th>
                <th>Dates</th>
                <th className="right">Nights</th>
                <th className="right">Client paid</th>
                <th className="right">Commission</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contact.reservations.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.resort}</strong>
                    {r.timeshare ? (
                      <div className="subnote">{r.timeshare.name}</div>
                    ) : null}
                  </td>
                  <td>
                    {formatDate(r.checkIn)}
                    <div className="subnote">→ {formatDate(r.checkOut)}</div>
                  </td>
                  <td className="right">{nights(r.checkIn, r.checkOut)}</td>
                  <td className="right">{formatCurrency(r.clientCharge)}</td>
                  <td className="right">{formatCurrency(r.commission)}</td>
                  <td>
                    <span className="badge">{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Contact details</h2>
        <form action={updateContact} className="grid">
          <input type="hidden" name="id" value={contact.id} />
          <div className="field">
            <label>First name *</label>
            <input name="firstName" required defaultValue={contact.firstName} />
          </div>
          <div className="field">
            <label>Last name</label>
            <input name="lastName" defaultValue={contact.lastName ?? ""} />
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" defaultValue={contact.email ?? ""} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input name="phone" defaultValue={contact.phone ?? ""} />
          </div>
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue={contact.type}>
              {CONTACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue={contact.status}>
              {CONTACT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Source</label>
            <select name="source" defaultValue={contact.source ?? ""}>
              <option value="">— Unknown —</option>
              {CONTACT_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Company</label>
            <input name="company" defaultValue={contact.company ?? ""} />
          </div>
          <div className="field">
            <label>City</label>
            <input name="city" defaultValue={contact.city ?? ""} />
          </div>
          <div className="field">
            <label>State</label>
            <input name="state" defaultValue={contact.state ?? ""} />
          </div>
          <div className="field">
            <label>Next follow-up</label>
            <input
              name="nextFollowUpAt"
              type="date"
              defaultValue={toDateInput(contact.nextFollowUpAt)}
            />
          </div>
          <div className="field">
            <label>Tags</label>
            <input name="tags" defaultValue={contact.tags ?? ""} />
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea name="notes" defaultValue={contact.notes ?? ""} />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
