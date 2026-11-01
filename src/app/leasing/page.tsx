import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, labelFor, PROSPECT_STATUS, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  NEW: "blue",
  PRESCREENED: "green",
  TOUR_SCHEDULED: "green",
  APPLYING: "green",
  WAITLIST: "amber",
  LEASED: "green",
  NOT_ELIGIBLE: "",
  CLOSED: "",
};

export default async function LeasingInbox({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const [prospects, newLeads, needsHuman, upcomingTours, afterHours, available] = await Promise.all([
    prisma.prospect.findMany({
      where:
        filter === "human"
          ? { needsHuman: true }
          : filter === "tours"
            ? { status: "TOUR_SCHEDULED" }
            : filter === "active"
              ? { status: { notIn: ["LEASED", "NOT_ELIGIBLE", "CLOSED"] } }
              : undefined,
      orderBy: [{ needsHuman: "desc" }, { lastMessageAt: "desc" }],
      include: {
        property: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      take: 200,
    }),
    prisma.prospect.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.prospect.count({ where: { needsHuman: true } }),
    prisma.tour.findMany({
      where: { status: "SCHEDULED", scheduledAt: { gte: new Date() } },
      include: { prospect: true, property: true },
      orderBy: { scheduledAt: "asc" },
      take: 8,
    }),
    // Inbound messages outside 9–5 in the last 7 days = conversations staff would have missed.
    prisma.message.findMany({
      where: { direction: "IN", createdAt: { gte: weekAgo } },
      select: { createdAt: true },
    }),
    prisma.unit.count({ where: { status: "AVAILABLE" } }),
  ]);
  const offHours = afterHours.filter((m) => {
    const h = m.createdAt.getHours();
    const d = m.createdAt.getDay();
    return d === 0 || d === 6 || h < 9 || h >= 17;
  }).length;

  const tabs = [
    { key: undefined, label: "All" },
    { key: "active", label: "Active pipeline" },
    { key: "human", label: `Needs staff (${needsHuman})` },
    { key: "tours", label: "Tour scheduled" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>FGW Leasing Agent</h1>
          <p>24/7 AI leasing for affordable housing — SMS + web chat, pre-screening, tours, handoffs.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn ghost" href="/leasing/properties">Properties & units</Link>
          <Link className="btn" href="/chat" target="_blank">Open web chat ↗</Link>
        </div>
      </div>

      {!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN ? (
        <div className="flash">
          ⚠️ <strong>AI is offline</strong> — set <code>ANTHROPIC_API_KEY</code> in <code>.env</code>. Until then the agent
          captures leads, sends a holding reply, and flags every conversation for staff.
        </div>
      ) : null}

      <div className="cards">
        <div className="card">
          <div className="label">New leads (7d)</div>
          <div className="value">{newLeads}</div>
        </div>
        <div className="card">
          <div className="label">Needs staff</div>
          <div className="value" style={{ color: needsHuman ? "var(--red)" : undefined }}>{needsHuman}</div>
          <div className="sub">escalations & handoffs</div>
        </div>
        <div className="card">
          <div className="label">After-hours messages (7d)</div>
          <div className="value">{offHours}</div>
          <div className="sub">answered instantly by the agent</div>
        </div>
        <div className="card">
          <div className="label">Upcoming tours</div>
          <div className="value">{upcomingTours.length}</div>
        </div>
        <div className="card">
          <div className="label">Available units</div>
          <div className="value">{available}</div>
        </div>
      </div>

      {upcomingTours.length > 0 ? (
        <div className="panel">
          <h2>Upcoming tours</h2>
          <table>
            <thead>
              <tr><th>When</th><th>Prospect</th><th>Property</th><th>Type</th></tr>
            </thead>
            <tbody>
              {upcomingTours.map((t) => (
                <tr key={t.id}>
                  <td>{t.scheduledAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td><Link href={`/leasing/${t.prospectId}`}>{t.prospect.name ?? t.prospect.phone ?? "Web visitor"}</Link></td>
                  <td>{t.property.name}</td>
                  <td>{t.type.replace("_", " ").toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="panel">
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <Link
              key={t.label}
              href={t.key ? `/leasing?filter=${t.key}` : "/leasing"}
              className={`btn small ${filter === t.key ? "" : "ghost"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        {prospects.length === 0 ? (
          <div className="empty">No conversations yet. Text your Twilio number or open the web chat to test.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Prospect</th>
                <th>Last message</th>
                <th>Household / income</th>
                <th>Interest</th>
                <th>Status</th>
                <th>Agent</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p) => {
                const last = p.messages[0];
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/leasing/${p.id}`}>
                        <strong>{p.name ?? p.phone ?? "Web visitor"}</strong>
                      </Link>
                      <div className="subnote">{p.source ?? "—"} · {timeAgo(p.lastMessageAt ?? p.createdAt)}</div>
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      {last ? (
                        <span className="muted">
                          {last.direction === "IN" ? "← " : "→ "}
                          {last.body.length > 90 ? last.body.slice(0, 90) + "…" : last.body}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {p.householdSize ? `${p.householdSize} ppl` : "—"} · {formatCurrency(p.annualIncome)}
                      {p.hasVoucher ? <div className="subnote">Voucher holder</div> : null}
                    </td>
                    <td>
                      {p.property?.name ?? "—"}
                      {p.bedroomsWanted != null ? <div className="subnote">{p.bedroomsWanted}BR{p.moveInDate ? ` · ${formatDate(p.moveInDate)}` : ""}</div> : null}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_COLOR[p.status] ?? ""}`}>{labelFor(PROSPECT_STATUS, p.status)}</span>
                      {p.needsHuman ? (
                        <div><span className="badge red" title={p.escalationReason ?? ""}>Needs staff</span></div>
                      ) : null}
                    </td>
                    <td>{p.aiEnabled ? <span className="badge green">AI on</span> : <span className="badge amber">Staff</span>}</td>
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
