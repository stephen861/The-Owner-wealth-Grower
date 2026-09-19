import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  contactName,
  formatCurrency,
  formatNumber,
  labelFor,
  propertyAddress,
  PROPERTY_TYPES,
} from "@/lib/format";
import { createProperty } from "@/lib/pm-actions";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const [properties, owners] = await Promise.all([
    prisma.property.findMany({
      orderBy: { name: "asc" },
      include: { owner: true, units: true },
    }),
    prisma.contact.findMany({
      where: { type: { in: ["OWNER", "CLIENT", "PARTNER"] } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);

  const units = properties.flatMap((p) => p.units);
  const occupied = units.filter((u) => u.status === "OCCUPIED").length;
  const vacant = units.filter((u) => u.status === "VACANT").length;
  const occupancy = units.length === 0 ? 0 : Math.round((occupied / units.length) * 100);
  const potentialRent = units.reduce((s, u) => s + u.marketRent, 0);
  const portfolioValue = properties.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const debt = properties.reduce((s, p) => s + (p.mortgageBalance ?? 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Properties</h1>
          <p>Every building you own or manage, and the units inside them.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Properties</div>
          <div className="value">{properties.length}</div>
          <div className="sub">{units.length} units</div>
        </div>
        <div className="card">
          <div className="label">Occupancy</div>
          <div className="value">{occupancy}%</div>
          <div className="sub">
            {occupied} occupied · {vacant} vacant
          </div>
        </div>
        <div className="card">
          <div className="label">Gross potential rent</div>
          <div className="value">{formatCurrency(potentialRent)}</div>
          <div className="sub">Per month at market</div>
        </div>
        <div className="card">
          <div className="label">Portfolio equity</div>
          <div className="value">{formatCurrency(portfolioValue - debt)}</div>
          <div className="sub">
            {formatCurrency(portfolioValue)} value − {formatCurrency(debt)} debt
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Add a property</h2>
        <form action={createProperty} className="grid">
          <div className="field">
            <label>Name *</label>
            <input name="name" required placeholder="Maple Street Duplex" />
          </div>
          <div className="field">
            <label>Type</label>
            <select name="type" defaultValue="SINGLE_FAMILY">
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Owner</label>
            <select name="ownerId" defaultValue="">
              <option value="">— I own it —</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {contactName(o)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Street address</label>
            <input name="addressLine1" placeholder="1420 Maple St" />
          </div>
          <div className="field">
            <label>City</label>
            <input name="city" placeholder="Tampa" />
          </div>
          <div className="field">
            <label>State</label>
            <input name="state" placeholder="FL" />
          </div>
          <div className="field">
            <label>ZIP</label>
            <input name="zip" placeholder="33604" />
          </div>
          <div className="field">
            <label>Management fee (%)</label>
            <input name="managementFeeRate" type="number" step="0.1" defaultValue={0} />
          </div>
          <div className="field">
            <label>Market rent (single-unit)</label>
            <input name="marketRent" type="number" step="0.01" defaultValue={0} />
          </div>
          <div className="field">
            <label>Purchase date</label>
            <input name="purchaseDate" type="date" />
          </div>
          <div className="field">
            <label>Purchase price</label>
            <input name="purchasePrice" type="number" step="0.01" />
          </div>
          <div className="field">
            <label>Market value</label>
            <input name="marketValue" type="number" step="0.01" />
          </div>
          <div className="field">
            <label>Mortgage balance</label>
            <input name="mortgageBalance" type="number" step="0.01" />
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea name="notes" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add property
            </button>
          </div>
        </form>
        <p className="subnote" style={{ marginTop: 12 }}>
          Single-family and short-term properties get a &ldquo;Main&rdquo; unit created
          automatically. For multi-unit buildings, add units on the property page.
        </p>
      </div>

      <div className="panel">
        <h2>Portfolio ({properties.length})</h2>
        {properties.length === 0 ? (
          <div className="empty">No properties yet. Add your first one above.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Property</th>
                <th>Type</th>
                <th>Owner</th>
                <th className="right">Units</th>
                <th className="right">Occupancy</th>
                <th className="right">Market rent</th>
                <th className="right">Equity</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => {
                const occ = p.units.filter((u) => u.status === "OCCUPIED").length;
                const rate =
                  p.units.length === 0 ? 0 : Math.round((occ / p.units.length) * 100);
                const rent = p.units.reduce((s, u) => s + u.marketRent, 0);
                const equity = (p.marketValue ?? 0) - (p.mortgageBalance ?? 0);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/properties/${p.id}`}>
                        <strong>{p.name}</strong>
                      </Link>
                      <div className="subnote">{propertyAddress(p) || "No address"}</div>
                    </td>
                    <td>{labelFor(PROPERTY_TYPES, p.type)}</td>
                    <td>
                      {p.owner ? (
                        <Link href={`/contacts/${p.owner.id}`} className="link">
                          {contactName(p.owner)}
                        </Link>
                      ) : (
                        <span className="muted">Self</span>
                      )}
                      {p.managementFeeRate > 0 ? (
                        <div className="subnote">{p.managementFeeRate}% mgmt fee</div>
                      ) : null}
                    </td>
                    <td className="right">{formatNumber(p.units.length)}</td>
                    <td className="right">
                      <span
                        className={`badge ${rate === 100 ? "green" : rate === 0 ? "red" : "amber"}`}
                      >
                        {rate}%
                      </span>
                    </td>
                    <td className="right">{formatCurrency(rent)}</td>
                    <td className="right">{formatCurrency(equity)}</td>
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
