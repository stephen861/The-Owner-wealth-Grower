import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { checkInHealth, filterByDivision } from "@/lib/command-center/domain";
import { readDivision } from "@/lib/command-center/view";
import { recordAgentCheckInAction } from "@/lib/command-center/actions";

export const dynamic = "force-dynamic";

const HEALTH_BADGE: Record<string, string> = {
  BLOCKED: "red",
  NEVER: "red",
  STALE: "amber",
  NO_EVIDENCE: "amber",
  FRESH: "green",
};

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);
  const all = await prisma.demoAgentCheckIn.findMany({ orderBy: { agentName: "asc" } });
  const agents = filterByDivision(all, division);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Agent check-ins</h1>
          <p>Last check-in, last evidence, and blocked state.</p>
        </div>
      </div>

      <div className="cc-notice danger">
        <strong>A blocked agent is reported blocked, whatever its own note claims.</strong>{" "}
        The blocked flag is authoritative. A check-in timestamp proves only that something
        ran — not that it did the work correctly, and not that anything was delivered. An
        agent with no evidence attached is called out separately rather than counted as
        healthy.
      </div>

      <div className="panel">
        <h2>Agents ({agents.length})</h2>
        {agents.length === 0 ? (
          <div className="empty">No agents in this filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Scope</th>
                <th>Health</th>
                <th>Last check-in</th>
                <th>Last evidence</th>
                <th>Record a check-in</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const { health, hoursSince } = checkInHealth(agent);
                return (
                  <tr key={agent.id}>
                    <td>
                      <strong>{agent.agentName}</strong>
                      <div className="subnote">
                        <span className={`badge ${agent.division === "AFLH" ? "blue" : ""}`}>
                          {agent.division}
                        </span>
                      </div>
                    </td>
                    <td>{agent.scope}</td>
                    <td>
                      <span className={`badge ${HEALTH_BADGE[health] ?? ""}`}>{health}</span>
                      {agent.blocked ? (
                        <div className="subnote">{agent.blockedReason}</div>
                      ) : null}
                    </td>
                    <td>
                      {agent.lastCheckInAt ? (
                        <>
                          {formatDate(agent.lastCheckInAt)}
                          <div className="subnote">
                            {hoursSince != null ? `${Math.round(hoursSince)}h ago` : ""}
                          </div>
                        </>
                      ) : (
                        <span className="muted">never</span>
                      )}
                    </td>
                    <td>
                      {agent.lastEvidenceNote ? (
                        <>
                          {agent.lastEvidenceNote}
                          {agent.blocked ? (
                            <div className="subnote">
                              <span className="badge red">note disregarded</span> the
                              blocked flag governs
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">no evidence recorded</span>
                      )}
                    </td>
                    <td>
                      <form action={recordAgentCheckInAction} className="stage-form">
                        <input type="hidden" name="id" value={agent.id} />
                        <input
                          name="lastEvidenceNote"
                          placeholder="what it actually showed"
                          style={{ padding: "4px 6px", fontSize: 12, minWidth: 0 }}
                        />
                        <button className="btn small ghost" type="submit">
                          Log
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
