import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  daysUntil,
  formatDate,
  labelFor,
  PROJECT_PRIORITY,
  WIP_LIMIT,
} from "@/lib/format";
import {
  activateProject,
  addTask,
  capture,
  createProject,
  dismissInboxItem,
  promoteInboxItem,
  queueProject,
  toggleTask,
} from "./actions";

export const dynamic = "force-dynamic";

const PRIORITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const FLASH: Record<string, string> = {
  wip: `🚦 Focus limit reached — all ${WIP_LIMIT} active slots are full. Close a project out (or send one back to the queue) before starting another. That's the system working.`,
  done: "🎉 Closed out! One less open loop. Pull the next project from Up Next when you're ready.",
  dropped: "✂️ Dropped — a deliberate no is progress too. The list only shrinks when things end.",
};

export default async function BrainPage({
  searchParams,
}: {
  searchParams: Promise<{ flash?: string }>;
}) {
  const { flash } = await searchParams;
  const [inbox, projects] = await Promise.all([
    prisma.inboxItem.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({
      include: { tasks: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const active = projects.filter((p) => p.status === "ACTIVE");
  const queued = projects
    .filter((p) => p.status === "QUEUED")
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1) ||
        (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity),
    );
  const waiting = projects.filter((p) => p.status === "WAITING");
  const closed = projects
    .filter((p) => p.status === "DONE" || p.status === "DROPPED")
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const shippedThisMonth = closed.filter(
    (p) => p.status === "DONE" && p.completedAt && p.completedAt >= monthStart,
  ).length;

  const openSlots = Math.max(0, WIP_LIMIT - active.length);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>🧠 Second Brain</h1>
          <p>
            Capture everything. Work on at most {WIP_LIMIT}. Close things out, then pull
            the next one.
          </p>
        </div>
      </div>

      {flash && FLASH[flash] ? <div className="flash">{FLASH[flash]}</div> : null}

      <div className="cards">
        <div className="card">
          <div className="label">Focus slots</div>
          <div className="value">
            {active.length}/{WIP_LIMIT}
          </div>
          <div className="sub">
            {openSlots === 0
              ? "Full — finish something to start something"
              : `${openSlots} slot(s) open`}
          </div>
        </div>
        <div className="card">
          <div className="label">Up next</div>
          <div className="value">{queued.length}</div>
          <div className="sub">queued until a slot opens</div>
        </div>
        <div className="card">
          <div className="label">Waiting on others</div>
          <div className="value">{waiting.length}</div>
        </div>
        <div className="card">
          <div className="label">Shipped this month</div>
          <div className="value">{shippedThisMonth}</div>
          <div className="sub">{closed.filter((p) => p.status === "DONE").length} done all-time</div>
        </div>
      </div>

      <div className="panel">
        <h2>⚡ Quick capture</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          Anything on your mind — idea, errand, commitment. Get it out of your head now,
          decide what it is later. Capturing is not committing.
        </p>
        <form action={capture} className="capture-form">
          <input name="content" placeholder="e.g. Call Wyndham about banking 2026 points…" required />
          <button className="btn" type="submit">
            Capture
          </button>
        </form>
        {inbox.length > 0 ? (
          <ul className="inbox-list">
            {inbox.map((item) => (
              <li key={item.id}>
                <span>
                  {item.content}
                  <span className="subnote"> · {formatDate(item.createdAt)}</span>
                </span>
                <span className="inbox-actions">
                  <form action={promoteInboxItem} className="inline-form">
                    <input type="hidden" name="id" value={item.id} />
                    <button className="btn ghost small" type="submit">
                      → Project
                    </button>
                  </form>
                  <form action={dismissInboxItem} className="inline-form">
                    <input type="hidden" name="id" value={item.id} />
                    <button className="btn danger small" type="submit">
                      ✕
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>🎯 Now — your only {WIP_LIMIT} jobs</h2>
        </div>
        <div className="focus-grid">
          {active.map((p) => {
            const next = p.tasks.find((t) => !t.done);
            const doneCount = p.tasks.filter((t) => t.done).length;
            const dleft = daysUntil(p.dueDate);
            return (
              <div key={p.id} className="focus-card">
                <div className="focus-badges">
                  <span
                    className={`badge ${p.priority === "HIGH" ? "red" : p.priority === "LOW" ? "" : "blue"}`}
                  >
                    {labelFor(PROJECT_PRIORITY, p.priority)}
                  </span>
                  {p.dueDate ? (
                    <span className={`badge ${dleft != null && dleft < 0 ? "red" : dleft != null && dleft <= 7 ? "amber" : ""}`}>
                      {dleft != null && dleft < 0
                        ? `${Math.abs(dleft)}d overdue`
                        : `due ${formatDate(p.dueDate)}`}
                    </span>
                  ) : null}
                </div>
                <h3>
                  <Link href={`/brain/projects/${p.id}`}>{p.name}</Link>
                </h3>
                {p.outcome ? <div className="subnote">🏁 Done when: {p.outcome}</div> : null}
                {p.tasks.length > 0 ? (
                  <>
                    <div className="progress">
                      <span style={{ width: `${Math.round((doneCount / p.tasks.length) * 100)}%` }} />
                    </div>
                    <div className="subnote">
                      {doneCount}/{p.tasks.length} steps done
                    </div>
                  </>
                ) : null}
                <div className="next-action">
                  {next ? (
                    <form action={toggleTask} className="inline-form next-action-row">
                      <input type="hidden" name="id" value={next.id} />
                      <button className="check" type="submit" title="Mark done">
                        ✓
                      </button>
                      <span>
                        <strong>Next:</strong> {next.title}
                      </span>
                    </form>
                  ) : (
                    <span className="badge amber">
                      No next action — add one below or close it out
                    </span>
                  )}
                </div>
                <form action={addTask} className="capture-form small">
                  <input type="hidden" name="projectId" value={p.id} />
                  <input name="title" placeholder="Add a step…" required />
                  <button className="btn ghost small" type="submit">
                    +
                  </button>
                </form>
                <div className="focus-footer">
                  <Link className="btn ghost small" href={`/brain/projects/${p.id}#closeout`}>
                    🏁 Close out
                  </Link>
                  <form action={queueProject} className="inline-form">
                    <input type="hidden" name="id" value={p.id} />
                    <button className="btn ghost small" type="submit">
                      ↩ Back to queue
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
          {Array.from({ length: openSlots }).map((_, i) => (
            <div key={i} className="focus-card open-slot">
              <div>
                <div style={{ fontSize: 22 }}>🟢</div>
                Open slot — pull your top project from <strong>Up Next</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>📥 Up next ({queued.length})</h2>
        </div>
        {queued.length === 0 ? (
          <div className="empty">Queue is empty. Capture something or add a project below.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Priority</th>
                <th>Due</th>
                <th>Steps</th>
                <th className="right"></th>
              </tr>
            </thead>
            <tbody>
              {queued.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/brain/projects/${p.id}`}>{p.name}</Link>
                    {p.outcome ? <div className="subnote">🏁 {p.outcome}</div> : null}
                  </td>
                  <td>
                    <span className={`badge ${p.priority === "HIGH" ? "red" : p.priority === "LOW" ? "" : "blue"}`}>
                      {labelFor(PROJECT_PRIORITY, p.priority)}
                    </span>
                  </td>
                  <td>{formatDate(p.dueDate)}</td>
                  <td>
                    {p.tasks.filter((t) => t.done).length}/{p.tasks.length}
                  </td>
                  <td className="right">
                    <form action={activateProject} className="inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn small" type="submit" disabled={openSlots === 0}>
                        {openSlots === 0 ? "Slots full" : "▶ Start"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {waiting.length > 0 ? (
        <div className="panel">
          <div className="section-title">
            <h2>⏸ Waiting on someone / something ({waiting.length})</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Waiting on</th>
                <th>Due</th>
                <th className="right"></th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/brain/projects/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.waitingOn ?? "—"}</td>
                  <td>{formatDate(p.dueDate)}</td>
                  <td className="right">
                    <form action={activateProject} className="inline-form">
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn ghost small" type="submit">
                        ▶ Resume
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="panel">
        <h2>➕ New project</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          Before it goes on the list, define the finish line. A project without a
          &ldquo;done when&rdquo; never ends.
        </p>
        <form action={createProject} className="grid">
          <div className="field full">
            <label>Project name *</label>
            <input name="name" required placeholder="e.g. Book 2026 summer trip with banked points" />
          </div>
          <div className="field full">
            <label>Done when… (definition of done)</label>
            <input name="outcome" placeholder="e.g. Reservation confirmed and confirmation # saved in CRM" />
          </div>
          <div className="field full">
            <label>Why it matters</label>
            <input name="why" placeholder="What does finishing this unlock?" />
          </div>
          <div className="field">
            <label>Priority</label>
            <select name="priority" defaultValue="MEDIUM">
              {PROJECT_PRIORITY.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Due date</label>
            <input name="dueDate" type="date" />
          </div>
          <div className="field">
            <label>Start where?</label>
            <select name="status" defaultValue="QUEUED">
              <option value="QUEUED">Up next (queue)</option>
              <option value="ACTIVE">Active now (if a slot is free)</option>
            </select>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add project
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>🏆 Closed out ({closed.length})</h2>
        </div>
        {closed.length === 0 ? (
          <div className="empty">Nothing closed yet — your first win goes here.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Result</th>
                <th>Closed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {closed.slice(0, 10).map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/brain/projects/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>{p.closeNotes ?? "—"}</td>
                  <td>{formatDate(p.completedAt)}</td>
                  <td>
                    <span className={`badge ${p.status === "DONE" ? "green" : ""}`}>
                      {p.status === "DONE" ? "Done" : "Dropped"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>🔄 Weekly review (10 minutes, once a week)</h2>
        <ul className="review-list">
          <li>Empty the inbox — every item becomes a project, a step on one, or gets dismissed.</li>
          <li>For each <strong>active</strong> project: is the next action still right? Can you close it out this week?</li>
          <li>Check <strong>Waiting</strong> — nudge anyone you&rsquo;ve been waiting on more than a week.</li>
          <li>Scan <strong>Up next</strong> — drop anything you&rsquo;d no longer start today. Shorter list, faster finishes.</li>
          <li>New ideas this week? They go to the <em>queue</em>, never straight to active.</li>
        </ul>
      </div>
    </div>
  );
}
