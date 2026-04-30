"use client";

import type { ReactNode } from "react";
import { Toaster, toast } from "sonner";

type ToastTone = "success" | "error" | "info";

type ToastInput = {
  title?: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number | null;
};

type ToastOptions = Omit<ToastInput, "message" | "tone">;

const CARD = "border-slate-700/80 bg-[linear-gradient(135deg,#1e293b,#334155_58%,#1e293b)] shadow-[0_20px_55px_rgba(30,41,59,0.30)]";

const toneStyles: Record<ToastTone, { wrapper: string; badge: string; message: string; dismiss: string }> = {
  success: {
    wrapper: CARD,
    badge: "bg-emerald-500 text-white",
    message: "text-slate-200",
    dismiss: "text-slate-300/80 hover:text-white",
  },
  error: {
    wrapper: CARD,
    badge: "bg-rose-500 text-white",
    message: "text-slate-200",
    dismiss: "text-slate-300/80 hover:text-white",
  },
  info: {
    wrapper: CARD,
    badge: "bg-sky-500 text-white",
    message: "text-slate-200",
    dismiss: "text-slate-300/80 hover:text-white",
  },
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  if (tone === "success") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (tone === "error") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function ToastCard({
  id,
  title,
  message,
  tone,
}: {
  id: string | number;
  title?: string;
  message: string;
  tone: ToastTone;
}) {
  const styles = toneStyles[tone];

  return (
    <div
      className={[
        "pointer-events-auto flex w-[min(360px,calc(100vw-1.5rem))] items-start gap-3 rounded-2xl border px-4 py-3 text-white",
        styles.wrapper,
      ].join(" ")}
    >
      <div className={["mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", styles.badge].join(" ")}>
        <ToneIcon tone={tone} />
      </div>
      <div className="min-w-0 flex-1">
        {title ? (
          <p className="text-sm font-semibold tracking-tight text-white">{title}</p>
        ) : null}
        <p className={["mt-0.5 text-sm leading-6", styles.message].join(" ")}>{message}</p>
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(id)}
        className={["rounded-lg bg-white/12 p-1.5 transition hover:bg-white/22", styles.dismiss].join(" ")}
        aria-label="Dismiss notification"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}

function emitToast({
  title,
  message,
  tone = "info",
  durationMs,
}: ToastInput) {
  return toast.custom(
    (toastInstance) => (
      <ToastCard
        id={toastInstance}
        title={title}
        message={message}
        tone={tone}
      />
    ),
    {
      duration: durationMs === null ? Infinity : (durationMs ?? undefined),
    },
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        theme="light"
        expand={false}
        visibleToasts={4}
        gap={10}
        offset={12}
        toastOptions={{ duration: 3500 }}
      />
    </>
  );
}

export function useToast() {
  return {
    show: (input: ToastInput) => emitToast(input),
    dismiss: (id: string | number) => toast.dismiss(id),
    success: (message: string, options?: ToastOptions) =>
      emitToast({ ...options, message, tone: "success" }),
    error: (message: string, options?: ToastOptions) =>
      emitToast({ ...options, message, tone: "error" }),
    info: (message: string, options?: ToastOptions) =>
      emitToast({ ...options, message, tone: "info" }),
  };
}
