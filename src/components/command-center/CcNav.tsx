"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/command-center", label: "Overview" },
  { href: "/command-center/readiness", label: "Readiness" },
  { href: "/command-center/referrals", label: "Referrals" },
  { href: "/command-center/tasks", label: "Tasks" },
  { href: "/command-center/work-orders", label: "Work orders" },
  { href: "/command-center/jobs", label: "Jobs & cost" },
  { href: "/command-center/agents", label: "Agents" },
  { href: "/command-center/approvals", label: "Approvals" },
  { href: "/command-center/whiteboard", label: "Whiteboard" },
  { href: "/command-center/modules", label: "Modules & import" },
];

const DIVISIONS = [
  { value: "ALL", label: "All" },
  { value: "FGW", label: "FGW" },
  { value: "AFLH", label: "AFLH" },
];

export default function CcNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const division = params.get("division") ?? "ALL";

  const withDivision = (href: string) =>
    division === "ALL" ? href : `${href}?division=${division}`;

  return (
    <div className="cc-nav-wrap">
      <nav className="cc-nav">
        {LINKS.map((l) => {
          const active =
            l.href === "/command-center"
              ? pathname === "/command-center"
              : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={withDivision(l.href)}
              className={active ? "active" : ""}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="cc-division">
        <span className="subnote">Division</span>
        {DIVISIONS.map((d) => (
          <Link
            key={d.value}
            href={d.value === "ALL" ? pathname : `${pathname}?division=${d.value}`}
            className={`btn ghost small${division === d.value ? " active" : ""}`}
          >
            {d.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
