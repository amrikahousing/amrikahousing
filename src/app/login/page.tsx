"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";

type LoginRole = "property_manager" | "renter";
type AuthMode = "signin" | "signup" | "verify" | "forgot" | "reset";

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

function KeyIcon({ className = "" }: { className?: string }) {
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
      <circle cx="8" cy="15" r="3.5" />
      <path d="M10.5 12.5 20 3" />
      <path d="m15 8 2 2" />
      <path d="m18 5 2 2" />
    </svg>
  );
}

function EyeIcon({
  className = "",
  hidden,
}: {
  className?: string;
  hidden: boolean;
}) {
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
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
      {hidden ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (isClerkAPIResponseError(error)) {
    const clerkError = error.errors[0];
    const traceId = error.clerkTraceId
      ? ` Trace ID: ${error.clerkTraceId}.`
      : "";
    const code = clerkError?.code ? ` (${clerkError.code})` : "";

    return (
      `${
        clerkError?.longMessage ??
        clerkError?.message ??
        error.message ??
        fallback
      }${code}.${traceId}`
    ).trim();
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
}

function hasClerkErrorCode(error: unknown, code: string) {
  if (!isClerkAPIResponseError(error)) return false;

  return error.errors.some((clerkError) => clerkError.code === code);
}

export function AuthPage({ initialMode = "signin" }: { initialMode?: AuthMode }) {
  const emailId = useId();
  const passwordId = useId();
  const firstNameId = useId();
  const lastNameId = useId();
  const organizationId = useId();
  const confirmPasswordId = useId();
  const codeId = useId();

  const [mode, setMode] = useState<AuthMode>(() => {
    if (typeof window === "undefined") return initialMode;

    const url = new URL(window.location.href);
    if (url.searchParams.get("__clerk_ticket")) return "signup";
    return url.searchParams.get("mode") === "signup" ? "signup" : initialMode;
  });
  const [inviteTicket] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("__clerk_ticket");
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [role, setRole] = useState<LoginRole>("property_manager");
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";

    const url = new URL(window.location.href);
    return url.searchParams.get("email") ?? "";
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientNotice, setClientNotice] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    const url = new URL(window.location.href);
    if (url.searchParams.get("password_reset") === "success") {
      return "Your password was updated. Please sign in.";
    }
    if (url.searchParams.get("signed_out") === "1") {
      return "You have been signed out. Please sign in again.";
    }

    return null;
  });

  const { signIn, errors: signInErrors, fetchStatus: signInFetchStatus } =
    useSignIn();
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetchStatus } =
    useSignUp();
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const router = useRouter();
  const isLoading =
    signInFetchStatus === "fetching" || signUpFetchStatus === "fetching";

  const headlineWords = useMemo(
    () =>
      [
        { word: "Invest", className: "text-amber-400" },
        { word: "Manage", className: "text-emerald-400" },
        { word: "Rent", className: "text-sky-400" },
      ] as const,
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    url.searchParams.delete("mode");
    url.searchParams.delete("__clerk_ticket");
    url.searchParams.delete("password_reset");
    url.searchParams.delete("signed_out");
    url.searchParams.delete("email");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

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

  const roleLabel = useMemo(() => {
    switch (role) {
      case "renter":
        return "Renter";
      default:
        return "Property Manager";
    }
  }, [role]);

  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "verify"
        ? "Verify email"
        : mode === "forgot"
          ? "Reset password"
          : mode === "reset"
            ? "Create new password"
            : "Sign in";
  const description =
    mode === "signup"
      ? "Set up access in under a minute."
      : mode === "verify"
        ? "Enter the 6-digit code we sent you."
        : mode === "forgot"
          ? "Enter your email and we will send a reset code."
          : mode === "reset"
            ? "Enter the code we sent and choose a new password."
        : "";

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setClientError(null);
    setClientNotice(null);
  }

  async function createOrganizationIfNeeded() {
    if (inviteTicket) return;

    const name = organizationName.trim();
    if (role !== "property_manager" || !name) return;

    const clerkWithOrgs = clerk as typeof clerk & {
      createOrganization?: (params: { name: string }) => Promise<unknown>;
      setActive?: (params: { organization?: string }) => Promise<unknown>;
    };

    if (typeof clerkWithOrgs.createOrganization !== "function") return;

    const organization = (await clerkWithOrgs.createOrganization({ name })) as {
      id?: string;
    };

    if (organization?.id && typeof clerkWithOrgs.setActive === "function") {
      await clerkWithOrgs.setActive({ organization: organization.id });
    }
  }

  async function completeSignup() {
    const sessionId = signUp.createdSessionId;

    if (sessionId) {
      await clerk.setActive({ session: sessionId });
      await createOrganizationIfNeeded();
      router.push(role === "property_manager" ? "/onboarding" : "/dashboard");
      return;
    }

    switchMode("signin");
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    setClientNotice(null);

    const redirectToCleanSignIn = async () => {
      const redirectUrl = new URL("/login", window.location.origin);
      const trimmedEmail = email.trim();
      if (trimmedEmail) redirectUrl.searchParams.set("email", trimmedEmail);
      redirectUrl.searchParams.set("signed_out", "1");

      await clerk.signOut({ redirectUrl: `${redirectUrl.pathname}${redirectUrl.search}` });
    };

    if (isSignedIn || clerk.isSignedIn) {
      await redirectToCleanSignIn();
      return;
    }

    try {
      if (signIn.id) {
        const { error: resetError } = await signIn.reset();
        if (resetError) {
          setClientError(getErrorMessage(resetError, "We could not restart sign in."));
          return;
        }
      }

      const { error } = await signIn.password({ identifier: email, password });
      if (error) {
        if (hasClerkErrorCode(error, "session_exists")) {
          await redirectToCleanSignIn();
          return;
        }

        setClientError(getErrorMessage(error, "We could not sign you in."));
        return;
      }

      const { error: finalizeError } = await signIn.finalize();
      if (finalizeError) {
        setClientError(getErrorMessage(finalizeError, "We could not finish signing you in."));
        return;
      }

      router.push("/dashboard");
    } catch (error) {
      setClientError(getErrorMessage(error, "Something went wrong. Please try again."));
    }
  }

  async function handleForgotPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    setClientNotice(null);

    const identifier = email.trim();
    if (!identifier) {
      setClientError("Enter your email so we can send a reset code.");
      return;
    }

    try {
      if (isSignedIn || clerk.isSignedIn) {
        await clerk.signOut();
      }

      if (signIn.id && !signIn.canBeDiscarded) {
        const { error: resetError } = await signIn.reset();
        if (resetError) {
          setClientError(getErrorMessage(resetError, "We could not restart password reset."));
          return;
        }
      }

      const { error } = await signIn.create({ identifier });

      if (error) {
        setClientError(getErrorMessage(error, "We could not send a reset code."));
        return;
      }

      const { error: sendError } = await signIn.resetPasswordEmailCode.sendCode();

      if (sendError) {
        setClientError(getErrorMessage(sendError, "We could not send a reset code."));
        return;
      }

      setClientNotice("Check your email for a 6-digit reset code.");
      setVerificationCode("");
      setPassword("");
      setConfirmPassword("");
      setMode("reset");
    } catch (error) {
      setClientError(getErrorMessage(error, "Something went wrong. Please try again."));
    }
  }

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    setClientNotice(null);

    if (password !== confirmPassword) {
      setClientError("Passwords do not match.");
      return;
    }

    try {
      const { error: codeError } =
        await signIn.resetPasswordEmailCode.verifyCode({
          code: verificationCode,
        });
      if (codeError) {
        setClientError(getErrorMessage(codeError, "We could not verify that code."));
        return;
      }

      const { error: passwordError } =
        await signIn.resetPasswordEmailCode.submitPassword({
          password,
          signOutOfOtherSessions: true,
        });
      if (passwordError) {
        setClientError(getErrorMessage(passwordError, "We could not update your password."));
        return;
      }

      await signIn.reset();
      await clerk.signOut({
        redirectUrl: "/login?password_reset=success",
      });
    } catch (error) {
      setClientError(getErrorMessage(error, "Something went wrong. Please try again."));
    }
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    if (password !== confirmPassword) {
      setClientError("Passwords do not match.");
      return;
    }

    const nameParts = firstName.trim().split(/\s+/);
    const first = nameParts[0] ?? "";
    const last = nameParts.slice(1).join(" ") || lastName.trim() || undefined;

    try {
      if (signUp.id && signUp.status !== "complete") {
        const { error: resetError } = await signUp.reset();
        if (resetError) {
          setClientError(getErrorMessage(resetError, "We could not restart signup."));
          return;
        }
      }

      const createParams = inviteTicket
        ? {
            strategy: "ticket" as const,
            ticket: inviteTicket,
            password,
            firstName: first || undefined,
            lastName: last,
            unsafeMetadata: { role: "property_manager" },
          }
        : {
            emailAddress: email,
            password,
            unsafeMetadata: {
              firstName: first,
              lastName: last,
              role: "renter",
            },
          };

      const { error } = await signUp.create(createParams);

      if (error) {
        setClientError(getErrorMessage(error, "We could not create your account."));
        return;
      }

      if (signUp.status === "complete") {
        await completeSignup();
        return;
      }

      if (
        signUp.status === "missing_requirements" ||
        signUp.unverifiedFields.includes("email_address")
      ) {
        const { error: verificationError } =
          await signUp.verifications.sendEmailCode();
        if (verificationError) {
          setClientError(getErrorMessage(verificationError, "We could not send the code."));
          return;
        }
        switchMode("verify");
        return;
      }

      setClientError("We could not finish creating your account. Please try again.");
    } catch (error) {
      setClientError(getErrorMessage(error, "Something went wrong. Please try again."));
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);

    try {
      const { error } = await signUp.verifications.verifyEmailCode({
        code: verificationCode,
      });
      if (error) {
        setClientError(getErrorMessage(error, "We could not verify that code."));
        return;
      }

      await completeSignup();
    } catch (error) {
      setClientError(getErrorMessage(error, "Something went wrong. Please try again."));
    }
  }

  const signInFieldError =
    signInErrors.fields.identifier?.message ??
    signInErrors.fields.password?.message ??
    null;
  const signInGlobalError = signInErrors.global?.[0]?.message ?? null;
  const signUpFieldErrors = signUpErrors.fields as unknown as Record<
    string,
    { message: string } | null | undefined
  >;
  const signUpGlobalError = signUpErrors.global?.[0]?.message ?? null;
  const displayError =
    clientError ??
    (mode === "signin"
      ? signInFieldError ?? signInGlobalError
      : mode === "forgot" || mode === "reset"
        ? signInFieldError ?? signInGlobalError
      : signUpFieldErrors.emailAddress?.message ??
        signUpFieldErrors.password?.message ??
        signUpFieldErrors.firstName?.message ??
        signUpFieldErrors.captcha?.message ??
        signUpFieldErrors.code?.message ??
        signUpGlobalError);
  const hasDebugErrors =
    process.env.NODE_ENV !== "production" &&
    mode !== "signin" &&
    Boolean(
      signUpErrors.raw ||
        signUpErrors.global ||
        Object.values(signUpErrors.fields).some(Boolean),
    );

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/home-city.jpg')" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/45 via-slate-950/70 to-slate-950/85"
      />

      <div className="relative grid min-h-screen lg:grid-cols-2">
        <section
          aria-label="Product overview"
          className="relative hidden min-w-0 flex-col justify-between overflow-hidden border-r border-white/10 bg-slate-950/20 p-12 backdrop-blur-[1px] lg:flex"
        >
          <div className="relative text-slate-100">
            <div className="mb-8 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700/80">
                <BuildingIcon className="h-4 w-4 text-slate-300" />
              </div>
              <div className="text-lg font-semibold tracking-[-0.01em] text-slate-200">
                Amrika Housing
              </div>
            </div>

            <h1 className="mb-5 text-[clamp(36px,4vw,52px)] font-normal leading-[1.15] tracking-[-0.025em]">
              <span className="sr-only">
                A Smarter Way to Invest, Manage, or Rent
              </span>
              <span aria-hidden="true" className="whitespace-nowrap">
                <span className="font-normal text-slate-400">A Smarter Way to </span>
                <span className="relative inline-block align-baseline">
                  {headlineWords.map((item, idx) => (
                    <span
                      key={item.word}
                      className={[
                        "absolute left-0 top-0 whitespace-nowrap transition-all duration-300 will-change-transform",
                        item.className,
                        idx === headlineIndex
                          ? "translate-y-0 opacity-100"
                          : "translate-y-2 opacity-0",
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
            <p className="mt-3.5 max-w-md text-[14px] leading-[1.55] text-slate-400">
              Fast property operations for managers, renters, and investors in
              one secure workspace.
            </p>
          </div>

          <div
            role="note"
            aria-label="Value proposition"
            className="relative grid gap-3 text-slate-100"
          >
            <div className="rounded-xl border border-white/10 bg-slate-900/50 p-4 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-widest text-emerald-300">
                Built for focused decisions
              </p>
              <p className="mt-2 text-sm text-slate-300">
                Track leasing, maintenance, accounting, and investment
                opportunities with fewer clicks.
              </p>
            </div>
          </div>
        </section>

        <section
          aria-label={title}
          className="flex items-start justify-center overflow-y-auto bg-slate-950/35 p-4 py-8 sm:items-center sm:p-6 lg:p-10"
        >
          <div className="w-full max-w-[520px] rounded-3xl bg-gradient-to-br from-emerald-400/70 via-emerald-500/10 to-sky-500/60 p-[1.2px] shadow-[0_18px_60px_rgba(15,23,42,0.95)]">
            <div className="w-full rounded-[1.6rem] border border-white/10 bg-slate-950/85 shadow-[0_18px_60px_rgba(15,23,42,0.95)] backdrop-blur-xl">
              <div className="space-y-2 px-6 pb-2 pt-4 sm:space-y-2 sm:px-9 sm:pb-3 sm:pt-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 lg:hidden">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900">
                      <BuildingIcon className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-semibold text-slate-100">
                      Amrika Housing
                    </span>
                  </div>
                </div>

                <div>
                  <h2 className="flex items-center gap-2 text-[20px] leading-tight tracking-[-0.025em] text-slate-100 sm:text-[24px]">
                    <KeyIcon className="h-6 w-6 text-emerald-400" />
                    {title}
                  </h2>
                  {description ? (
                    <p className="mt-1 text-[15px] text-slate-300">
                      {description}
                    </p>
                  ) : null}
                </div>

                {mode === "signin" ? (
                  <>
                    <p className="text-sm text-slate-300">
                      Signing in as{" "}
                      <span className="font-medium text-slate-100">
                        {roleLabel}
                      </span>
                    </p>

                    <fieldset>
                      <legend className="sr-only">Select role</legend>
                      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-600 bg-slate-900/80 p-1">
                        <label className="cursor-pointer">
                          <input
                            className="peer sr-only"
                            type="radio"
                            name="role"
                            value="property_manager"
                            checked={role === "property_manager"}
                            onChange={() => setRole("property_manager")}
                          />
                          <span className="block select-none rounded-md px-3 py-2 text-center text-sm font-semibold text-slate-300 transition-colors peer-checked:bg-white/15 peer-checked:text-white">
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
                          <span className="block select-none rounded-md px-3 py-2 text-center text-sm font-semibold text-slate-300 transition-colors peer-checked:bg-white/15 peer-checked:text-white">
                            Renter
                          </span>
                        </label>
                      </div>
                    </fieldset>
                  </>
                ) : null}

                {inviteTicket && mode === "signup" ? (
                  <p className="text-sm text-slate-400">
                    You&apos;ve been invited as a{" "}
                    <span className="font-medium text-slate-200">Property Manager</span>.
                    Set a password to activate your account.
                  </p>
                ) : null}
              </div>

              <div className="px-6 pb-4 sm:px-9 sm:pb-5">
                {mode === "signin" ? (
                  <form
                    className="space-y-2.5"
                    onSubmit={handleSignIn}
                    autoComplete="on"
                  >
                    <div className="space-y-2">
                      <label htmlFor={emailId} className="text-sm text-slate-200">
                        Email
                      </label>
                      <input
                        id={emailId}
                        className="h-12 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-base text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        type="email"
                        name="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor={passwordId}
                        className="text-sm text-slate-200"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id={passwordId}
                          className="h-12 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 pr-12 text-base text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-500 bg-slate-800/95 text-slate-100 outline-none transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                        >
                          <EyeIcon className="h-4 w-4" hidden={showPassword} />
                        </button>
                      </div>
                    </div>

                    {displayError && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-400/30 bg-red-950/45 px-3 py-2 text-sm text-red-200"
                      >
                        {displayError}
                      </p>
                    )}

                    {clientNotice && (
                      <p className="rounded-md border border-emerald-400/30 bg-emerald-950/35 px-3 py-2 text-sm text-emerald-100">
                        {clientNotice}
                      </p>
                    )}

                    <button
                      className="h-12 w-full rounded-md bg-emerald-500 px-4 text-base font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? "Signing in..." : "Sign in"}
                    </button>

                    <div className="-mt-1">
                      <button
                        type="button"
                        className="text-sm text-slate-300 underline underline-offset-2 hover:text-slate-100"
                        onClick={() => switchMode("forgot")}
                      >
                        Forgot password?
                      </button>
                    </div>
                  </form>
                ) : null}

                {mode === "forgot" ? (
                  <form
                    className="space-y-3"
                    onSubmit={handleForgotPassword}
                    autoComplete="on"
                  >
                    <div className="space-y-2">
                      <label htmlFor={emailId} className="text-sm text-slate-200">
                        Email
                      </label>
                      <input
                        id={emailId}
                        className="h-12 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-base text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        type="email"
                        name="email"
                        placeholder="you@company.com"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    {displayError && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-400/30 bg-red-950/45 px-3 py-2 text-sm text-red-200"
                      >
                        {displayError}
                      </p>
                    )}

                    {clientNotice && (
                      <p className="rounded-md border border-emerald-400/30 bg-emerald-950/35 px-3 py-2 text-sm text-emerald-100">
                        {clientNotice}
                      </p>
                    )}

                    <button
                      className="h-12 w-full rounded-md bg-emerald-500 px-4 text-base font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? "Sending code..." : "Send reset code"}
                    </button>

                    <button
                      type="button"
                      className="w-full text-sm text-slate-300 underline underline-offset-2 hover:text-slate-100"
                      onClick={() => switchMode("signin")}
                    >
                      Back to sign in
                    </button>
                  </form>
                ) : null}

                {mode === "reset" ? (
                  <form
                    className="space-y-3"
                    onSubmit={handleResetPassword}
                    autoComplete="off"
                  >
                    <div className="space-y-2">
                      <label htmlFor={codeId} className="text-sm text-slate-200">
                        Reset code
                      </label>
                      <input
                        id={codeId}
                        className="h-12 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-center text-lg font-semibold tracking-[0.25em] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="------"
                        required
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor={passwordId}
                        className="text-sm text-slate-200"
                      >
                        New password
                      </label>
                      <div className="relative">
                        <input
                          id={passwordId}
                          className="h-12 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 pr-12 text-base text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          type={showPassword ? "text" : "password"}
                          name="newPassword"
                          placeholder="Create a new password"
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-500 bg-slate-800/95 text-slate-100 outline-none transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                        >
                          <EyeIcon className="h-4 w-4" hidden={showPassword} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor={confirmPasswordId}
                        className="text-sm text-slate-200"
                      >
                        Confirm password
                      </label>
                      <div className="relative">
                        <input
                          id={confirmPasswordId}
                          className="h-12 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 pr-12 text-base text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          type={showConfirmPassword ? "text" : "password"}
                          name="confirmNewPassword"
                          placeholder="Repeat your new password"
                          autoComplete="new-password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={
                            showConfirmPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-500 bg-slate-800/95 text-slate-100 outline-none transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                        >
                          <EyeIcon
                            className="h-4 w-4"
                            hidden={showConfirmPassword}
                          />
                        </button>
                      </div>
                    </div>

                    {displayError && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-400/30 bg-red-950/45 px-3 py-2 text-sm text-red-200"
                      >
                        {displayError}
                      </p>
                    )}

                    {clientNotice && (
                      <p className="rounded-md border border-emerald-400/30 bg-emerald-950/35 px-3 py-2 text-sm text-emerald-100">
                        {clientNotice}
                      </p>
                    )}

                    <button
                      className="h-12 w-full rounded-md bg-emerald-500 px-4 text-base font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? "Updating password..." : "Update password"}
                    </button>

                    <button
                      type="button"
                      className="w-full text-sm text-slate-300 underline underline-offset-2 hover:text-slate-100"
                      onClick={() => switchMode("forgot")}
                    >
                      Send a new code
                    </button>
                  </form>
                ) : null}

                {mode === "signup" ? (
                  <form
                    className="space-y-2.5"
                    onSubmit={handleSignup}
                    autoComplete="on"
                  >
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label
                          htmlFor={firstNameId}
                          className="text-sm text-slate-200"
                        >
                          First Name
                        </label>
                        <input
                          id={firstNameId}
                          className="h-9 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          type="text"
                          name="firstName"
                          placeholder="Jane"
                          autoComplete="given-name"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor={lastNameId}
                          className="text-sm text-slate-200"
                        >
                          Last Name
                        </label>
                        <input
                          id={lastNameId}
                          className="h-9 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          type="text"
                          name="lastName"
                          placeholder="Doe"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                        />
                      </div>
                    </div>

                    {role === "property_manager" && !inviteTicket ? (
                      <div className="space-y-1">
                        <label
                          htmlFor={organizationId}
                          className="text-sm text-slate-200"
                        >
                          Organization Name
                        </label>
                        <input
                          id={organizationId}
                          className="h-9 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          type="text"
                          name="organizationName"
                          placeholder="Avon Management"
                          autoComplete="organization"
                          required
                          value={organizationName}
                          onChange={(e) => setOrganizationName(e.target.value)}
                        />
                      </div>
                    ) : null}

                    {!inviteTicket ? (
                      <div className="space-y-1">
                        <label htmlFor={emailId} className="text-sm text-slate-200">
                          Email
                        </label>
                        <input
                          id={emailId}
                          className="h-9 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          type="email"
                          name="email"
                          placeholder="you@company.com"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-1">
                      <label
                        htmlFor={passwordId}
                        className="text-sm text-slate-200"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id={passwordId}
                          className="h-9 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 pr-12 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          type={showPassword ? "text" : "password"}
                          name="password"
                          placeholder="Create a secure password"
                          autoComplete="new-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-500 bg-slate-800/95 text-slate-100 outline-none transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                        >
                          <EyeIcon className="h-4 w-4" hidden={showPassword} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor={confirmPasswordId}
                        className="text-sm text-slate-200"
                      >
                        Confirm password
                      </label>
                      <div className="relative">
                        <input
                          id={confirmPasswordId}
                          className="h-9 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 pr-12 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
                          aria-label={
                            showConfirmPassword ? "Hide password" : "Show password"
                          }
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          className="absolute right-2 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-slate-500 bg-slate-800/95 text-slate-100 outline-none transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                        >
                          <EyeIcon
                            className="h-4 w-4"
                            hidden={showConfirmPassword}
                          />
                        </button>
                      </div>
                    </div>

                    {displayError && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-400/30 bg-red-950/45 px-3 py-2 text-sm text-red-200"
                      >
                        {displayError}
                      </p>
                    )}

                    <div
                      id="clerk-captcha"
                      data-cl-theme="dark"
                      data-cl-size="flexible"
                    />

                    {hasDebugErrors && (
                      <pre className="max-h-44 overflow-auto rounded-md border border-red-400/25 bg-red-950/30 p-2 text-[10px] leading-[1.4] text-red-100">
                        {JSON.stringify(signUpErrors, null, 2)}
                      </pre>
                    )}

                    <button
                      className="h-10 w-full rounded-md bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? "Creating account..." : "Create account"}
                    </button>

                    <button
                      type="button"
                      className="w-full text-sm text-slate-300 underline underline-offset-2 hover:text-slate-100"
                      onClick={() => switchMode("signin")}
                    >
                      Already have an account? Sign in
                    </button>
                  </form>
                ) : null}

                {mode === "verify" ? (
                  <form
                    className="space-y-5"
                    onSubmit={handleVerify}
                    autoComplete="off"
                  >
                    <div className="space-y-2">
                      <label htmlFor={codeId} className="text-sm text-slate-200">
                        Verification code
                      </label>
                      <input
                        id={codeId}
                        className="h-12 w-full rounded-md border border-slate-600 bg-slate-900/80 px-3 text-center text-lg font-semibold tracking-[0.25em] text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="------"
                        required
                        value={verificationCode}
                        onChange={(e) =>
                          setVerificationCode(e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </div>

                    {displayError && (
                      <p
                        role="alert"
                        className="rounded-md border border-red-400/30 bg-red-950/45 px-3 py-2 text-sm text-red-200"
                      >
                        {displayError}
                      </p>
                    )}

                    <button
                      className="h-12 w-full rounded-md bg-emerald-500 px-4 text-base font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                      type="submit"
                      disabled={isLoading}
                    >
                      {isLoading ? "Verifying..." : "Verify & continue"}
                    </button>

                    <button
                      type="button"
                      className="w-full text-sm text-slate-300 underline underline-offset-2 hover:text-slate-100"
                      onClick={() => switchMode("signin")}
                    >
                      Back to sign in
                    </button>
                  </form>
                ) : null}

                <p className="m-0 pt-5 text-[11px] leading-[1.45] text-slate-400">
                  This site is protected by reCAPTCHA and the Google{" "}
                  <a
                    className="text-slate-300 underline underline-offset-2 hover:text-slate-100"
                    href="#"
                  >
                    Privacy Policy
                  </a>
                  ,{" "}
                  <a
                    className="text-slate-300 underline underline-offset-2 hover:text-slate-100"
                    href="#"
                  >
                    Terms of Service
                  </a>{" "}
                  apply.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <AuthPage />;
}
