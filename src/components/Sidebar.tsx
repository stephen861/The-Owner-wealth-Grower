"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/timeshares", label: "Timeshares", icon: "🏖️" },
  { href: "/points", label: "Points & Benefits", icon: "⭐" },
  { href: "/exchanges", label: "Exchanges", icon: "🔁" },
  { href: "/reservations", label: "Reservations", icon: "🗓️" },
  { href: "/fees", label: "Fees & Finances", icon: "💳" },
  { href: "/leasing", label: "FGW Leasing Agent", icon: "🏢" },
];

export default function Sidebar() {
  const pathname = usePathname();
  // The public prospect chat page has no staff navigation.
  if (pathname.startsWith("/chat")) return null;
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">🌴</span>
        <span>
          Owner Wealth Grower
          <small>Timeshare CRM</small>
        </span>
      </div>
      <nav className="nav">
        {links.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={active ? "active" : ""}>
              <span>{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
