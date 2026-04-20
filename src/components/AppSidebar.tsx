"use client";

import { useClerk, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type AppSidebarProps = {
  user: {
    email: string | null;
    firstName: string | null;
    imageUrl: string | null;
    role: string;
    organizationName: string | null;
    isOrgAdmin: boolean;
  };
};

type IconName =
  | "dashboard"
  | "accounts"
  | "building"
  | "wrench"
  | "users"
  | "profile";

const navigation: Array<{ name: string; href: string; icon: IconName }> = [
  { name: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { name: "Properties", href: "/properties", icon: "building" },
  { name: "Accounts", href: "/accounts", icon: "accounts" },
  { name: "Maintenance", href: "/maintenance", icon: "wrench" },
];

const implementedRoutes = new Set([
  "/dashboard",
  "/properties",
  "/accounts",
  "/maintenance",
  "/team",
  "/profile",
]);

const roleLabels: Record<string, string> = {
  admin: "Admin",
  property_manager: "Property Manager",
  manager: "Property Manager",
  renter: "Renter",
  tenant: "Renter",
  investor: "Investor",
};

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const shared = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "accounts":
      return (
        <svg {...shared}>
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
          <path d="M17 12h3v4h-3a2 2 0 0 1 0-4Z" />
          <path d="M8 9h5M8 13h3" />
        </svg>
      );
    case "building":
      return (
        <svg {...shared}>
          <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V21" />
          <path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V21" />
          <path d="M8 8h4M8 12h4M8 16h4M3 21h18" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...shared}>
          <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20l-4-4 8.7-8.7Z" />
          <path d="m7 16-3 3 1 1 3-3" />
        </svg>
      );
    case "users":
      return (
        <svg {...shared}>
          <path d="M16 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M3.5 20a5.5 5.5 0 0 1 9-4.2M13.5 20a5 5 0 0 1 8 0" />
        </svg>
      );
    case "profile":
      return (
        <svg {...shared}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5v7h-7v-5.5ZM13.5 4h5A1.5 1.5 0 0 1 20 5.5v5h-6.5V4ZM3.5 13.5h7V20h-5A1.5 1.5 0 0 1 4 18.5v-5ZM13.5 13.5H20v5A1.5 1.5 0 0 1 18.5 20h-5v-6.5Z" />
        </svg>
      );
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);
  const roleLabel = user.isOrgAdmin ? "Admin" : roleLabels[user.role] ?? "Workspace";
  const displayName = user.firstName ?? user.email ?? "Account";
  const initial = (user.firstName?.[0] ?? user.email?.[0] ?? "U").toUpperCase();
  const visibleNavigation = user.isOrgAdmin
    ? [...navigation, { name: "Team", href: "/team", icon: "users" as const }]
    : navigation;

  const content = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="p-6">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2"
            onClick={() => setIsOpen(false)}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500">
              <Icon name="building" className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Amrika Housing
            </span>
          </Link>

          {user.organizationName ? (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2.5">
              <p className="truncate text-sm font-semibold text-slate-100">
                {user.organizationName}
              </p>
            </div>
          ) : null}
        </div>

        <nav aria-label="Main navigation" className="space-y-1">
          {visibleNavigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                prefetch={implementedRoutes.has(item.href)}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-950/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                )}
                onClick={() => setIsOpen(false)}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-slate-800 p-6">
        <Link
          href="/profile"
          className={cx(
            "mb-4 flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-800",
            pathname === "/profile" && "bg-slate-800",
          )}
          onClick={() => setIsOpen(false)}
        >
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700">
            {user.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-slate-300">{initial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-slate-500">{roleLabel}</p>
          </div>
          <UserButton />
        </Link>

        <button
          onClick={() => signOut(() => router.push("/login"))}
          className="flex w-full items-center justify-start gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <span aria-hidden="true">-&gt;</span>
          Log Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed left-3 top-3 z-50 lg:hidden">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white/95 text-slate-900 shadow-md"
          aria-label="Open navigation"
          onClick={() => setIsOpen(true)}
        >
          <span className="h-0.5 w-5 bg-current before:block before:h-0.5 before:w-5 before:-translate-y-1.5 before:bg-current after:block after:h-0.5 after:w-5 after:translate-y-1 after:bg-current" />
        </button>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setIsOpen(false)}
          />
          <aside className="relative h-full w-72 shadow-2xl">{content}</aside>
        </div>
      ) : null}

      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 border-r border-slate-200 shadow-xl lg:block">
        {content}
      </aside>
    </>
  );
}
