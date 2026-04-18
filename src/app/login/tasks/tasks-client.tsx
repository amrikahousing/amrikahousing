"use client";

import {
  TaskChooseOrganization,
  TaskResetPassword,
  TaskSetupMFA,
  useSession,
} from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function normalizeRedirectUrl(value: string | null) {
  if (!value) return "/dashboard";

  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/dashboard";

    return `${url.pathname}${url.search}${url.hash}` || "/dashboard";
  } catch {
    return "/dashboard";
  }
}

export function AuthTasksPage() {
  const { isLoaded, session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrlComplete = normalizeRedirectUrl(searchParams.get("redirect_url"));
  const taskKey = session?.currentTask?.key;

  useEffect(() => {
    if (!isLoaded) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!session.currentTask) {
      router.replace(redirectUrlComplete);
    }
  }, [isLoaded, redirectUrlComplete, router, session]);

  let task = null;
  if (taskKey === "choose-organization") {
    task = <TaskChooseOrganization redirectUrlComplete={redirectUrlComplete} />;
  } else if (taskKey === "reset-password") {
    task = <TaskResetPassword redirectUrlComplete={redirectUrlComplete} />;
  } else if (taskKey === "setup-mfa") {
    task = <TaskSetupMFA redirectUrlComplete={redirectUrlComplete} />;
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/home-city.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/75 to-slate-950/90"
      />

      <section
        aria-label="Finish signing in"
        className="relative w-full max-w-[520px] rounded-lg border border-white/10 bg-slate-950/85 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.95)] backdrop-blur-xl sm:p-8"
      >
        <h1 className="mb-2 text-2xl font-semibold tracking-[-0.01em] text-slate-100">
          Finish signing in
        </h1>
        <p className="mb-5 text-sm leading-6 text-slate-300">
          Complete this security step to continue.
        </p>

        {task ?? (
          <p className="rounded-md border border-slate-600 bg-slate-900/80 px-3 py-2 text-sm text-slate-300">
            Checking your sign-in status...
          </p>
        )}
      </section>
    </main>
  );
}
