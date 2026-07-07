import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  formatDate,
  labelFor,
  toDateInput,
  PROJECT_PRIORITY,
  PROJECT_STATUS,
} from "@/lib/format";
import {
  activateProject,
  addTask,
  closeProject,
  deleteProject,
  deleteTask,
  dropProject,
  queueProject,
  reopenProject,
  toggleTask,
  updateProject,
  waitProject,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await prisma.project.findUnique({
    where: { id },
    include: { tasks: { orderBy: { createdAt: "asc" } } },
  });
  if (!p) notFound();

  const open = p.tasks.filter((t) => !t.done);
  const done = p.tasks.filter((t) => t.done);
  const isClosed = p.status === "DONE" || p.status === "DROPPED";

  return (
    <div>
      <div className="page-head">
        <div>
          <p className="subnote">
            <Link href="/brain">🧠 Second Brain</Link> / project
          </p>
          <h1>{p.name}</h1>
          <p>
            <span className={`badge ${p.status === "ACTIVE" ? "blue" : p.status === "DONE" ? "green" : p.status === "WAITING" ? "amber" : ""}`}>
              {labelFor(PROJECT_STATUS, p.status)}
            </span>{" "}
            {p.startedAt ? <span className="subnote">started {formatDate(p.startedAt)}</span> : null}{" "}
            {p.completedAt ? <span className="subnote">· closed {formatDate(p.completedAt)}</span> : null}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {p.status !== "ACTIVE" && !isClosed ? (
            <form action={activateProject} className="inline-form">
              <input type="hidden" name="id" value={p.id} />
              <button className="btn" type="submit">
                ▶ Start now
              </button>
            </form>
          ) : null}
          {p.status === "ACTIVE" ? (
            <form action={queueProject} className="inline-form">
              <input type="hidden" name="id" value={p.id} />
              <button className="btn ghost" type="submit">
                ↩ Back to queue
              </button>
            </form>
          ) : null}
          {isClosed ? (
            <form action={reopenProject} className="inline-form">
              <input type="hidden" name="id" value={p.id} />
              <button className="btn ghost" type="submit">
                Reopen
              </button>
            </form>
          ) : null}
          <form action={deleteProject} className="inline-form">
            <input type="hidden" name="id" value={p.id} />
            <button className="btn danger" type="submit">
              Delete
            </button>
          </form>
        </div>
      </div>

      {isClosed && p.closeNotes ? (
        <div className="flash">
          {p.status === "DONE" ? "🏆" : "✂️"} Close-out: {p.closeNotes}
        </div>
      ) : null}

      <div className="panel">
        <h2>Steps</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          Keep each step small enough to finish in one sitting. The top unchecked step is
          your next action.
        </p>
        {!isClosed ? (
          <form action={addTask} className="capture-form">
            <input type="hidden" name="projectId" value={p.id} />
            <input name="title" placeholder="Add a step…" required />
            <button className="btn" type="submit">
              Add step
            </button>
          </form>
        ) : null}
        {p.tasks.length === 0 ? (
          <div className="empty">No steps yet. What&rsquo;s the very first physical action?</div>
        ) : (
          <ul className="task-list">
            {[...open, ...done].map((t, i) => (
              <li key={t.id} className={t.done ? "done" : ""}>
                <form action={toggleTask} className="inline-form">
                  <input type="hidden" name="id" value={t.id} />
                  <button className="check" type="submit" title={t.done ? "Undo" : "Mark done"}>
                    {t.done ? "✓" : ""}
                  </button>
                </form>
                <span className="task-title">
                  {t.title}
                  {!t.done && i === 0 ? <span className="badge blue">next</span> : null}
                  {t.done && t.doneAt ? (
                    <span className="subnote"> · {formatDate(t.doneAt)}</span>
                  ) : null}
                </span>
                <form action={deleteTask} className="inline-form">
                  <input type="hidden" name="id" value={t.id} />
                  <button className="btn danger small" type="submit">
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isClosed ? (
        <div className="panel" id="closeout">
          <h2>🏁 Close it out</h2>
          <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
            {open.length === 0
              ? "All steps done — finish the job: write the result and close it."
              : `${open.length} step(s) still open. You can still close it if it's truly finished, or drop it if it no longer deserves your time.`}
          </p>
          <form action={closeProject} className="grid">
            <input type="hidden" name="id" value={p.id} />
            <div className="field full">
              <label>Result / lessons / loose ends handed off</label>
              <textarea name="closeNotes" placeholder="What happened? What did you learn? Anything left over goes to the inbox as a new capture." />
            </div>
            <div className="form-actions">
              <button className="btn" type="submit">
                ✅ Mark DONE
              </button>
            </div>
          </form>
          <form action={dropProject} style={{ marginTop: 10 }}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="closeNotes" value="Deliberately dropped." />
            <button className="btn danger small" type="submit">
              ✂️ Drop this project (a deliberate no)
            </button>
          </form>
        </div>
      ) : null}

      {!isClosed && p.status !== "WAITING" ? (
        <div className="panel">
          <h2>⏸ Blocked?</h2>
          <form action={waitProject} className="capture-form">
            <input type="hidden" name="id" value={p.id} />
            <input name="waitingOn" placeholder="Waiting on… e.g. RCI callback, Maria's signature" required />
            <button className="btn ghost" type="submit">
              Park as Waiting
            </button>
          </form>
        </div>
      ) : null}

      <div className="panel">
        <h2>Details</h2>
        <form action={updateProject} className="grid">
          <input type="hidden" name="id" value={p.id} />
          <div className="field full">
            <label>Project name *</label>
            <input name="name" required defaultValue={p.name} />
          </div>
          <div className="field full">
            <label>Done when… (definition of done)</label>
            <input name="outcome" defaultValue={p.outcome ?? ""} placeholder="How will you know it's finished?" />
          </div>
          <div className="field full">
            <label>Why it matters</label>
            <input name="why" defaultValue={p.why ?? ""} />
          </div>
          <div className="field">
            <label>Priority</label>
            <select name="priority" defaultValue={p.priority}>
              {PROJECT_PRIORITY.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Due date</label>
            <input name="dueDate" type="date" defaultValue={toDateInput(p.dueDate)} />
          </div>
          <div className="field">
            <label>Waiting on</label>
            <input name="waitingOn" defaultValue={p.waitingOn ?? ""} />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Save details
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
