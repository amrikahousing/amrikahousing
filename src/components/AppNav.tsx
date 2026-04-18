"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const NAV = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Properties", href: "/properties" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <div className="mr-3 flex items-center gap-2">
          <div
            aria-hidden="true"
            className="h-[16px] w-[16px] rounded-[4px] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,255,255,0.35))] shadow-[0_8px_20px_rgba(0,0,0,0.3)]"
          />
          <span className="text-[13px] font-semibold text-white/80">Amrika</span>
        </div>
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-white/12 text-white"
                  : "text-white/55 hover:bg-white/8 hover:text-white/80"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
      <UserButton />
    </nav>
  );
}
