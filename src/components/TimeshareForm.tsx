import { OWNERSHIP_TYPES } from "@/lib/format";
import { toDateInput } from "@/lib/format";

type TimeshareLike = {
  id?: string;
  name?: string | null;
  brand?: string | null;
  resort?: string | null;
  location?: string | null;
  ownershipType?: string | null;
  contractNumber?: string | null;
  memberNumber?: string | null;
  deededWeek?: string | null;
  unitType?: string | null;
  ownershipShare?: number | null;
  annualPoints?: number | null;
  useYear?: string | null;
  purchaseDate?: Date | string | null;
  purchasePrice?: number | null;
  active?: boolean;
  notes?: string | null;
};

export default function TimeshareForm({
  action,
  initial,
  submitLabel = "Save timeshare",
}: {
  action: (formData: FormData) => void;
  initial?: TimeshareLike;
  submitLabel?: string;
}) {
  const v = initial ?? {};
  return (
    <form action={action} className="grid">
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}

      <div className="field">
        <label htmlFor="name">Name *</label>
        <input id="name" name="name" required defaultValue={v.name ?? ""} placeholder="Bonnet Creek 2BR" />
      </div>
      <div className="field">
        <label htmlFor="brand">Brand / Club</label>
        <input id="brand" name="brand" defaultValue={v.brand ?? ""} placeholder="Wyndham" />
      </div>
      <div className="field">
        <label htmlFor="ownershipType">Ownership type</label>
        <select id="ownershipType" name="ownershipType" defaultValue={v.ownershipType ?? "POINTS"}>
          {OWNERSHIP_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="resort">Resort / Property</label>
        <input id="resort" name="resort" defaultValue={v.resort ?? ""} placeholder="Club Wyndham Bonnet Creek" />
      </div>
      <div className="field">
        <label htmlFor="location">Location</label>
        <input id="location" name="location" defaultValue={v.location ?? ""} placeholder="Orlando, FL" />
      </div>
      <div className="field">
        <label htmlFor="unitType">Unit type</label>
        <input id="unitType" name="unitType" defaultValue={v.unitType ?? ""} placeholder="2BR Deluxe" />
      </div>

      <div className="field">
        <label htmlFor="annualPoints">Annual points</label>
        <input id="annualPoints" name="annualPoints" type="number" defaultValue={v.annualPoints ?? ""} placeholder="154000" />
      </div>
      <div className="field">
        <label htmlFor="useYear">Use year</label>
        <input id="useYear" name="useYear" defaultValue={v.useYear ?? ""} placeholder="ANNUAL / EVEN / ODD or January" />
      </div>
      <div className="field">
        <label htmlFor="deededWeek">Deeded week</label>
        <input id="deededWeek" name="deededWeek" defaultValue={v.deededWeek ?? ""} placeholder="Week 26" />
      </div>

      <div className="field">
        <label htmlFor="ownershipShare">Ownership share (%)</label>
        <input id="ownershipShare" name="ownershipShare" type="number" step="0.01" defaultValue={v.ownershipShare ?? ""} placeholder="100" />
      </div>
      <div className="field">
        <label htmlFor="contractNumber">Contract #</label>
        <input id="contractNumber" name="contractNumber" defaultValue={v.contractNumber ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="memberNumber">Member #</label>
        <input id="memberNumber" name="memberNumber" defaultValue={v.memberNumber ?? ""} />
      </div>

      <div className="field">
        <label htmlFor="purchaseDate">Purchase date</label>
        <input id="purchaseDate" name="purchaseDate" type="date" defaultValue={toDateInput(v.purchaseDate)} />
      </div>
      <div className="field">
        <label htmlFor="purchasePrice">Purchase price</label>
        <input id="purchasePrice" name="purchasePrice" type="number" step="0.01" defaultValue={v.purchasePrice ?? ""} placeholder="20000" />
      </div>
      {v.id ? (
        <div className="field">
          <label htmlFor="active">Status</label>
          <select id="active" name="active" defaultValue={v.active === false ? "false" : "true"}>
            <option value="true">Active</option>
            <option value="false">Inactive / sold</option>
          </select>
        </div>
      ) : null}

      <div className="field full">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" defaultValue={v.notes ?? ""} />
      </div>

      <div className="form-actions">
        <button className="btn" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
