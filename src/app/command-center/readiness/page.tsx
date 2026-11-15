import { prisma } from "@/lib/prisma";
import { formatDate, labelFor } from "@/lib/format";
import {
  assessRevenueEligibility,
  feePosition,
  filterByDivision,
  licenseStatusLabel,
  readinessSummary,
  sumCents,
  CHECKLIST_STATUSES,
} from "@/lib/command-center/domain";
import { formatCents, readDivision } from "@/lib/command-center/view";
import {
  setChecklistStatusAction,
  setExpectedFeesAction,
} from "@/lib/command-center/actions";

export const dynamic = "force-dynamic";

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);

  const all = await prisma.demoProperty.findMany({
    orderBy: [{ division: "asc" }, { sourceId: "asc" }],
    include: {
      checklistItems: { orderBy: { sourceId: "asc" } },
      moneyEntries: { where: { kind: "FEE_PAYMENT" } },
      placements: true,
    },
  });
  const properties = filterByDivision(all, division).filter(
    (p) => p.checklistItems.length > 0,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Facility readiness</h1>
          <p>Checklist state, license status and fee position per facility.</p>
        </div>
      </div>

      <div className="cc-notice info">
        Readiness is scored against <strong>required</strong> items, and a facility is never
        &ldquo;ready&rdquo; while any item is blocked — even at 100% of required items
        complete.
      </div>

      {properties.length === 0 ? (
        <div className="panel">
          <div className="empty">No facilities with checklists in this filter.</div>
        </div>
      ) : null}

      {properties.map((property) => {
        const summary = readinessSummary(property.checklistItems);
        const paid = sumCents(property.moneyEntries, (m) => m.amountCents);
        const fees = feePosition(property.expectedFeesCents, paid);
        const revenue = assessRevenueEligibility(property);

        return (
          <div className="panel" key={property.id}>
            <div className="section-title">
              <h2>
                <span className="cc-mono">{property.sourceId}</span> · {property.name}
              </h2>
              <span
                className={`badge ${
                  summary.ready ? "green" : summary.blocked > 0 ? "red" : "amber"
                }`}
              >
                {summary.ready
                  ? "READY"
                  : summary.blocked > 0
                    ? "BLOCKED"
                    : `${summary.percent}% of required`}
              </span>
            </div>

            <div className="cards">
              <div className="card">
                <div className="label">Required items</div>
                <div className="value">
                  {summary.requiredComplete}/{summary.requiredTotal}
                </div>
                <div className="sub">{summary.requiredOutstanding} outstanding</div>
              </div>
              <div className="card">
                <div className="label">Blocked items</div>
                <div className="value">{summary.blocked}</div>
              </div>
              <div className="card">
                <div className="label">License status</div>
                <div className="value" style={{ fontSize: 18 }}>
                  {licenseStatusLabel(property.licenseStatus)}
                </div>
                <div className="sub">
                  source string: <span className="cc-mono">
                    {property.licenseStatusRaw ?? "—"}
                  </span>
                </div>
              </div>
              <div className="card">
                <div className="label">Revenue eligible</div>
                <div className="value" style={{ fontSize: 18 }}>
                  {revenue.eligible ? "Yes" : "No"}
                </div>
                <div className="sub">Stored flag, not a string match</div>
              </div>
              <div className="card">
                <div className="label">Fees</div>
                <div className="value" style={{ fontSize: 18 }}>
                  {fees.state === "CREDIT"
                    ? `${formatCents(fees.creditCents)} credit`
                    : formatCents(fees.owedCents)}
                </div>
                <div className="sub">
                  {formatCents(fees.paidCents)} paid of {formatCents(fees.expectedCents)}
                </div>
              </div>
              <div className="card">
                <div className="label">Occupancy</div>
                <div className="value">
                  {property.placements.filter((p) => p.status === "MOVED_IN").length}
                  {property.bedCapacity ? `/${property.bedCapacity}` : ""}
                </div>
                <div className="sub">Counts only — no occupant detail stored</div>
              </div>
            </div>

            {revenue.warnings.length > 0 || fees.warnings.length > 0 ? (
              <div className="cc-notice warn">
                <strong>Needs review</strong>
                <ul className="cc-warnings">
                  {[...revenue.warnings, ...fees.warnings].map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form action={setExpectedFeesAction} className="grid" style={{ marginBottom: 18 }}>
              <input type="hidden" name="id" value={property.id} />
              <div className="field">
                <label>Expected fees for this facility ($)</label>
                <input
                  name="expectedFeesDollars"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={(property.expectedFeesCents / 100).toFixed(2)}
                />
              </div>
              <div className="form-actions">
                <button className="btn ghost small" type="submit">
                  Save expected fees
                </button>
              </div>
            </form>

            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Required</th>
                  <th>Last evidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {property.checklistItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.label}</strong>
                      <div className="subnote cc-mono">{item.sourceId}</div>
                    </td>
                    <td>{item.category}</td>
                    <td>{item.required ? "Yes" : "No"}</td>
                    <td>
                      {item.status === "BLOCKED" ? (
                        <span className="badge red">{item.blockedReason}</span>
                      ) : (
                        <>
                          {item.evidenceNote ?? <span className="muted">none</span>}
                          {item.completedAt ? (
                            <div className="subnote">{formatDate(item.completedAt)}</div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td>
                      <form action={setChecklistStatusAction} className="stage-form">
                        <input type="hidden" name="id" value={item.id} />
                        <select name="status" defaultValue={item.status}>
                          {CHECKLIST_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <button className="btn small ghost" type="submit">
                          ✓
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
