import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  auditProjection,
  projectionForDivision,
  syncStatus,
  WHITEBOARD_ADAPTER_CAPABILITIES,
  WHITEBOARD_TARGETS,
} from "@/lib/command-center/whiteboard";
import { readDivision } from "@/lib/command-center/view";
import {
  applyToLocalProjectionAction,
  buildCurrentProjection,
  ensureWhiteboardTargets,
  generateProjectionAction,
  replayLastProjectionAction,
  simulateSyncFailureAction,
} from "@/lib/command-center/actions";

export const dynamic = "force-dynamic";

const OUTCOME_BADGE: Record<string, string> = {
  APPLIED: "green",
  REJECTED_DUPLICATE: "amber",
  REJECTED_STALE: "amber",
  REJECTED_VERSION_CONFLICT: "amber",
  REJECTED_DISABLED: "",
  REJECTED_UNKNOWN_TARGET: "red",
  FAILED: "red",
};

export default async function WhiteboardPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);
  await ensureWhiteboardTargets();

  const targets = await prisma.demoWhiteboardTarget.findMany({
    orderBy: { targetKey: "asc" },
    include: { events: { orderBy: { at: "desc" }, take: 12 } },
  });

  const local = targets.find((t) => t.targetKey === "local-projection");
  const nextVersion = (local?.lastAppliedVersion ?? 0) + 1;
  const projection = await buildCurrentProjection(nextVersion);
  const findings = auditProjection(projection);
  const cards = projectionForDivision(projection, division);

  const payloadPreview = JSON.stringify(
    { ...projection, cards: cards.slice(0, 6) },
    null,
    2,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Whiteboard projection</h1>
          <p>A sanitized, versioned export. Generated locally; applied by a person.</p>
        </div>
      </div>

      {/* The single most important distinction on this screen. */}
      <div className="cc-notice danger">
        <strong>NOT CONNECTED to any claude.ai board.</strong> What you see below is a{" "}
        <em>local projection</em> rendered by this prototype. It is not a live view of a
        Claude artifact, and this app never fetches or edits one. The two external boards
        are recorded as documentation targets only, and both are <strong>disabled</strong>:
        an apply attempt against them is refused by design. Applying a projection to a real
        board is a deliberate human step, described under &ldquo;How to actually apply
        this&rdquo; below.
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Outbound projection</div>
          <div className="value" style={{ fontSize: 18 }}>
            {WHITEBOARD_ADAPTER_CAPABILITIES.outboundProjection ? "Yes" : "No"}
          </div>
        </div>
        <div className="card">
          <div className="label">Reverse writes</div>
          <div className="value" style={{ fontSize: 18 }}>None</div>
          <div className="sub">Board content is never read back as input</div>
        </div>
        <div className="card">
          <div className="label">Network access</div>
          <div className="value" style={{ fontSize: 18 }}>None</div>
        </div>
        <div className="card">
          <div className="label">Autonomous apply</div>
          <div className="value" style={{ fontSize: 18 }}>Disabled</div>
          <div className="sub">No scheduler, no agent</div>
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Projection targets</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Enabled</th>
              <th>Status</th>
              <th>Last success</th>
              <th>Last error</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((target) => {
              const status = syncStatus({
                targetKey: target.targetKey,
                enabled: target.enabled,
                lastAppliedVersion: target.lastAppliedVersion,
                lastAppliedContentHash: target.lastAppliedContentHash,
                lastAppliedAt: target.lastAppliedAt,
                lastSuccessAt: target.lastSuccessAt,
                lastErrorAt: target.lastErrorAt,
                lastError: target.lastError,
                consecutiveFailures: target.consecutiveFailures,
              });
              return (
                <tr key={target.id}>
                  <td>
                    <strong>{target.label}</strong>
                    <div className="subnote cc-mono">{target.targetUrl}</div>
                  </td>
                  <td>
                    <span className={`badge ${target.enabled ? "blue" : "red"}`}>
                      {target.enabled ? "local only" : "disabled"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        status.health === "OK"
                          ? "green"
                          : status.health === "NEVER_ATTEMPTED"
                            ? ""
                            : status.health === "STALE_SUCCESS"
                              ? "amber"
                              : "red"
                      }`}
                    >
                      {status.health}
                    </span>
                    <div className="subnote">{status.label}</div>
                    {status.consecutiveFailures > 0 ? (
                      <div className="subnote">
                        {status.consecutiveFailures} consecutive failure(s)
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {status.lastSuccessAt ? (
                      <>
                        v{target.lastAppliedVersion} · {formatDate(status.lastSuccessAt)}
                        <div className="subnote">
                          {status.hoursSinceSuccess != null
                            ? `${Math.round(status.hoursSinceSuccess)}h ago`
                            : ""}
                        </div>
                      </>
                    ) : (
                      <span className="muted">never</span>
                    )}
                  </td>
                  <td>
                    {status.lastError ? (
                      <>
                        <span className="badge red">{formatDate(status.lastErrorAt)}</span>
                        <div className="subnote">{status.lastError}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="badge red">never verified</span>
                    <div className="subnote">
                      A timestamp is not evidence the board applied it correctly.
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="filters" style={{ marginTop: 16 }}>
          <form action={applyToLocalProjectionAction} className="inline-form">
            <button className="btn" type="submit">
              Generate &amp; apply to LOCAL projection (v{nextVersion})
            </button>
          </form>
          <form action={replayLastProjectionAction} className="inline-form">
            <button className="btn ghost" type="submit">
              Replay the same version (shows duplicate rejection)
            </button>
          </form>
          <form action={simulateSyncFailureAction} className="inline-form">
            <input type="hidden" name="targetKey" value="local-projection" />
            <button className="btn danger" type="submit">
              Simulate a failed sync
            </button>
          </form>
          {WHITEBOARD_TARGETS.map((target) => (
            <form
              action={generateProjectionAction}
              className="inline-form"
              key={target.targetKey}
            >
              <input type="hidden" name="targetKey" value={target.targetKey} />
              <button className="btn ghost small" type="submit">
                Attempt apply → {target.targetKey} (will be refused)
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>Export contract</h2>
          <span className={`badge ${findings.length === 0 ? "green" : "red"}`}>
            {findings.length === 0 ? "leak audit clean" : `${findings.length} findings`}
          </span>
        </div>
        <table>
          <tbody>
            <tr>
              <td className="muted">Projection ID</td>
              <td className="cc-mono">{projection.projectionId}</td>
              <td className="muted">Schema</td>
              <td className="cc-mono">{projection.schemaVersion}</td>
            </tr>
            <tr>
              <td className="muted">Version</td>
              <td className="cc-mono">{projection.version}</td>
              <td className="muted">Content hash</td>
              <td className="cc-mono">{projection.contentHash}</td>
            </tr>
            <tr>
              <td className="muted">Generated at</td>
              <td className="cc-mono">{projection.generatedAt}</td>
              <td className="muted">Cards</td>
              <td className="cc-mono">{projection.cards.length}</td>
            </tr>
            <tr>
              <td className="muted">Source dataset</td>
              <td colSpan={3}>{projection.sourceDataset}</td>
            </tr>
          </tbody>
        </table>

        {findings.length > 0 ? (
          <div className="cc-notice danger">
            <strong>Leak audit failed — this payload must not be published.</strong>
            <ul className="cc-warnings">
              {findings.map((f) => (
                <li key={f.label}>
                  {f.label}: matched &ldquo;{f.sample}&rdquo;
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="cc-notice info">
            <strong>Allowlist:</strong> codes, typed status tokens, integer counts and a
            blocked-reason slug. <strong>Never projected:</strong> amounts, person names,
            addresses, emails, phone numbers, occupant identifiers, free-text notes, or
            per-referral records. Facilities appear as source codes; referrals appear only
            as stage counts.
          </div>
        )}

        <h2 style={{ marginTop: 20 }}>Notices carried with the payload</h2>
        <ul className="cc-warnings" style={{ color: "var(--muted)" }}>
          {projection.notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <div className="section-title">
          <h2>
            Local projection board — {cards.length} card
            {cards.length === 1 ? "" : "s"}
          </h2>
          <span className="badge amber">rendered locally, not a Claude artifact</span>
        </div>
        <div className="cc-board">
          {cards.map((card) => (
            <div
              className={`cc-board-card${card.blocked ? " blocked" : ""}`}
              key={card.id}
            >
              <div className="cc-card-id">{card.id}</div>
              <div className="cc-card-code">{card.code}</div>
              <div style={{ marginBottom: 8 }}>
                <span
                  className={`badge ${
                    card.blocked
                      ? "red"
                      : card.status === "READY" || card.status === "FRESH"
                        ? "green"
                        : card.status === "STEADY" || card.status === "CLEAR"
                          ? ""
                          : "amber"
                  }`}
                >
                  {card.status}
                </span>
              </div>
              {card.blockedReasonCode ? (
                <div className="subnote" style={{ marginBottom: 6 }}>
                  {card.blockedReasonCode}
                </div>
              ) : null}
              <div className="cc-metrics">
                {card.metrics.map((m) => (
                  <div className="cc-metric" key={m.key}>
                    <span className="muted">{m.key}</span>
                    <span>{m.value}</span>
                  </div>
                ))}
              </div>
              <div className="subnote" style={{ marginTop: 8 }}>
                v{card.version} · {card.division}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>Event log</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          Every attempt is logged with its outcome, including rejections. A rejection is
          not counted as a transport failure.
        </p>
        {targets.every((t) => t.events.length === 0) ? (
          <div className="empty">
            No attempts yet. Use the controls above to generate a projection.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Target</th>
                <th className="right">Version</th>
                <th>Content hash</th>
                <th>Outcome</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {targets
                .flatMap((t) => t.events.map((e) => ({ event: e, target: t })))
                .sort((a, b) => b.event.at.getTime() - a.event.at.getTime())
                .map(({ event, target }) => (
                  <tr key={event.id}>
                    <td>
                      {formatDate(event.at)}
                      <div className="subnote">
                        {event.at.toISOString().slice(11, 19)}Z
                      </div>
                    </td>
                    <td className="cc-mono">{target.targetKey}</td>
                    <td className="right cc-mono">v{event.version}</td>
                    <td className="cc-mono">{event.contentHash.slice(0, 12)}…</td>
                    <td>
                      <span className={`badge ${OUTCOME_BADGE[event.outcome] ?? ""}`}>
                        {event.outcome}
                      </span>
                    </td>
                    <td>{event.detail ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>How to actually apply this to a Claude board</h2>
        <div className="cc-notice warn">
          <strong>
            No board write API was verified in this session, and none is used here.
          </strong>{" "}
          That is a statement about this build, not a universal claim: board updates may
          well be supported through approved Claude tooling. This prototype simply does
          not have, assume or activate any such access, and no access was sought. If you
          want a supported path wired up, that is a separate, explicit piece of work.
        </div>
        <p>The supported route is a deliberate, human-driven step:</p>
        <ol>
          <li>
            Generate a projection here and copy the payload (or export it from the
            generator script).
          </li>
          <li>
            A person opens the target board in Claude and asks for the card set to be
            updated from the payload, reviewing the diff before it is saved. The board is
            re-published as a new version by that person. Where approved Claude tooling
            supports updating an artifact, that is the route — initiated and reviewed by
            a person, never by this app.
          </li>
          <li>
            Because the board is <strong>shared with anyone who has the link</strong>, only
            the allowlisted payload above may be pasted — never a command-center screen, a
            money figure, a name or an address.
          </li>
          <li>
            Record the outcome against the target so last-success and last-error stay
            truthful. An apply that was not confirmed stays <em>unverified</em>.
          </li>
        </ol>
        <p className="subnote">
          Card IDs are stable across regenerations, so a re-apply updates the same card
          rather than appending a duplicate. Agent cards key on an <strong>immutable
          source ID</strong>, never on the display name, so renaming an automation updates
          its existing card instead of orphaning it — and the display name is never
          projected at all. That closes the mechanism by which stale agent names survive
          on a board.
        </p>

        <h2 style={{ marginTop: 20 }}>Payload preview (first 6 cards)</h2>
        <pre className="cc-payload">{payloadPreview}</pre>
      </div>
    </div>
  );
}
