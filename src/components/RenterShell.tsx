"use client";

import { useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

type RenterShellProps = {
  children: React.ReactNode;
  user: {
    email: string | null;
    firstName: string | null;
    imageUrl: string | null;
    portal: "renter";
    canAccessPropertyManager: boolean;
    canAccessRenter: boolean;
    hasBothPortals: boolean;
  };
};

type IconName = "home" | "wallet" | "lease" | "wrench" | "messages" | "profile";

const navigation: Array<{ name: string; href: string; icon: IconName }> = [
  { name: "Overview", href: "/renter", icon: "home" },
  { name: "Payments", href: "/renter/payments", icon: "wallet" },
  { name: "Lease", href: "/renter/lease", icon: "lease" },
  { name: "Maintenance", href: "/renter/maintenance", icon: "wrench" },
  { name: "Messages", href: "/renter/messages", icon: "messages" },
];

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
    case "home":
      return (
        <svg {...shared}>
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9.5Z" />
          <path d="M9 21V12h6v9" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...shared}>
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" />
          <path d="M17 12h3v4h-3a2 2 0 0 1 0-4Z" />
          <path d="M8 9h5M8 13h3" />
        </svg>
      );
    case "wrench":
      return (
        <svg {...shared}>
          <path d="M14.7 6.3a4 4 0 0 0 5 5L11 20l-4-4 8.7-8.7Z" />
          <path d="m7 16-3 3 1 1 3-3" />
        </svg>
      );
    case "lease":
      return (
        <svg {...shared}>
          <path d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" />
          <path d="M14 3.5V8h4" />
          <path d="M9 12h6M9 16h6" />
        </svg>
      );
    case "messages":
      return (
        <svg {...shared}>
          <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H9l-4 3v-3.5A2.5 2.5 0 0 1 2.5 12V6.5Z" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" />
        </svg>
      );
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function SidebarContent({
  user,
  pathname,
  onNavClick,
  onSignOut,
}: {
  user: RenterShellProps["user"];
  pathname: string;
  onNavClick: () => void;
  onSignOut: () => void;
}) {
  const displayName = user.firstName ?? user.email ?? "Account";
  const initial = (user.firstName?.[0] ?? user.email?.[0] ?? "R").toUpperCase();

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="p-6">
        <div className="mb-8">
          <Link
            href="/renter"
            className="flex items-center gap-2"
            onClick={onNavClick}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500">
              <Icon name="home" className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Renter Portal</span>
          </Link>
          <p className="mt-2 text-xs text-slate-500">Amrika Housing</p>
        </div>

        <nav aria-label="Renter navigation" className="space-y-1">
          {navigation.map((item) => {
            const isActive =
              item.href === "/renter"
                ? pathname === "/renter"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sky-600 text-white shadow-lg shadow-sky-950/20"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                )}
                onClick={onNavClick}
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
          onClick={onNavClick}
        >
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-700">
            {user.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-slate-300">{initial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-slate-500">Renter</p>
          </div>
        </Link>

        {user.hasBothPortals ? (
          <Link
            href="/dashboard"
            className="mb-4 flex w-full items-center justify-center rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 hover:text-white"
            onClick={onNavClick}
          >
            Switch to Manager Portal
          </Link>
        ) : null}

        <button
          onClick={onSignOut}
          className="flex w-full items-center justify-start gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <span aria-hidden="true">-&gt;</span>
          Log Out
        </button>
      </div>
    </div>
  );
}

export function RenterShell({ children, user }: RenterShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useClerk();
  const [isOpen, setIsOpen] = useState(false);

  const handleSignOut = () => signOut(() => router.push("/login"));

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-50 text-slate-950">
      {/* Mobile menu button */}
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

      {/* Mobile overlay */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setIsOpen(false)}
          />
          <aside className="relative h-full w-72 shadow-2xl">
            <SidebarContent
              user={user}
              pathname={pathname}
              onNavClick={() => setIsOpen(false)}
              onSignOut={handleSignOut}
            />
          </aside>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-72 border-r border-slate-200 shadow-xl lg:block">
        <SidebarContent
          user={user}
          pathname={pathname}
          onNavClick={() => {}}
          onSignOut={handleSignOut}
        />
      </aside>

      <main className="min-h-dvh min-w-0 p-4 pt-20 md:p-8 lg:ml-72 lg:pt-8">
        <div className="mx-auto max-w-5xl pb-20">{children}</div>
      </main>
    </div>
  );
}
