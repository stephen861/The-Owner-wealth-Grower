import { prisma } from "@/lib/prisma";
import { filterByDivision, jobCostRollup, sumCents } from "@/lib/command-center/domain";
import { formatCents, readDivision } from "@/lib/command-center/view";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ division?: string }>;
}) {
  const division = readDivision((await searchParams).division);

  const [allJobs, allEntries, vendors, advances] = await Promise.all([
    prisma.demoJob.findMany({
      orderBy: [{ division: "asc" }, { sourceId: "asc" }],
      include: { property: true, vendor: true, moneyEntries: true },
    }),
    prisma.demoMoneyEntry.findMany({ select: { jobId: true, amountCents: true, division: true } }),
    prisma.demoVendor.findMany({ include: { jobs: true, moneyEntries: true } }),
    prisma.demoAdvance.findMany(),
  ]);

  const jobs = filterByDivision(allJobs, division);
  const entries = filterByDivision(allEntries, division);
  const vendorRows = filterByDivision(vendors, division);
  const advanceRows = filterByDivision(advances, division);

  const totalApproved = sumCents(jobs, (j) => j.approvedCents);
  const totalSpent = sumCents(
    entries.filter((e) => e.jobId !== null),
    (e) => e.amountCents,
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Jobs, vendors & cost</h1>
          <p>Cost attributed through one canonical relationship.</p>
        </div>
      </div>

      <div className="cc-notice info">
        <strong>One link, not two.</strong> A money-log row attaches to a job through a
        single foreign key. There is no second parallel link column, so spend is counted
        exactly once and the two paths cannot disagree.
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Jobs</div>
          <div className="value">{jobs.length}</div>
          <div className="sub">{jobs.filter((j) => j.blocked).length} blocked</div>
        </div>
        <div className="card">
          <div className="label">Approved</div>
          <div className="value">{formatCents(totalApproved)}</div>
        </div>
        <div className="card">
          <div className="label">Spend attributed to jobs</div>
          <div className="value">{formatCents(totalSpent)}</div>
        </div>
        <div className="card">
          <div className="label">Advances outstanding</div>
          <div className="value">
            {formatCents(
              sumCents(advanceRows, (a) => Math.max(0, a.amountCents - a.repaidCents)),
            )}
          </div>
          <div className="sub">{advanceRows.length} on file</div>
        </div>
      </div>

      <div className="panel">
        <h2>Jobs ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <div className="empty">No jobs in this filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Property</th>
                <th>Vendor</th>
                <th className="right">Quoted</th>
                <th className="right">Approved</th>
                <th className="right">Spent</th>
                <th className="right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const rollup = jobCostRollup(job, allEntries);
                return (
                  <tr key={job.id}>
                    <td>
                      <strong>{job.title}</strong>
                      <div className="subnote cc-mono">{job.sourceId}</div>
                      <div className="subnote">
                        <span className={`badge ${job.blocked ? "red" : ""}`}>
                          {job.blocked ? "BLOCKED" : job.status}
                        </span>
                      </div>
                      {job.blocked ? (
                        <div className="subnote">{job.blockedReason}</div>
                      ) : null}
                      {rollup.warnings.length > 0 ? (
                        <ul className="cc-warnings">
                          {rollup.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                    <td className="cc-mono">{job.property?.sourceId ?? "—"}</td>
                    <td>{job.vendor?.name ?? <span className="muted">—</span>}</td>
                    <td className="right">{formatCents(rollup.quotedCents)}</td>
                    <td className="right">{formatCents(rollup.approvedCents)}</td>
                    <td className="right">
                      {formatCents(rollup.spentCents)}
                      <div className="subnote">{rollup.entryCount} entries</div>
                    </td>
                    <td className="right">
                      <span
                        className={`badge ${rollup.overApproved ? "red" : "green"}`}
                      >
                        {rollup.varianceCents >= 0 ? "+" : "−"}
                        {formatCents(Math.abs(rollup.varianceCents))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel">
        <h2>Vendors ({vendorRows.length})</h2>
        {vendorRows.length === 0 ? (
          <div className="empty">No vendors in this filter.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Trade</th>
                <th className="right">Jobs</th>
                <th className="right">Paid</th>
              </tr>
            </thead>
            <tbody>
              {vendorRows.map((vendor) => (
                <tr key={vendor.id}>
                  <td>
                    <strong>{vendor.name}</strong>
                    <div className="subnote cc-mono">{vendor.sourceId}</div>
                  </td>
                  <td>{vendor.trade}</td>
                  <td className="right">{vendor.jobs.length}</td>
                  <td className="right">
                    {formatCents(sumCents(vendor.moneyEntries, (m) => m.amountCents))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
