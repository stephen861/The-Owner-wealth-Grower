"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    title: null,
    links: [{ href: "/", label: "Dashboard", icon: "📊" }],
  },
  {
    title: "Clients",
    links: [
      { href: "/contacts", label: "Contacts", icon: "👥" },
      { href: "/pipeline", label: "Pipeline", icon: "📈" },
      { href: "/activities", label: "Activities", icon: "✅" },
    ],
  },
  {
    title: "Portfolio",
    links: [
      { href: "/timeshares", label: "Timeshares", icon: "🏖️" },
      { href: "/points", label: "Points & Benefits", icon: "⭐" },
      { href: "/exchanges", label: "Exchanges", icon: "🔁" },
      { href: "/reservations", label: "Reservations", icon: "🗓️" },
      { href: "/fees", label: "Fees & Finances", icon: "💳" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">🌴</span>
        <span>
          Owner Wealth Grower
          <small>Travel CRM</small>
        </span>
      </div>
      <nav className="nav">
        {groups.map((g, i) => (
          <div key={g.title ?? `group-${i}`} className="nav-group">
            {g.title ? <div className="nav-title">{g.title}</div> : null}
            {g.links.map((l) => {
              const active =
                l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} className={active ? "active" : ""}>
                  <span>{l.icon}</span>
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
