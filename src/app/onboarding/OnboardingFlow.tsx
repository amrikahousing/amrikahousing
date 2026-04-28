"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";

type Step = "welcome" | "invite" | "done";

function BuildingIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5V21" />
      <path d="M16 9h2.5A1.5 1.5 0 0 1 20 10.5V21" />
      <path d="M8 8h4" />
      <path d="M8 12h4" />
      <path d="M8 16h4" />
      <path d="M3 21h18" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

const STEPS: Step[] = ["welcome", "invite", "done"];

function StepIndicator({ current }: { current: Step }) {
  const labels = ["Workspace", "Invite", "Done"];
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const idx = STEPS.indexOf(current);
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={[
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                done
                  ? "bg-emerald-500 text-white"
                  : active
                    ? "border-2 border-emerald-500 text-emerald-400"
                    : "border border-slate-600 text-slate-500",
              ].join(" ")}
            >
              {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={[
                "text-sm",
                active ? "text-slate-100" : done ? "text-emerald-400" : "text-slate-500",
              ].join(" ")}
            >
              {labels[i]}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={[
                  "mx-1 h-px w-8",
                  done ? "bg-emerald-500" : "bg-slate-700",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WelcomeStep({
  orgName,
  userName,
  onNext,
}: {
  orgName: string;
  userName: string;
  onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
        <BuildingIcon className="h-7 w-7 text-emerald-400" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          Welcome{userName ? `, ${userName}` : ""}!
        </h2>
        <p className="mt-2 text-slate-400">
          Your workspace{" "}
          <span className="font-medium text-slate-200">
            {orgName || "your organization"}
          </span>{" "}
          is ready. Let&apos;s get your team set up in a few quick steps.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
        {[
          "Invite teammates to collaborate",
          "Add your first property",
          "Track leases, maintenance & payments",
        ].map((item) => (
          <div key={item} className="flex items-center gap-3">
            <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckIcon className="h-3 w-3 text-emerald-400" />
            </div>
            <span className="text-sm text-slate-300">{item}</span>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="h-11 w-full rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600"
      >
        Get started
      </button>
    </div>
  );
}

function InviteStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  const { organization } = useOrganization();
  const [invites, setInvites] = useState<string[]>([""]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addRow() {
    setError(null);
    setInvites((prev) => [...prev, ""]);
  }

  function removeRow(i: number) {
    setInvites((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, val: string) {
    setError(null);
    setInvites((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  }

  async function handleSend() {
    const emails = invites.map((e) => e.trim()).filter(Boolean);
    if (!emails.length) {
      onNext();
      return;
    }

    if (!organization) {
      setError("No active organization found. Please refresh and try again.");
      return;
    }

    setSending(true);
    setError(null);

    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const email of emails) {
      try {
        await organization.inviteMember({ emailAddress: email, role: "org:member" });
        succeeded.push(email);
      } catch {
        failed.push(email);
      }
    }

    setSending(false);

    if (failed.length) {
      setError(
        `Could not invite: ${failed.join(", ")}. Check the addresses and try again.`
      );
      setInvites(failed);
    } else {
      setSent(succeeded);
      onNext();
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          Invite your team
        </h2>
        <p className="mt-1.5 text-slate-400">
          Send invites to colleagues who will manage properties with you.
        </p>
      </div>

      <div className="space-y-2">
        {invites.map((email, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => updateRow(i, e.target.value)}
              className="h-10 flex-1 rounded-lg border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
            {invites.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-red-500/50 hover:text-red-400"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-emerald-400"
      >
        <PlusIcon className="h-4 w-4" />
        Add another
      </button>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-400/30 bg-red-950/45 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      {sent.length > 0 && (
        <p className="text-sm text-emerald-400">
          Invites sent to {sent.join(", ")}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="h-11 flex-1 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending invites..." : "Send invites"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="h-11 rounded-lg border border-slate-600 px-5 text-sm text-slate-300 transition hover:border-slate-400 hover:text-slate-100"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function DoneStep({ orgName, onGo }: { orgName: string; onGo: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-500/40">
        <CheckIcon className="h-8 w-8 text-emerald-400" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
          You&apos;re all set!
        </h2>
        <p className="mt-2 text-slate-400">
          <span className="font-medium text-slate-200">
            {orgName || "Your workspace"}
          </span>{" "}
          is ready to go. Head to your dashboard to add properties and start
          managing your portfolio.
        </p>
      </div>
      <button
        onClick={onGo}
        className="h-11 w-full rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600"
      >
        Go to dashboard
      </button>
    </div>
  );
}

export function OnboardingFlow() {
  const router = useRouter();
  const { user } = useUser();
  const { organization } = useOrganization();

  const [step, setStep] = useState<Step>("welcome");

  const orgName =
    organization?.name ??
    (user?.unsafeMetadata?.organizationName as string | undefined) ??
    "";
  const firstName = (user?.unsafeMetadata?.firstName as string | undefined) ?? user?.firstName ?? "";

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: "url('/home-city.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950"
      />

      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
              <BuildingIcon className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-slate-200">Amrika Housing</span>
          </div>

          <div className="mb-8">
            <StepIndicator current={step} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-7 shadow-2xl backdrop-blur-xl">
            {step === "welcome" && (
              <WelcomeStep
                orgName={orgName}
                userName={firstName}
                onNext={() => setStep("invite")}
              />
            )}
            {step === "invite" && (
              <InviteStep
                onNext={() => setStep("done")}
                onSkip={() => setStep("done")}
              />
            )}
            {step === "done" && (
              <DoneStep
                orgName={orgName}
                onGo={() => router.push("/dashboard")}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
