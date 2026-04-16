"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { useSignIn } from "@clerk/nextjs";

export default function LoginPage() {
  const emailId = useId();
  const passwordId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [role, setRole] = useState<"property_manager" | "renter">(
    "property_manager",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const isLoading = fetchStatus === "fetching";

  const headlineWords = useMemo(
    () =>
      [
        { word: "Invest", className: "text-[var(--accent)]" },
        { word: "Manage", className: "text-[var(--green)]" },
        { word: "Rent", className: "text-sky-300" },
      ] as const,
    [],
  );

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (prefersReduced) return;

    const id = window.setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % headlineWords.length);
    }, 1600);

    return () => window.clearInterval(id);
  }, [headlineWords.length]);

  const iconLabel = useMemo(
    () => (showPassword ? "Hide password" : "Show password"),
    [showPassword],
  );

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
    const { error } = await signIn.password({ identifier: email, password });
    if (!error) {
      await signIn.finalize();
      router.push("/dashboard");
    }
  }

  const fieldError =
    errors.fields.identifier?.message ?? errors.fields.password?.message ?? null;
  const globalError = errors.global?.[0]?.message ?? null;
  const displayError = fieldError ?? globalError;

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
            <span className="sr-only">
              A Smarter Way to Invest, Manage, or Rent
            </span>
            <span aria-hidden="true">
              A Smarter Way to{" "}
              <span className="relative inline-block align-baseline">
                {headlineWords.map((item, idx) => (
                  <span
                    key={item.word}
                    className={[
                      "absolute left-0 top-0 whitespace-nowrap transition-all duration-500 will-change-transform",
                      item.className,
                      idx === headlineIndex
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-2",
                    ].join(" ")}
                  >
                    {item.word}
                  </span>
                ))}
                <span className="invisible select-none">
                  {headlineWords[0].word}
                </span>
              </span>
            </span>
          </h1>
          <p className="mt-2 text-[clamp(20px,2.2vw,30px)] leading-[1.2] tracking-[-0.01em] text-[var(--accent)]">
            Your home base starts here.
          </p>
          <p className="mt-3.5 max-w-[560px] text-[14px] leading-[1.55] text-white/70">
            Fast property operations for managers, renters, and investors
            <br />
            in one secure workspace.
          </p>
        </div>

        <div
          role="note"
          aria-label="Value proposition"
          className="mt-9 max-w-[520px] rounded-[14px] border border-white/12 bg-[linear-gradient(180deg,rgba(12,16,26,0.35),rgba(12,16,26,0.18))] px-[18px] py-4 shadow-[0_20px_55px_rgba(0,0,0,0.28)] backdrop-blur-[10px]"
        >
          <div className="text-[11px] tracking-[0.08em] text-white/75">
            BUILT FOR FOCUSED DECISIONS
          </div>
          <div className="mt-1 text-[12px] leading-[1.5] text-white/70">
            Track leasing, maintenance, accounting, and investment opportunities with fewer
            clicks.
          </div>
        </div>
      </section>

      <section
        aria-label="Sign in"
        className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--stroke)] bg-[linear-gradient(180deg,var(--card),var(--card2))] shadow-[0_40px_120px_rgba(0,0,0,0.45)] backdrop-blur-[18px]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-2px] bg-[radial-gradient(800px_260px_at_60%_0%,rgba(255,255,255,0.12),transparent_62%)]"
        />

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
          <div className="flex items-start gap-3">
            <div aria-hidden="true" className="mt-1 text-[18px] opacity-90">
              →
            </div>
            <div>
              <h2 className="m-0 text-[28px] tracking-[-0.01em]">Sign in</h2>
              <p className="mt-1.5 text-[12px] text-white/55">
                Signing in as {roleLabel}
              </p>
            </div>
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
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  aria-label={iconLabel}
                  onClick={() => setShowPassword((v) => !v)}
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
              {isLoading ? "Signing in…" : "Sign in"}
            </button>

            <button
              className="w-full rounded-[10px] border border-white/15 bg-white/95 px-3.5 py-3 font-semibold tracking-[0.1px] text-[rgba(10,14,24,0.86)]"
              type="button"
            >
              Sign in with Passkey
            </button>

            <div className="mt-0.5 flex items-center justify-between gap-2.5">
              <a
                href="#"
                className="text-[12px] text-white/85 underline underline-offset-[3px] decoration-white/35 hover:decoration-white/75"
              >
                Forgot password?
              </a>
              <Link
                href="/signup"
                className="text-[12px] text-white/85 underline underline-offset-[3px] decoration-white/35 hover:decoration-white/75"
              >
                Create an account
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
