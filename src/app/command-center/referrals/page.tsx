import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  evaluateReferralTransition,
  filterByDivision,
  referralStageLabel,
  referralStageOrder,
  REFERRAL_STAGES,
} from "@/lib/command-center/domain";
import { readDivision } from "@/lib/command-center/view";
import { advanceReferralAction } from "@/lib/command-center/actions";

export const dynamic = "force-dynamic";

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);

  const all = await prisma.demoReferral.findMany({
    orderBy: [{ stage: "asc" }, { receivedAt: "asc" }],
    include: { property: true },
  });
  const referrals = filterByDivision(all, division);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Administrative referral pipeline</h1>
          <p>Six administrative stages. Paperwork tracking only.</p>
        </div>
      </div>

      <div className="cc-notice danger">
        <strong>No clinical or eligibility decisions are made here.</strong> This pipeline
        records that a <em>person</em> reached a decision and who they were. It does not
        assess admission, suitability or programme eligibility, and no automated step can
        advance a referral into or past a decision stage.
      </div>

      <div className="panel">
        <h2>Stage counts</h2>
        <div className="cards">
          {REFERRAL_STAGES.map((stage) => (
            <div className="card" key={stage.value}>
              <div className="label">{stage.label}</div>
              <div className="value">
                {referrals.filter((r) => r.stage === stage.value).length}
              </div>
              <div className="sub">step {stage.order + 1} of 6</div>
            </div>
          ))}
        </div>
      </div>

      {referrals.length === 0 ? (
        <div className="panel">
          <div className="empty">No referrals in this filter.</div>
        </div>
      ) : (
        <div className="panel">
          <h2>Referrals ({referrals.length})</h2>
          <table>
            <thead>
              <tr>
                <th>Referral</th>
                <th>Stage</th>
                <th>Facility</th>
                <th>Decision on record</th>
                <th>Advance</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((referral) => {
                const order = referralStageOrder(referral.stage);
                const next = REFERRAL_STAGES[order + 1];
                const gate = next
                  ? evaluateReferralTransition(referral, next.value)
                  : null;
                const needsName =
                  next != null &&
                  (next.value === "HUMAN_DECISION_RECORDED" ||
                    next.value === "MOVE_IN_CHECKLIST");

                return (
                  <tr key={referral.id}>
                    <td>
                      <strong className="cc-mono">{referral.referralCode}</strong>
                      <div className="subnote">{referral.referrerLabel}</div>
                      <div className="subnote">
                        received {formatDate(referral.receivedAt)}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          referral.blocked
                            ? "red"
                            : referral.stage === "MOVE_IN_CHECKLIST"
                              ? "green"
                              : "blue"
                        }`}
                      >
                        {referralStageLabel(referral.stage)}
                      </span>
                      {referral.blocked ? (
                        <div className="subnote">Blocked: {referral.blockedReason}</div>
                      ) : null}
                    </td>
                    <td>
                      {referral.property ? (
                        <span className="cc-mono">{referral.property.sourceId}</span>
                      ) : (
                        <span className="muted">not assigned</span>
                      )}
                    </td>
                    <td>
                      {referral.decisionRecordedBy ? (
                        <>
                          <strong>{referral.decisionRecordedBy}</strong>
                          <div className="subnote">
                            {formatDate(referral.decisionAt)}
                          </div>
                        </>
                      ) : (
                        <span className="muted">none recorded</span>
                      )}
                    </td>
                    <td>
                      {next == null ? (
                        <span className="muted">final stage</span>
                      ) : gate && !gate.allowed ? (
                        <>
                          <span className="badge red">cannot advance</span>
                          <ul className="cc-warnings">
                            {gate.blockers.map((b) => (
                              <li key={b}>{b}</li>
                            ))}
                          </ul>
                          {needsName && !referral.blocked ? (
                            <form action={advanceReferralAction} className="grid">
                              <input type="hidden" name="id" value={referral.id} />
                              <input type="hidden" name="nextStage" value={next.value} />
                              <div className="field">
                                <label>Person recording the decision *</label>
                                <input name="decisionRecordedBy" required />
                              </div>
                              <div className="field">
                                <label>Decision note</label>
                                <input name="decisionNote" />
                              </div>
                              <div className="form-actions">
                                <button className="btn small" type="submit">
                                  Record decision → {next.label}
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </>
                      ) : (
                        <form action={advanceReferralAction} className="inline-form">
                          <input type="hidden" name="id" value={referral.id} />
                          <input type="hidden" name="nextStage" value={next.value} />
                          <button className="btn small ghost" type="submit">
                            → {next.label}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
