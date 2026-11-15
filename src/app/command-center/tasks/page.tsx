import { prisma } from "@/lib/prisma";
import { daysUntil, formatDate } from "@/lib/format";
import { filterByDivision } from "@/lib/command-center/domain";
import { readDivision } from "@/lib/command-center/view";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);
  const all = await prisma.demoTask.findMany({
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    include: { property: true },
  });
  const tasks = filterByDivision(all, division);

  const open = tasks.filter((t) => t.status === "OPEN");
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
  const blocked = tasks.filter((t) => t.status === "BLOCKED");
  const overdue = tasks.filter(
    (t) => t.status !== "DONE" && (daysUntil(t.dueAt) ?? 1) < 0,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tasks & assignments</h1>
          <p>Who owns what, and what is stuck.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Open</div>
          <div className="value">{open.length}</div>
        </div>
        <div className="card">
          <div className="label">In progress</div>
          <div className="value">{inProgress.length}</div>
        </div>
        <div className="card">
          <div className="label">Blocked</div>
          <div className="value">{blocked.length}</div>
          <div className="sub">Needs an unblock, not a nudge</div>
        </div>
        <div className="card">
          <div className="label">Overdue</div>
          <div className="value">{overdue.length}</div>
        </div>
      </div>

      <div className="panel">
        <h2>All tasks ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <div className="empty">No tasks in this filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Division</th>
                <th>Assignee</th>
                <th>Property</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const d = daysUntil(task.dueAt);
                return (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.title}</strong>
                      <div className="subnote cc-mono">{task.sourceId}</div>
                      {task.blockedReason ? (
                        <div className="subnote">Blocked: {task.blockedReason}</div>
                      ) : null}
                    </td>
                    <td>
                      <span className={`badge ${task.division === "AFLH" ? "blue" : ""}`}>
                        {task.division}
                      </span>
                    </td>
                    <td>{task.assignee ?? <span className="muted">unassigned</span>}</td>
                    <td className="cc-mono">
                      {task.property?.sourceId ?? <span className="muted">—</span>}
                    </td>
                    <td>
                      {formatDate(task.dueAt)}
                      {task.status !== "DONE" && d != null && d < 0 ? (
                        <div className="subnote">
                          <span className="badge red">{Math.abs(d)}d overdue</span>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          task.status === "BLOCKED"
                            ? "red"
                            : task.status === "DONE"
                              ? "green"
                              : task.status === "IN_PROGRESS"
                                ? "blue"
                                : ""
                        }`}
                      >
                        {task.status}
                      </span>
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
