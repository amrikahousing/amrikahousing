"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PropertyForm } from "./PropertyForm";

function PlusIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function AddPropertyModalButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function close() {
    setOpen(false);
  }

  function handleSuccess() {
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <PlusIcon className="h-4 w-4" />
        Add property
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40" onClick={close} />
          <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Add property</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Fill in the details below. You can always edit them later.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close add property"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>
            <PropertyForm onCancel={close} onSuccess={handleSuccess} surface="modal" />
          </div>
        </div>
      ) : null}
    </>
  );
}
