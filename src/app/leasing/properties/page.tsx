import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, HOUSING_PROGRAMS, labelFor, UNIT_STATUS } from "@/lib/format";
import { createProperty, createUnit, deleteProperty, deleteUnit, setUnitStatus, upsertIncomeLimits } from "../actions";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const properties = await prisma.property.findMany({
    orderBy: { name: "asc" },
    include: {
      units: { orderBy: [{ bedrooms: "asc" }, { unitNumber: "asc" }] },
      incomeLimits: { orderBy: [{ amiPercent: "asc" }, { householdSize: "asc" }] },
    },
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Properties & Units</h1>
          <p>Everything the leasing agent knows comes from here. Keep rents, availability and AMI limits current.</p>
        </div>
        <Link className="btn ghost" href="/leasing">← Inbox</Link>
      </div>

      {properties.map((p) => {
        const amiLevels = [...new Set(p.incomeLimits.map((l) => l.amiPercent))];
        return (
          <div className="panel" key={p.id}>
            <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2>
                {p.name} <span className="badge blue">{labelFor(HOUSING_PROGRAMS, p.program)}</span>{" "}
                {p.acceptsVouchers ? <span className="badge green">Vouchers accepted</span> : null}
              </h2>
              <form action={deleteProperty} className="inline-form">
                <input type="hidden" name="id" value={p.id} />
                <button className="btn danger small" type="submit">Delete</button>
              </form>
            </div>
            <div className="subnote">
              {[p.address, p.city, p.state].filter(Boolean).join(", ")} · {p.officePhone ?? "no phone"} · {p.officeHours ?? "no hours"} · App fee{" "}
              {formatCurrency(p.applicationFee)} · Min income {p.minIncomeMultiple}× rent (waived w/ voucher)
            </div>

            <h3 style={{ marginTop: 16 }}>Units</h3>
            {p.units.length === 0 ? <div className="empty">No units.</div> : (
              <table>
                <thead>
                  <tr><th>Unit</th><th>Beds/Baths</th><th className="right">Rent</th><th>AMI</th><th>Available</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {p.units.map((u) => (
                    <tr key={u.id}>
                      <td>{u.unitNumber}{u.accessible ? " ♿" : ""}</td>
                      <td>{u.bedrooms}BR / {u.bathrooms}BA{u.sqft ? ` · ${u.sqft} sf` : ""}</td>
                      <td className="right">{formatCurrency(u.rent)}</td>
                      <td>{u.amiPercent ? `${u.amiPercent}%` : "Market"}</td>
                      <td>{u.availableDate ? formatDate(u.availableDate) : "Now"}</td>
                      <td>
                        <form action={setUnitStatus} className="inline-form">
                          <input type="hidden" name="id" value={u.id} />
                          <select name="status" defaultValue={u.status}>
                            {UNIT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <button className="btn ghost small" type="submit">Set</button>
                        </form>
                      </td>
                      <td className="right">
                        <form action={deleteUnit} className="inline-form">
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn danger small" type="submit">✕</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form action={createUnit} className="grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="propertyId" value={p.id} />
              <div className="field"><label>Unit #</label><input name="unitNumber" required /></div>
              <div className="field"><label>Bedrooms</label><input name="bedrooms" type="number" required min={0} /></div>
              <div className="field"><label>Baths</label><input name="bathrooms" type="number" step="0.5" defaultValue={1} /></div>
              <div className="field"><label>Rent</label><input name="rent" type="number" step="1" required /></div>
              <div className="field"><label>AMI %</label>
                <select name="amiPercent" defaultValue="60">
                  {[30, 40, 50, 60, 70, 80, 0].map((a) => <option key={a} value={a}>{a ? `${a}%` : "Market"}</option>)}
                </select>
              </div>
              <div className="field"><label>Accessible</label>
                <select name="accessible" defaultValue="false"><option value="false">No</option><option value="true">Yes (ADA)</option></select>
              </div>
              <div className="field"><label>Available date</label><input name="availableDate" type="date" /></div>
              <div className="form-actions"><button className="btn small" type="submit">Add unit</button></div>
            </form>

            <h3 style={{ marginTop: 16 }}>Income limits (max gross annual income)</h3>
            {amiLevels.length === 0 ? <div className="empty">No limits — the agent will route eligibility to staff.</div> : (
              <table>
                <thead>
                  <tr><th>AMI</th>{[1, 2, 3, 4, 5, 6, 7, 8].map((h) => <th key={h} className="right">{h}p</th>)}</tr>
                </thead>
                <tbody>
                  {amiLevels.map((a) => (
                    <tr key={a}>
                      <td>{a}%</td>
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => {
                        const l = p.incomeLimits.find((x) => x.amiPercent === a && x.householdSize === h);
                        return <td key={h} className="right">{l ? formatCurrency(l.maxIncome).replace(".00", "") : "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={upsertIncomeLimits} className="grid" style={{ marginTop: 12 }}>
              <input type="hidden" name="propertyId" value={p.id} />
              <div className="field"><label>AMI %</label><input name="amiPercent" type="number" required defaultValue={60} /></div>
              <div className="field"><label>Year</label><input name="year" type="number" defaultValue={new Date().getFullYear()} /></div>
              <div className="field full"><label>Limits for 1–8 persons (comma-separated, from HUD/state table)</label>
                <input name="limits" required placeholder="45360, 51840, 58320, 64740, 69960, 75120, 80340, 85500" />
              </div>
              <div className="form-actions"><button className="btn small" type="submit">Save limits</button></div>
            </form>
          </div>
        );
      })}

      <div className="panel">
        <h2>Add a property</h2>
        <form action={createProperty} className="grid">
          <div className="field"><label>Name *</label><input name="name" required /></div>
          <div className="field"><label>Program</label>
            <select name="program" defaultValue="LIHTC">
              {HOUSING_PROGRAMS.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </div>
          <div className="field"><label>Accepts vouchers</label>
            <select name="acceptsVouchers" defaultValue="true"><option value="true">Yes</option><option value="false">No</option></select>
          </div>
          <div className="field"><label>Address</label><input name="address" /></div>
          <div className="field"><label>City</label><input name="city" /></div>
          <div className="field"><label>State</label><input name="state" /></div>
          <div className="field"><label>Office phone</label><input name="officePhone" /></div>
          <div className="field"><label>Office hours</label><input name="officeHours" placeholder="Mon–Fri 9am–5pm" /></div>
          <div className="field"><label>Application URL</label><input name="applicationUrl" /></div>
          <div className="field"><label>Application fee</label><input name="applicationFee" type="number" step="0.01" /></div>
          <div className="field"><label>Min income × rent</label><input name="minIncomeMultiple" type="number" step="0.1" defaultValue={2} /></div>
          <div className="field full"><label>Amenities</label><input name="amenities" /></div>
          <div className="field full"><label>Policies (pets, parking, screening criteria, utilities)</label><textarea name="policies" rows={3} /></div>
          <div className="form-actions"><button className="btn" type="submit">Add property</button></div>
        </form>
      </div>
    </div>
  );
}
