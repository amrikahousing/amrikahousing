"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useSignUp } from "@clerk/nextjs";

export default function SignupPage() {
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const codeId = useId();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<"property_manager" | "renter">(
    "property_manager",
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const pendingAction = useRef<"submit" | "verify" | null>(null);

  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const isLoading = fetchStatus === "fetching";

  // React to signUp.status changes so we don't read stale signal values
  useEffect(() => {
    if (!pendingAction.current) return;
    const action = pendingAction.current;

    if (action === "submit") {
      if (signUp.status === "complete") {
        pendingAction.current = null;
        signUp.finalize().then(() => router.push("/dashboard"));
      } else if (signUp.status === "missing_requirements") {
        pendingAction.current = null;
        signUp.verifications.sendEmailCode().then(() => setVerifying(true));
      }
    }
  }, [signUp.status]);

  const roleLabel = useMemo(() => {
    switch (role) {
      case "renter":
        return "Renter";
      default:
        return "Property Manager";
    }
  }, [role]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    if (password !== confirmPassword) {
      setClientError("Passwords do not match.");
      return;
    }

    const nameParts = firstName.trim().split(/\s+/);
    const first = nameParts[0] ?? "";
    const last = nameParts.slice(1).join(" ") || lastName.trim() || undefined;

    const { error } = await signUp.password({
      emailAddress: email,
      password,
      firstName: first,
      lastName: last,
      unsafeMetadata: { role },
    });

    if (error) return;

    // Set pending action — the useEffect above will fire once signUp.status updates
    pendingAction.current = "submit";
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    const { error } = await signUp.verifications.verifyEmailCode({ code: verificationCode });
    if (error) return;

    await signUp.finalize();
    router.push("/dashboard");
  }

  const fieldErrors = errors.fields;
  const globalError = errors.global?.[0]?.message ?? null;
  const displayError =
    clientError ??
    (fieldErrors as Record<string, { message: string } | null>)?.emailAddress?.message ??
    (fieldErrors as Record<string, { message: string } | null>)?.password?.message ??
    (fieldErrors as Record<string, { message: string } | null>)?.firstName?.message ??
    (fieldErrors as Record<string, { message: string } | null>)?.code?.message ??
    globalError;

  if (verifying) {
    return (
      <main className="min-h-full grid grid-cols-1 gap-7 px-5 py-7 lg:min-h-screen lg:grid-cols-[1fr_420px] lg:gap-8 lg:px-12 lg:py-11 xl:grid-cols-[1fr_460px]">
        <section aria-label="Product overview" className="flex min-w-0 flex-col justify-between">
          <div className="pt-1">
            <div className="inline-flex items-center gap-2.5">
              <div
                aria-hidden="true"
                className="h-[18px] w-[18px] rounded-[5px] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,255,255,0.35))] shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
              />
              <div className="font-semibold tracking-[0.2px] text-white/90">Amrika Housing</div>
            </div>
            <h1 className="mt-7 text-[clamp(40px,4.2vw,56px)] leading-[1.03] tracking-[-0.02em]">
              Check your
              <br />
              <span className="text-[var(--accent)]">inbox.</span>
            </h1>
            <p className="mt-3.5 max-w-[560px] text-[14px] leading-[1.55] text-white/70">
              We sent a verification code to <span className="text-white/90">{email}</span>.
              <br />
              Enter it below to activate your account.
            </p>
          </div>
          <div
            role="note"
            aria-label="Security note"
            className="mt-9 max-w-[520px] rounded-[14px] border border-white/12 bg-[linear-gradient(180deg,rgba(12,16,26,0.35),rgba(12,16,26,0.18))] px-[18px] py-4 shadow-[0_20px_55px_rgba(0,0,0,0.28)] backdrop-blur-[10px]"
          >
            <div className="text-[11px] tracking-[0.08em] text-white/75">ALMOST THERE</div>
            <div className="mt-1 text-[12px] leading-[1.5] text-white/70">
              Didn&apos;t receive it? Check your spam folder or go back and try again.
            </div>
          </div>
        </section>

        <section
          aria-label="Verify email"
          className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--stroke)] bg-[linear-gradient(180deg,var(--card),var(--card2))] shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-[18px]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-2px] bg-[radial-gradient(800px_260px_at_60%_0%,rgba(255,255,255,0.12),transparent_62%)]"
          />

          <div className="px-5 pb-6 pt-8 sm:px-8">
            <div className="flex items-start gap-3">
              <div aria-hidden="true" className="mt-1 text-[18px] opacity-90">→</div>
              <div>
                <h2 className="m-0 text-[28px] tracking-[-0.01em]">Verify email</h2>
                <p className="mt-1.5 text-[12px] text-white/55">
                  Enter the 6-digit code we sent you
                </p>
              </div>
            </div>

            <form className="mt-6 grid gap-3.5" onSubmit={handleVerify} autoComplete="off">
              <div className="grid gap-1.5">
                <label htmlFor={codeId} className="text-[12px] text-white/75">
                  Verification code
                </label>
                <input
                  id={codeId}
                  className="w-full rounded-[10px] border border-white/15 bg-white/90 px-3 py-3 text-center text-[18px] font-semibold tracking-[0.25em] text-[rgba(10,14,24,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.14)] placeholder:text-[rgba(10,14,24,0.45)] outline-none focus:border-[rgba(246,184,74,0.55)] focus:shadow-[0_0_0_4px_rgba(246,184,74,0.16),0_18px_45px_rgba(0,0,0,0.14)]"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="——————"
                  required
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              {displayError && (
                <p role="alert" className="text-[12px] text-red-400">
                  {displayError}
                </p>
              )}

              <button
                className="mt-0.5 w-full rounded-[10px] border border-white/15 bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-3.5 py-3 font-semibold tracking-[0.1px] text-white/95 shadow-[0_22px_60px_rgba(16,185,129,0.22)] hover:brightness-[1.04] disabled:opacity-60 disabled:cursor-not-allowed"
                type="submit"
                disabled={isLoading}
              >
                {isLoading ? "Verifying…" : "Verify & continue"}
              </button>

              <div className="flex justify-center">
                <button
                  type="button"
                  className="text-[12px] text-white/85 underline underline-offset-[3px] decoration-white/35 hover:decoration-white/75"
                  onClick={() => setVerifying(false)}
                >
                  ← Go back
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-full grid grid-cols-1 gap-7 px-5 py-7 lg:min-h-screen lg:grid-cols-[1fr_420px] lg:gap-8 lg:px-12 lg:py-11 xl:grid-cols-[1fr_460px]">
      <section aria-label="Product overview" className="flex min-w-0 flex-col justify-between">
        <div className="pt-1">
          <div className="inline-flex items-center gap-2.5">
            <div
              aria-hidden="true"
              className="h-[18px] w-[18px] rounded-[5px] bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(255,255,255,0.35))] shadow-[0_12px_30px_rgba(0,0,0,0.35)]"
            />
            <div className="font-semibold tracking-[0.2px] text-white/90">Amrika Housing</div>
          </div>

          <h1 className="mt-7 text-[clamp(40px,4.2vw,56px)] leading-[1.03] tracking-[-0.02em]">
            Your home base
            <br />
            <span className="text-[var(--accent)]">starts here.</span>
          </h1>
          <p className="mt-3.5 max-w-[560px] text-[14px] leading-[1.55] text-white/70">
            Join thousands of managers and renters who trust Amrika Housing
            <br />
            to streamline every step of the leasing journey.
          </p>
        </div>

        <div
          role="note"
          aria-label="Value proposition"
          className="mt-9 max-w-[520px] rounded-[14px] border border-white/12 bg-[linear-gradient(180deg,rgba(12,16,26,0.35),rgba(12,16,26,0.18))] px-[18px] py-4 shadow-[0_20px_55px_rgba(0,0,0,0.28)] backdrop-blur-[10px]"
        >
          <div className="text-[11px] tracking-[0.08em] text-white/75">
            GET STARTED IN MINUTES
          </div>
          <div className="mt-1 text-[12px] leading-[1.5] text-white/70">
            Set up your workspace, invite your team, and start managing properties
            or searching for your next home today.
          </div>
        </div>
      </section>

      <section
        aria-label="Create account"
        className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--stroke)] bg-[linear-gradient(180deg,var(--card),var(--card2))] shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-[18px]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-2px] bg-[radial-gradient(800px_260px_at_60%_0%,rgba(255,255,255,0.12),transparent_62%)]"
        />

        <div id="clerk-captcha" />

        <div className="flex justify-end px-[18px] pt-[18px]">
          <button
            type="button"
            aria-label="Menu"
            className="grid h-[38px] w-[38px] place-items-center rounded-xl border border-white/15 bg-white/5 text-white/90 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[rgba(246,184,74,0.35)]"
          >
            <span aria-hidden="true">≡</span>
          </button>
        </div>

        <div className="px-5 pb-6 pt-5 sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div aria-hidden="true" className="mt-1 text-[18px] opacity-90">
                →
              </div>
              <div>
                <h2 className="m-0 text-[28px] tracking-[-0.01em]">Create account</h2>
                <p className="mt-1.5 text-[12px] text-white/55">
                  Signing up as {roleLabel}
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="mt-1 shrink-0 text-[12px] text-white/55 hover:text-white/85 transition-colors"
            >
              ← Sign in
            </Link>
          </div>

          <fieldset className="mt-4">
            <legend className="sr-only">Select role</legend>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/15 bg-white/5 p-1">
              <label className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="role"
                  value="property_manager"
                  checked={role === "property_manager"}
                  onChange={() => setRole("property_manager")}
                />
                <span className="block select-none rounded-[10px] px-3 py-2 text-center text-[12px] font-semibold tracking-[0.1px] text-white/80 transition-colors peer-checked:bg-white/15 peer-checked:text-white">
                  Manager
                </span>
              </label>

              <label className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="role"
                  value="renter"
                  checked={role === "renter"}
                  onChange={() => setRole("renter")}
                />
                <span className="block select-none rounded-[10px] px-3 py-2 text-center text-[12px] font-semibold tracking-[0.1px] text-white/80 transition-colors peer-checked:bg-white/15 peer-checked:text-white">
                  Renter
                </span>
              </label>
            </div>
          </fieldset>

          <form className="mt-5 grid gap-3.5" onSubmit={handleSubmit} autoComplete="on">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label htmlFor={nameId} className="text-[12px] text-white/75">
                  First name
                </label>
                <input
                  id={nameId}
                  className="w-full rounded-[10px] border border-white/15 bg-white/90 px-3 py-3 text-[13px] text-[rgba(10,14,24,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.14)] placeholder:text-[rgba(10,14,24,0.45)] outline-none focus:border-[rgba(246,184,74,0.55)] focus:shadow-[0_0_0_4px_rgba(246,184,74,0.16),0_18px_45px_rgba(0,0,0,0.14)]"
                  type="text"
                  name="firstName"
                  placeholder="Jane"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] text-white/75">Last name</label>
                <input
                  className="w-full rounded-[10px] border border-white/15 bg-white/90 px-3 py-3 text-[13px] text-[rgba(10,14,24,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.14)] placeholder:text-[rgba(10,14,24,0.45)] outline-none focus:border-[rgba(246,184,74,0.55)] focus:shadow-[0_0_0_4px_rgba(246,184,74,0.16),0_18px_45px_rgba(0,0,0,0.14)]"
                  type="text"
                  name="lastName"
                  placeholder="Smith"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor={emailId} className="text-[12px] text-white/75">
                Email
              </label>
              <input
                id={emailId}
                className="w-full rounded-[10px] border border-white/15 bg-white/90 px-3 py-3 text-[13px] text-[rgba(10,14,24,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.14)] placeholder:text-[rgba(10,14,24,0.45)] outline-none focus:border-[rgba(246,184,74,0.55)] focus:shadow-[0_0_0_4px_rgba(246,184,74,0.16),0_18px_45px_rgba(0,0,0,0.14)]"
                type="email"
                name="email"
                placeholder="you@company.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor={passwordId} className="text-[12px] text-white/75">
                Password
              </label>
              <div className="relative">
                <input
                  id={passwordId}
                  className="w-full rounded-[10px] border border-white/15 bg-white/90 px-3 py-3 pr-12 text-[13px] text-[rgba(10,14,24,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.14)] placeholder:text-[rgba(10,14,24,0.45)] outline-none focus:border-[rgba(246,184,74,0.55)] focus:shadow-[0_0_0_4px_rgba(246,184,74,0.16),0_18px_45px_rgba(0,0,0,0.14)]"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="Create a password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-[34px] w-[34px] -translate-y-1/2 place-items-center rounded-[10px] border border-black/10 bg-white/60 text-[16px] text-black/75"
                >
                  <span aria-hidden="true">👁</span>
                </button>
              </div>
            </div>

            <div className="grid gap-1.5">
              <label htmlFor={confirmPasswordId} className="text-[12px] text-white/75">
                Confirm password
              </label>
              <div className="relative">
                <input
                  id={confirmPasswordId}
                  className="w-full rounded-[10px] border border-white/15 bg-white/90 px-3 py-3 pr-12 text-[13px] text-[rgba(10,14,24,0.92)] shadow-[0_18px_45px_rgba(0,0,0,0.14)] placeholder:text-[rgba(10,14,24,0.45)] outline-none focus:border-[rgba(246,184,74,0.55)] focus:shadow-[0_0_0_4px_rgba(246,184,74,0.16),0_18px_45px_rgba(0,0,0,0.14)]"
                  type={showConfirmPassword ? "text" : "password"}
                  name="confirmPassword"
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-2 top-1/2 grid h-[34px] w-[34px] -translate-y-1/2 place-items-center rounded-[10px] border border-black/10 bg-white/60 text-[16px] text-black/75"
                >
                  <span aria-hidden="true">👁</span>
                </button>
              </div>
            </div>

            {displayError && (
              <p role="alert" className="text-[12px] text-red-400">
                {displayError}
              </p>
            )}

            <button
              className="mt-0.5 w-full rounded-[10px] border border-white/15 bg-[linear-gradient(180deg,rgba(16,185,129,1),rgba(10,145,100,1))] px-3.5 py-3 font-semibold tracking-[0.1px] text-white/95 shadow-[0_22px_60px_rgba(16,185,129,0.22)] hover:brightness-[1.04] disabled:opacity-60 disabled:cursor-not-allowed"
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "Creating account…" : "Create account"}
            </button>

            <div className="mt-0.5 flex items-center justify-center">
              <Link
                href="/login"
                className="text-[12px] text-white/85 underline underline-offset-[3px] decoration-white/35 hover:decoration-white/75"
              >
                Already have an account? Sign in
              </Link>
            </div>

            <p className="m-0 pt-1.5 text-[10px] leading-[1.45] text-white/60">
              This site is protected by reCAPTCHA and the Google{" "}
              <a
                className="text-white/75 underline underline-offset-[3px] decoration-white/35 hover:decoration-white/75"
                href="#"
              >
                Privacy Policy
              </a>
              ,{" "}
              <a
                className="text-white/75 underline underline-offset-[3px] decoration-white/35 hover:decoration-white/75"
                href="#"
              >
                Terms of Service
              </a>{" "}
              apply.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
