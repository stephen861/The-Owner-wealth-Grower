import { reconcileBySourceId } from "@/lib/command-center/domain";
import {
  AUDITED_SOURCE_COUNTS,
  DEMO_IMPORT_PREVIEW,
} from "@/lib/command-center/demo-data";
import { demoDataCounts } from "@/lib/command-center/seed";

export const dynamic = "force-dynamic";

// The audited source tables and where each one lands in the prototype.
const TABLE_MAP: { source: string; module: string; status: string }[] = [
  { source: "RCF Properties", module: "Readiness (facilities)", status: "MODELLED" },
  { source: "FGW Properties", module: "Readiness / Overview", status: "MODELLED" },
  { source: "RCF Checklist Items", module: "Readiness", status: "MODELLED" },
  { source: "Residents", module: "Readiness — occupancy counts only", status: "REDUCED" },
  { source: "FGW Tasks", module: "Tasks", status: "MODELLED" },
  { source: "Work Orders", module: "Work orders", status: "MODELLED" },
  { source: "Jobs", module: "Jobs & cost", status: "MODELLED" },
  { source: "Money Log", module: "Jobs & cost / Overview", status: "MODELLED" },
  { source: "Advances", module: "Jobs & cost", status: "MODELLED" },
  { source: "Furnishing & Supplies", module: "Stored, no dedicated screen", status: "STORED" },
  { source: "Contacts", module: "Stored, no dedicated screen", status: "STORED" },
  { source: "SOP Reference", module: "Stored, no dedicated screen", status: "STORED" },
];

// The separate operations hub. All ten tables are now confirmed by audit, by
// their exact names. Every one was empty, and none is modelled here.
//
// An earlier revision of this screen listed nine approximated names plus an
// UNKNOWN placeholder. The approximation "Hiring" stood in for what the audit
// resolves into two distinct tables — Applicants and Open Positions — so the
// placeholder row is now filled rather than a duplicate module being added.
const OPS_HUB_TABLES = [
  "Applicants",
  "Open Positions",
  "Employee Roster",
  "Compliance",
  "Shift Coverage",
  "Onboarding",
  "Training",
  "Performance",
  "Incidents",
  "Referral Pipeline",
];

const INTEGRATIONS: {
  name: string;
  state: string;
  badge: string;
  detail: string;
}[] = [
  {
    name: "Airtable base (AFLH + FGW Command Center)",
    state: "NOT CONNECTED",
    badge: "red",
    detail:
      "No credential, no client, no request. The prototype never fetched or migrated a row. Row counts were mirrored from the audit; the data is invented.",
  },
  {
    name: "Airtable native automations",
    state: "UNDEPLOYED — NO PROOF OF LIVE SYNC",
    badge: "red",
    detail:
      "Reported as undeployed in the audit, with no evidence of a live sync. A schedule existing is not evidence that anything ran.",
  },
  {
    name: "AFLH New Referral Alert (Make 5266184)",
    state: "OFF — NEVER RUN",
    badge: "red",
    detail:
      "Left off deliberately: it resets referral status to Pending and has never run. Nothing in this prototype turns it on or depends on it.",
  },
  {
    name: "Mina call/email digest",
    state: "SEPARATE — FORWARDING UNVERIFIED",
    badge: "amber",
    detail:
      "Operates separately from this prototype. Forwarding remains unverified despite later evidence, so no claim of delivery is made here.",
  },
  {
    name: "Claude boards (AI team / roadmap)",
    state: "DOCUMENTED TARGET ONLY",
    badge: "amber",
    detail:
      "Recorded as projection targets and disabled. The prototype generates a sanitized payload locally; a person applies it. No board was read or edited, and no board write API was verified in this session — which is a statement about this build, not a claim that none exists.",
  },
  {
    name: "Rent Manager / InSync",
    state: "UNTOUCHED",
    badge: "",
    detail:
      "Out of scope by instruction. This prototype does not replace, mirror or write to either, and no existing workflow was changed.",
  },
];

