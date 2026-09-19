import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  contactName,
  daysUntil,
  formatDate,
  labelFor,
  ACTIVITY_ICONS,
  ACTIVITY_TYPES,
} from "@/lib/format";
import { completeActivity, deleteActivity, logActivity } from "../contacts/actions";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof loadActivities>>[number];

async function loadActivities() {
  return prisma.activity.findMany({
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    include: { contact: true, deal: true },
  });
}

export default async function ActivitiesPage() {
  const [activities, contacts] = await Promise.all([
    loadActivities(),
    prisma.contact.findMany({ orderBy: [{ firstName: "asc" }, { lastName: "asc" }] }),
  ]);

  const open = activities.filter((a) => !a.done);
  const overdue = open.filter((a) => {
    const d = daysUntil(a.dueAt);
    return d != null && d < 0;
  });
  const today = open.filter((a) => daysUntil(a.dueAt) === 0);
  const upcoming = open.filter((a) => {
    const d = daysUntil(a.dueAt);
    return d == null || d > 0;
  });
  const completed = activities.filter((a) => a.done).slice(0, 25);

  const renderList = (rows: Row[], emptyText: string) =>
    rows.length === 0 ? (
      <div className="empty">{emptyText}</div>
    ) : (
      <div className="timeline">
        {rows.map((a) => {
          const d = daysUntil(a.dueAt);
          return (
            <div key={a.id} className={`timeline-item${a.done ? " done" : ""}`}>
              <span className="timeline-icon">{ACTIVITY_ICONS[a.type] ?? "📝"}</span>
              <div className="timeline-body">
                <strong>{a.subject}</strong>
                <div className="subnote">
                  {a.contact ? (
                    <Link href={`/contacts/${a.contact.id}`} className="link">
                      {contactName(a.contact)}
                    </Link>
                  ) : (
                    "No contact"
                  )}
                  {" · "}
                  {labelFor(ACTIVITY_TYPES, a.type)}
                  {a.deal ? ` · ${a.deal.title}` : ""}
                  {" · "}
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
    );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Activities</h1>
          <p>Your follow-up queue — nothing falls through the cracks.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Overdue</div>
          <div className="value">{overdue.length}</div>
          <div className="sub">Chase these first</div>
        </div>
        <div className="card">
          <div className="label">Due today</div>
          <div className="value">{today.length}</div>
        </div>
        <div className="card">
          <div className="label">Upcoming</div>
          <div className="value">{upcoming.length}</div>
          <div className="sub">Scheduled or unscheduled</div>
        </div>
        <div className="card">
          <div className="label">Completed</div>
          <div className="value">{activities.length - open.length}</div>
          <div className="sub">All time</div>
        </div>
      </div>

      <div className="panel">
        <h2>Quick add</h2>
        <form action={logActivity} className="grid">
          <div className="field">
            <label>Contact</label>
            <select name="contactId" defaultValue="">
              <option value="">— None —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {contactName(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue="TASK">
              {ACTIVITY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Subject *</label>
            <input name="subject" required placeholder="Call back about April dates" />
          </div>
          <div className="field">
            <label>Due</label>
            <input name="dueAt" type="date" />
          </div>
          <div className="field full">
            <label>Details</label>
            <textarea name="body" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add activity
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Overdue ({overdue.length})</h2>
        {renderList(overdue, "Nothing overdue. 🎉")}
      </div>

      <div className="panel">
        <h2>Due today ({today.length})</h2>
        {renderList(today, "Nothing due today.")}
      </div>

      <div className="panel">
        <h2>Upcoming ({upcoming.length})</h2>
        {renderList(upcoming, "No upcoming activities.")}
      </div>

      <div className="panel">
        <h2>Recently completed</h2>
        {renderList(completed, "Nothing completed yet.")}
      </div>
    </div>
  );
}
