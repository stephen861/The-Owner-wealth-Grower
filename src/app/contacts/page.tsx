import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  commissionOf,
  contactName,
  daysUntil,
  formatCurrency,
  formatDate,
  labelFor,
  CONTACT_SOURCES,
  CONTACT_STATUS,
  CONTACT_TYPES,
  OPEN_STAGES,
} from "@/lib/format";
import { createContact } from "./actions";

export const dynamic = "force-dynamic";

function statusBadge(status: string): string {
  switch (status) {
    case "ACTIVE":
    case "QUALIFIED":
      return "green";
    case "NEW":
    case "CONTACTED":
      return "blue";
    case "LOST":
      return "red";
    default:
      return "";
  }
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const filter = CONTACT_TYPES.some((t) => t.value === type) ? type : undefined;

  const contacts = await prisma.contact.findMany({
    where: filter ? { type: filter } : undefined,
    orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
    include: { deals: true },
  });

  const clients = contacts.filter((c) => c.type === "CLIENT").length;
  const leads = contacts.filter((c) => c.type === "LEAD").length;
  const openCommission = contacts.reduce(
    (sum, c) =>
      sum +
      c.deals
        .filter((d) => OPEN_STAGES.includes(d.stage))
        .reduce((s, d) => s + commissionOf(d), 0),
    0,
  );
  const overdue = contacts.filter((c) => {
    const d = daysUntil(c.nextFollowUpAt);
    return d != null && d < 0;
  }).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <p>Your book of business — leads, clients, partners and guests.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Clients</div>
          <div className="value">{clients}</div>
          <div className="sub">Booked at least once</div>
        </div>
        <div className="card">
          <div className="label">Leads</div>
          <div className="value">{leads}</div>
          <div className="sub">Not yet converted</div>
        </div>
        <div className="card">
          <div className="label">Open commission</div>
          <div className="value">{formatCurrency(openCommission)}</div>
          <div className="sub">Across live deals</div>
        </div>
        <div className="card">
          <div className="label">Overdue follow-ups</div>
          <div className="value">{overdue}</div>
          <div className="sub">Contacts past their date</div>
        </div>
      </div>

      <div className="panel">
        <h2>Add a contact</h2>
        <form action={createContact} className="grid">
          <div className="field">
            <label>First name *</label>
            <input name="firstName" required placeholder="Maria" />
          </div>
          <div className="field">
            <label>Last name</label>
            <input name="lastName" placeholder="Ramirez" />
          </div>
          <div className="field">
            <label>Email</label>
            <input name="email" type="email" placeholder="maria@example.com" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input name="phone" placeholder="(555) 201-8890" />
          </div>
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue="LEAD">
              {CONTACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue="NEW">
              {CONTACT_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Source</label>
            <select name="source" defaultValue="">
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
            <input name="company" />
          </div>
          <div className="field">
            <label>City</label>
            <input name="city" placeholder="Tampa" />
          </div>
          <div className="field">
            <label>State</label>
            <input name="state" placeholder="FL" />
          </div>
          <div className="field">
            <label>Next follow-up</label>
            <input name="nextFollowUpAt" type="date" />
          </div>
          <div className="field">
            <label>Tags</label>
            <input name="tags" placeholder="cruise, family, VIP" />
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea name="notes" placeholder="Wants a 2BR in Orlando over spring break." />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add contact
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>
            {filter ? labelFor(CONTACT_TYPES, filter) + "s" : "All contacts"} (
            {contacts.length})
          </h2>
          <div className="filters">
            <Link className={`btn ghost small${filter ? "" : " active"}`} href="/contacts">
              All
            </Link>
            {CONTACT_TYPES.map((t) => (
              <Link
                key={t.value}
                className={`btn ghost small${filter === t.value ? " active" : ""}`}
                href={`/contacts?type=${t.value}`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        {contacts.length === 0 ? (
          <div className="empty">No contacts yet. Add your first one above.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Contact</th>
                <th className="right">Open deals</th>
                <th className="right">Pipeline</th>
                <th className="right">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const open = c.deals.filter((d) => OPEN_STAGES.includes(d.stage));
                const pipeline = open.reduce((s, d) => s + d.value, 0);
                const d = daysUntil(c.nextFollowUpAt);
                return (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/contacts/${c.id}`}>
                        <strong>{contactName(c)}</strong>
                      </Link>
                      {c.company ? <div className="subnote">{c.company}</div> : null}
                      {c.city || c.state ? (
                        <div className="subnote">
                          {[c.city, c.state].filter(Boolean).join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td>{labelFor(CONTACT_TYPES, c.type)}</td>
                    <td>
                      <span className={`badge ${statusBadge(c.status)}`}>
                        {labelFor(CONTACT_STATUS, c.status)}
                      </span>
                    </td>
                    <td>
                      <div className="stack">
                        {c.email ? <span>{c.email}</span> : null}
                        {c.phone ? <span className="subnote">{c.phone}</span> : null}
                        {!c.email && !c.phone ? <span className="muted">—</span> : null}
                      </div>
                    </td>
                    <td className="right">{open.length}</td>
                    <td className="right">{formatCurrency(pipeline)}</td>
                    <td className="right">
                      {c.nextFollowUpAt ? (
                        <span
                          className={`badge ${
                            d != null && d < 0 ? "red" : d != null && d <= 7 ? "amber" : "blue"
                          }`}
                        >
                          {formatDate(c.nextFollowUpAt)}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
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