export default async function ModulesPage() {
  const counts = await demoDataCounts();
  const reconciliation = reconcileBySourceId(DEMO_IMPORT_PREVIEW);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Modules & import mapping</h1>
          <p>What is modelled, what is only stored, and what is not connected.</p>
        </div>
      </div>

      <div className="cc-notice danger">
        <strong>Integration status is stated, never inferred.</strong> A schedule, a
        &ldquo;last synced&rdquo; label or a timestamp is not evidence that anything ran or
        ran correctly. Everything below is reported as disconnected or unverified because
        that is what the audit established.
      </div>

      <div className="panel">
        <h2>Integrations</h2>
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>State</th>
              <th>What that means</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATIONS.map((integration) => (
              <tr key={integration.name}>
                <td>
                  <strong>{integration.name}</strong>
                </td>
                <td>
                  <span className={`badge ${integration.badge}`}>{integration.state}</span>
                </td>
                <td>{integration.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Audited source tables → prototype modules</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          Row counts mirror the audit so the prototype behaves at realistic scale.
          Mirroring a count is not a claim that any row matches a real one.
        </p>
        <table>
          <thead>
            <tr>
              <th>Source table</th>
              <th className="right">Audited rows</th>
              <th className="right">Synthetic rows</th>
              <th>Prototype module</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TABLE_MAP.map((row) => {
              const audited =
                AUDITED_SOURCE_COUNTS[row.source as keyof typeof AUDITED_SOURCE_COUNTS];
              const synthetic: Record<string, number> = {
                "RCF Properties": 7,
                "FGW Properties": 29,
                "RCF Checklist Items": counts.checklistItems,
                Residents: counts.placements,
                "FGW Tasks": counts.tasks,
                "Work Orders": counts.workOrders,
                Jobs: counts.jobs,
                "Money Log": counts.moneyEntries,
                Advances: counts.advances,
                "Furnishing & Supplies": counts.supplyItems,
                Contacts: counts.contacts,
                "SOP Reference": counts.sopReferences,
              };
              return (
                <tr key={row.source}>
                  <td>
                    <strong>{row.source}</strong>
                  </td>
                  <td className="right">{audited}</td>
                  <td className="right">{synthetic[row.source]}</td>
                  <td>{row.module}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.status === "MODELLED"
                          ? "green"
                          : row.status === "REDUCED"
                            ? "amber"
                            : ""
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="cc-notice warn">
          <strong>Residents is deliberately REDUCED.</strong> The prototype stores an
          occupancy status and a fictional label only. There is no date of birth, no
          government identifier, no diagnosis, no medication and no eligibility field
          anywhere in the schema, and occupancy never reaches the whiteboard projection.
        </div>
      </div>

      <div className="panel">
        <h2>AFLH Operations Hub (separate base)</h2>
        <p className="subnote" style={{ marginTop: -8, marginBottom: 12 }}>
          All ten tables are confirmed by audit and were empty. None is modelled here, and
          no screen pretends otherwise. The hub&rsquo;s Referral Pipeline is a separate,
          empty table — it is <strong>not</strong> the administrative referral pipeline
          this prototype models, and the two are not synced.
        </p>
        <table>
          <thead>
            <tr>
              <th>Table</th>
              <th>Audited state</th>
              <th>Prototype</th>
            </tr>
          </thead>
          <tbody>
            {OPS_HUB_TABLES.map((table) => (
              <tr key={table}>
                <td>{table}</td>
                <td>
                  <span className="badge">EMPTY</span>
                </td>
                <td>
                  <span className="badge">NOT MODELLED</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Import mapping & reconciliation — documentation only</h2>
        <div className="cc-notice info">
          There is no importer in this prototype. The reconciliation below runs against a{" "}
          <strong>fixture</strong> to demonstrate the contract a future importer would have
          to satisfy. No row from it is written, and no live base is contacted.
        </div>

        <h2 style={{ marginTop: 18, fontSize: 16 }}>
          Staged batch ({DEMO_IMPORT_PREVIEW.length} rows)
        </h2>
        <table>
          <thead>
            <tr>
              <th>Division</th>
              <th>Source ID</th>
              <th>Row</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_IMPORT_PREVIEW.map((row, i) => (
              <tr key={i}>
                <td>{row.division}</td>
                <td className="cc-mono">
                  {row.sourceId === null
                    ? "null"
                    : row.sourceId === ""
                      ? "(empty)"
                      : `"${row.sourceId}"`}
                </td>
                <td>{row.title}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="cards" style={{ marginTop: 18 }}>
          <div className="card">
            <div className="label">Would insert</div>
            <div className="value">{reconciliation.unique.length}</div>
            <div className="sub">distinct (division, sourceId)</div>
          </div>
          <div className="card">
            <div className="label">Duplicates rejected</div>
            <div className="value">{reconciliation.duplicateCount}</div>
            <div className="sub">first occurrence wins, rest reported</div>
          </div>
          <div className="card">
            <div className="label">Unidentified</div>
            <div className="value">{reconciliation.unidentified.length}</div>
            <div className="sub">blank or missing source ID</div>
          </div>
          <div className="card">
            <div className="label">Conflicting keys</div>
            <div className="value">{reconciliation.conflicts.length}</div>
          </div>
        </div>

        {reconciliation.conflicts.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Kept</th>
                <th>Rejected as duplicate</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.conflicts.map((conflict) => (
                <tr key={conflict.key}>
                  <td className="cc-mono">{conflict.key}</td>
                  <td>{(conflict.kept as { title: string }).title}</td>
                  <td>
                    <ul className="cc-warnings">
                      {conflict.duplicates.map((d, i) => (
                        <li key={i}>{(d as { title: string }).title}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        <h2 style={{ marginTop: 20, fontSize: 16 }}>Reconciliation rules</h2>
        <ul>
          <li>
            Identity is the pair <span className="cc-mono">(division, sourceId)</span>, so
            the same ID in FGW and AFLH is two records, not a collision.
          </li>
          <li>Surrounding whitespace is ignored, so &ldquo; WO-1 &rdquo; is not a second identity.</li>
          <li>
            A repeat of an existing key is <strong>rejected and reported</strong>, never
            merged silently and never inserted twice — the database enforces this with a
            unique index as well.
          </li>
          <li>
            A row with no source ID cannot be reconciled and is quarantined rather than
            guessed at.
          </li>
          <li>
            Money attaches through one canonical foreign key per dimension, so no second
            link column can disagree with the first.
          </li>
        </ul>
      </div>

      <div className="panel">
        <h2>Demo table row counts</h2>
        <table>
          <thead>
            <tr>
              <th>Demo table</th>
              <th className="right">Rows</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(counts).map(([table, count]) => (
              <tr key={table}>
                <td className="cc-mono">{table}</td>
                <td className="right">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
