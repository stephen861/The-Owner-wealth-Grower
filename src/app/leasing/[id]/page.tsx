import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, labelFor, PROSPECT_STATUS, toDateInput } from "@/lib/format";
import { deleteProspect, resolveEscalation, setTourStatus, staffReply, toggleAi, updateProspect } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.prospect.findUnique({
    where: { id },
    include: {
      property: true,
      messages: { orderBy: { createdAt: "asc" } },
      tours: { include: { property: true }, orderBy: { scheduledAt: "desc" } },
    },
  });
  if (!p) notFound();

  const who = p.name ?? p.phone ?? "Web visitor";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{who}</h1>
          <p>
            {[p.phone, p.email, p.source, `lang: ${p.preferredLanguage}`].filter(Boolean).join(" · ")}
            {p.smsOptOut ? " · SMS opted out" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost" href="/leasing">← Inbox</Link>
          <form action={toggleAi} className="inline-form">
            <input type="hidden" name="id" value={p.id} />
            <button className={`btn ${p.aiEnabled ? "ghost" : ""}`} type="submit">
              {p.aiEnabled ? "Take over (pause AI)" : "Hand back to AI"}
            </button>
          </form>
        </div>
      </div>

      {p.needsHuman ? (
        <div className="flash">
          🚩 <strong>Needs staff:</strong> {p.escalationReason ?? "Handoff requested"}
          <form action={resolveEscalation} className="inline-form" style={{ marginLeft: 12 }}>
            <input type="hidden" name="id" value={p.id} />
            <button className="btn small ghost" type="submit">Mark resolved</button>
          </form>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 16 }}>
        <div className="panel">
          <h2>Conversation</h2>
          {p.messages.length === 0 ? <div className="empty">No messages.</div> : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {p.messages.map((m) => {
              const mine = m.direction === "OUT";
              return (
                <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "78%" }}>
                  <div
                    style={{
                      background: mine ? (m.author === "STAFF" ? "var(--accent-soft)" : "var(--panel-2)") : "var(--bg-soft)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "8px 12px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.body}
                  </div>
                  <div className="subnote" style={{ textAlign: mine ? "right" : "left" }}>
                    {m.author === "AGENT" ? "🤖 Agent" : m.author === "STAFF" ? "👤 Staff" : who} · {m.channel} ·{" "}
                    {m.createdAt.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
              );
            })}
          </div>
          <form action={staffReply} style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <input type="hidden" name="id" value={p.id} />
            <input name="body" placeholder={`Reply as staff via ${p.phone ? "SMS" : "web chat"} (pauses AI)…`} style={{ flex: 1 }} required />
            <button className="btn" type="submit">Send</button>
          </form>
        </div>

        <div>
          <div className="panel">
            <h2>Profile</h2>
            <form action={updateProspect} className="stack">
              <input type="hidden" name="id" value={p.id} />
              <div className="field"><label>Name</label><input name="name" defaultValue={p.name ?? ""} /></div>
              <div className="field"><label>Email</label><input name="email" defaultValue={p.email ?? ""} /></div>
              <div className="field"><label>Household size</label><input name="householdSize" type="number" defaultValue={p.householdSize ?? ""} /></div>
              <div className="field"><label>Annual income</label><input name="annualIncome" type="number" step="1" defaultValue={p.annualIncome ?? ""} /></div>
              <div className="field">
                <label>Voucher</label>
                <select name="hasVoucher" defaultValue={p.hasVoucher == null ? "" : String(p.hasVoucher)}>
                  <option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option>
                </select>
              </div>
              <div className="field"><label>Bedrooms wanted</label><input name="bedroomsWanted" type="number" defaultValue={p.bedroomsWanted ?? ""} /></div>
              <div className="field">
                <label>Status</label>
                <select name="status" defaultValue={p.status}>
                  {PROSPECT_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="field"><label>Notes</label><textarea name="notes" rows={4} defaultValue={p.notes ?? ""} /></div>
              <div className="form-actions"><button className="btn small" type="submit">Save</button></div>
            </form>
            <div className="subnote" style={{ marginTop: 8 }}>
              Interest: {p.property?.name ?? "—"} · Move-in: {formatDate(p.moveInDate)} ({toDateInput(p.moveInDate) || "n/a"}) · Income on file: {formatCurrency(p.annualIncome)} · Status: {labelFor(PROSPECT_STATUS, p.status)}
            </div>
          </div>

          <div className="panel">
            <h2>Tours</h2>
            {p.tours.length === 0 ? <div className="empty">None booked.</div> : (
              <table>
                <tbody>
                  {p.tours.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.scheduledAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                        <div className="subnote">{t.property.name} · {t.type.replace("_", " ").toLowerCase()} · {t.status.toLowerCase()}</div>
                      </td>
                      <td className="right">
                        {t.status === "SCHEDULED" ? (
                          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                            {["COMPLETED", "NO_SHOW", "CANCELLED"].map((s) => (
                              <form key={s} action={setTourStatus} className="inline-form">
                                <input type="hidden" name="id" value={t.id} />
                                <input type="hidden" name="status" value={s} />
                                <button className="btn ghost small" type="submit">{s === "NO_SHOW" ? "No-show" : s[0] + s.slice(1).toLowerCase()}</button>
                              </form>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <form action={deleteProspect} className="inline-form">
            <input type="hidden" name="id" value={p.id} />
            <button className="btn danger small" type="submit">Delete prospect & history</button>
          </form>
        </div>
      </div>
    </div>
  );
}
