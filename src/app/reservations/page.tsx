import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  labelFor,
  nights,
  RESERVATION_STATUS,
} from "@/lib/format";
import {
  createReservation,
  deleteReservation,
  updateReservationStatus,
} from "./actions";

export const dynamic = "force-dynamic";

function statusBadge(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "green";
    case "PLANNED":
      return "blue";
    case "CANCELLED":
      return "red";
    default:
      return "";
  }
}

export default async function ReservationsPage() {
  const now = new Date();
  const [timeshares, reservations] = await Promise.all([
    prisma.timeshare.findMany({ orderBy: { name: "asc" } }),
    prisma.reservation.findMany({
      orderBy: { checkIn: "asc" },
      include: { timeshare: true },
    }),
  ]);

  const upcoming = reservations.filter(
    (r) => r.checkOut >= now && r.status !== "CANCELLED",
  );
  const past = reservations.filter(
    (r) => r.checkOut < now || r.status === "CANCELLED",
  );

  const renderTable = (rows: typeof reservations) => (
    <table>
      <thead>
        <tr>
          <th>Resort</th>
          <th>Timeshare</th>
          <th>Dates</th>
          <th className="right">Nights</th>
          <th className="right">Points</th>
          <th className="right">Cash</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <strong>{r.resort}</strong>
              {r.location ? <div className="subnote">{r.location}</div> : null}
              {r.guestName ? <div className="subnote">Guest: {r.guestName}</div> : null}
            </td>
            <td>
              {r.timeshare ? (
                <Link href={`/timeshares/${r.timeshare.id}`}>{r.timeshare.name}</Link>
              ) : (
                <span className="muted">—</span>
              )}
            </td>
            <td>
              {formatDate(r.checkIn)}
              <div className="subnote">→ {formatDate(r.checkOut)}</div>
            </td>
            <td className="right">{nights(r.checkIn, r.checkOut)}</td>
            <td className="right">{formatNumber(r.pointsUsed)}</td>
            <td className="right">{formatCurrency(r.cashCost)}</td>
            <td>
              <form
                action={updateReservationStatus}
                className="inline-form"
                style={{ display: "flex", gap: 4 }}
              >
                <input type="hidden" name="id" value={r.id} />
                <select
                  name="status"
                  defaultValue={r.status}
                  style={{ padding: "4px 6px", fontSize: 13 }}
                >
                  {RESERVATION_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button className="btn small ghost" type="submit" title="Update status">
                  ✓
                </button>
              </form>
            </td>
            <td className="right">
              <form action={deleteReservation} className="inline-form">
                <input type="hidden" name="id" value={r.id} />
                <button className="btn danger small" type="submit">
                  ✕
                </button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Reservations</h1>
          <p>Upcoming and past stays across all your ownerships.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Upcoming trips</div>
          <div className="value">{upcoming.length}</div>
        </div>
        <div className="card">
          <div className="label">Points committed (upcoming)</div>
          <div className="value">
            {formatNumber(upcoming.reduce((s, r) => s + r.pointsUsed, 0))}
          </div>
        </div>
        <div className="card">
          <div className="label">Nights booked (upcoming)</div>
          <div className="value">
            {formatNumber(upcoming.reduce((s, r) => s + nights(r.checkIn, r.checkOut), 0))}
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>Book a stay</h2>
        <form action={createReservation} className="grid">
          <div className="field">
            <label>Resort *</label>
            <input name="resort" required placeholder="Club Wyndham Bonnet Creek" />
          </div>
          <div className="field">
            <label>Timeshare used</label>
            <select name="timeshareId" defaultValue="">
              <option value="">— None / cash —</option>
              {timeshares.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Location</label>
            <input name="location" placeholder="Orlando, FL" />
          </div>
          <div className="field">
            <label>Check-in *</label>
            <input name="checkIn" type="date" required />
          </div>
          <div className="field">
            <label>Check-out *</label>
            <input name="checkOut" type="date" required />
          </div>
          <div className="field">
            <label>Guests</label>
            <input name="guests" type="number" defaultValue={2} min={1} />
          </div>
          <div className="field">
            <label>Unit type</label>
            <input name="unitType" placeholder="2BR Deluxe" />
          </div>
          <div className="field">
            <label>Points used</label>
            <input name="pointsUsed" type="number" defaultValue={0} />
          </div>
          <div className="field">
            <label>Cash cost</label>
            <input name="cashCost" type="number" step="0.01" defaultValue={0} />
          </div>
          <div className="field">
            <label>Confirmation #</label>
            <input name="confirmationNumber" />
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue="CONFIRMED">
              {RESERVATION_STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Guest name (if for someone else)</label>
            <input name="guestName" />
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea name="notes" />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              Add reservation
            </button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h2>Upcoming ({upcoming.length})</h2>
        {upcoming.length === 0 ? (
          <div className="empty">No upcoming reservations.</div>
        ) : (
          renderTable(upcoming)
        )}
      </div>

      <div className="panel">
        <h2>Past & cancelled ({past.length})</h2>
        {past.length === 0 ? (
          <div className="empty">Nothing here yet.</div>
        ) : (
          renderTable(past)
        )}
      </div>
    </div>
  );
}
