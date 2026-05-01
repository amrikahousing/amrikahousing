"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardUnit = {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  rentAmount: number | null;
};

type Step = "select-unit" | "upload-lease" | "review" | "confirm" | "done";

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  startDate: string;
  endDate: string;
  rentAmount: string;
  securityDeposit: string;
};

type ScanPhase = {
  label: string;
  progress: number;
};

type DoneActionContext = {
  name: string;
  unit: string;
  email: string;
  testMode: boolean;
};

type AccountLookup =
  | { status: "idle" | "loading" | "new" | "error"; message?: string }
  | {
      status: "existing";
      tenantExists: boolean;
      sharedUserExists: boolean;
      clerkUserExists: boolean;
    };

type LeaseParseResult = {
  error?: string;
  propertyAddress?: string;
  unitNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  startDate?: string;
  endDate?: string;
  rentAmount?: string;
  securityDeposit?: string;
};

type PasswordPromptState = {
  reason: "required" | "incorrect";
  resolve: (password: string | null) => void;
};

const SCAN_PHASES: ScanPhase[] = [
  { label: "Uploading document…", progress: 12 },
  { label: "Scanning pages…", progress: 28 },
  { label: "Detecting document layout…", progress: 44 },
  { label: "Extracting tenant information…", progress: 62 },
  { label: "Extracting lease terms…", progress: 78 },
  { label: "Extracting financial details…", progress: 91 },
  { label: "Finalizing extraction…", progress: 100 },
];

const DONE_ACTIONS: Array<(context: DoneActionContext) => string> = [
  ({ name }) => `Created tenant record for ${name}`,
  ({ unit }) => `Marked Unit ${unit} as occupied`,
  ({ name }) => `Created active lease for ${name}`,
  () => `Created monthly rent payment schedule`,
  ({ email, testMode }) =>
    testMode ? `Skipped invite email to ${email}` : `Sent invite email to ${email}`,
  ({ testMode }) => (testMode ? `Tenant portal access left unchanged` : `Tenant portal access ready`),
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

function UploadIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function FileIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function UserIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BedIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M2 9V5a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v4" />
      <path d="M2 9h20v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9Z" />
      <path d="M10 9V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v1" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const allowLeaseMismatchOverride =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === "development";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function normalizeAddressForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(apartment|apt|unit|#)\s+[a-z0-9-]+\b/g, "")
    .replace(/\b(street)\b/g, "st")
    .replace(/\b(avenue)\b/g, "ave")
    .replace(/\b(road)\b/g, "rd")
    .replace(/\b(drive)\b/g, "dr")
    .replace(/\b(court)\b/g, "ct")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeUnitForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(apartment|apt|unit|#)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not render PDF page."));
      },
      "image/jpeg",
      0.82,
    );
  });
}

class PdfPasswordCancelledError extends Error {
  constructor() {
    super("PDF password entry was cancelled.");
    this.name = "PdfPasswordCancelledError";
  }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: "select-unit", label: "Select unit" },
  { id: "upload-lease", label: "Upload lease" },
  { id: "review", label: "Review details" },
  { id: "confirm", label: "Confirm" },
  { id: "done", label: "Done" },
];

function StepIndicator({ current, unitPreselected }: { current: Step; unitPreselected: boolean }) {
  const visibleSteps = unitPreselected ? STEPS.filter((s) => s.id !== "select-unit") : STEPS;
  const rawIdx = visibleSteps.findIndex((s) => s.id === current);
  const idx = rawIdx >= 0 ? rawIdx : 0;
  return (
    <div className="flex items-center gap-0">
      {visibleSteps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done ? "bg-emerald-600 text-white" : active ? "bg-emerald-600 text-white ring-4 ring-emerald-100" : "bg-slate-100 text-slate-400",
                ].join(" ")}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={["text-xs font-medium", active ? "text-emerald-700" : done ? "text-slate-500" : "text-slate-400"].join(" ")}>
                {s.label}
              </span>
            </div>
            {i < visibleSteps.length - 1 && (
              <div className={["mx-1.5 mb-4 h-0.5 w-8 flex-shrink-0 transition-colors", i < idx ? "bg-emerald-400" : "bg-slate-200"].join(" ")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function OnboardRenterWizard({
  propertyId,
  propertyName,
  propertyAddress,
  vacantUnits,
  initialUnitId,
  onClose,
  onSuccess,
}: {
  propertyId: string;
  propertyName: string;
  propertyAddress: string;
  vacantUnits: WizardUnit[];
  initialUnitId?: string | null;
  onClose: () => void;
  onSuccess: (unitId: string) => void;
}) {
  const { user: currentUser } = useUser();
  const [step, setStep] = useState<Step>(initialUnitId ? "upload-lease" : "select-unit");
  const [selectedUnitId, setSelectedUnitId] = useState<string>(initialUnitId ?? vacantUnits[0]?.id ?? "");

  // Step 2 — lease upload + simulated extraction
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPhaseIdx, setScanPhaseIdx] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const [extractedAddress, setExtractedAddress] = useState<string | null>(null);
  const [extractedUnitNumber, setExtractedUnitNumber] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<PasswordPromptState | null>(null);
  const [pdfPassword, setPdfPassword] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — review form
  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    startDate: "",
    endDate: "",
    rentAmount: "",
    securityDeposit: "",
  });

  // Step 4/5 — submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultEmail, setResultEmail] = useState<string>("");
  const [resultLinked, setResultLinked] = useState(false);
  const [resultTestMode, setResultTestMode] = useState(false);
  const [completedActions, setCompletedActions] = useState(0);
  const [accountLookup, setAccountLookup] = useState<AccountLookup>({ status: "idle" });
  const [testMode, setTestMode] = useState(false);
  const [skipLeaseMismatchValidation, setSkipLeaseMismatchValidation] = useState(false);
  const preMismatchOverrideFormRef = useRef<FormData | null>(null);

  const selectedUnit = vacantUnits.find((u) => u.id === selectedUnitId) ?? null;

  // ── Step 2: simulate scan ──────────────────────────────────────────────────

  async function parseLeaseDocument(nextFile: File, renderedPageImages?: Blob[]) {
    const body = new FormData();
    body.append("propertyId", propertyId);
    body.append("unitId", selectedUnitId);

    if (renderedPageImages?.length) {
      renderedPageImages.forEach((blob, index) => {
        body.append("leasePageImage", blob, `lease-page-${index + 1}.jpg`);
      });
    } else {
      body.append("leaseFile", nextFile);
    }

    const res = await fetch("/api/renters/lease-parse", { method: "POST", body });
    const data = (await res.json()) as LeaseParseResult;
    return { res, data };
  }

  function requestPdfPassword(reason: PasswordPromptState["reason"]) {
    return new Promise<string | null>((resolve) => {
      setPdfPassword("");
      setPasswordPrompt({ reason, resolve });
    });
  }

  async function renderPdfPagesToImages(nextFile: File) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();

    const data = new Uint8Array(await nextFile.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data, stopAtErrors: false });
    loadingTask.onPassword = async (updatePassword: (password: string) => void, reason: number) => {
      const password = await requestPdfPassword(
        reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD ? "incorrect" : "required",
      );
      if (password === null) {
        loadingTask.destroy();
        return;
      }
      updatePassword(password);
    };

    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (err) {
      if ((err as { name?: string }).name === "PasswordException") {
        throw new PdfPasswordCancelledError();
      }
      throw err;
    }
    const pageCount = Math.min(pdf.numPages, 5);
    const images: Blob[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1.5 });
      const scale = initialViewport.width > 1400 ? 1400 / initialViewport.width : 1;
      const viewport = page.getViewport({ scale: 1.5 * scale });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not render PDF page.");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      images.push(await canvasToBlob(canvas));
      page.cleanup();
    }

    await pdf.destroy();
    return images;
  }

  async function startScan(nextFile = file) {
    if (!nextFile) return;
    const unit = vacantUnits.find((u) => u.id === selectedUnitId);
    setScanning(true);
    setScanPhaseIdx(0);
    setScanDone(false);
    setScanError(null);
    setScanNotice(null);

    try {
      let { res, data } = await parseLeaseDocument(nextFile);

      if (!res.ok) {
        const canRenderProtectedPdf =
          nextFile.type === "application/pdf" &&
          (data.error ?? "").toLowerCase().includes("password protected");

        if (canRenderProtectedPdf) {
          setScanNotice("This PDF is protected for AI parsing. Rendering visible pages locally...");
          setScanPhaseIdx(2);
          const renderedPageImages = await renderPdfPagesToImages(nextFile);
          ({ res, data } = await parseLeaseDocument(nextFile, renderedPageImages));
        }

        if (!res.ok) {
          setScanError(data.error ?? "Could not parse this lease document.");
          setScanning(false);
          return;
        }
      }

      setScanPhaseIdx(SCAN_PHASES.length - 1);
      setScanning(false);
      setScanDone(true);
      setScanNotice(null);
      setForm({
        firstName: data.firstName ?? "",
        lastName: data.lastName ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        startDate: data.startDate ?? "",
        endDate: data.endDate ?? "",
        rentAmount: data.rentAmount || (unit?.rentAmount != null ? String(unit.rentAmount) : ""),
        securityDeposit: data.securityDeposit ?? "",
      });
      setExtractedAddress(data.propertyAddress ?? "");
      setExtractedUnitNumber(data.unitNumber ?? "");
      setStep("review");
    } catch (err) {
      setScanError(
        err instanceof PdfPasswordCancelledError
          ? "PDF password entry was cancelled. Upload an unlocked PDF or try again with the password."
          : "Could not parse this lease document.",
      );
      setScanning(false);
    }
  }

  useEffect(() => {
    if (!scanning) return;
    if (scanPhaseIdx >= SCAN_PHASES.length - 2) return;
    const delay = scanPhaseIdx === 0 ? 450 : 650;
    const t = setTimeout(() => setScanPhaseIdx((n) => Math.min(n + 1, SCAN_PHASES.length - 2)), delay);
    return () => clearTimeout(t);
  }, [scanning, scanPhaseIdx]);

  // ── Step 5: animate done checklist ────────────────────────────────────────

  useEffect(() => {
    if (step !== "done") return;
    if (completedActions >= DONE_ACTIONS.length) return;
    const t = setTimeout(() => setCompletedActions((n) => n + 1), 520);
    return () => clearTimeout(t);
  }, [step, completedActions]);

  useEffect(() => {
    const email = form.email.trim().toLowerCase();
    if (step !== "review" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccountLookup({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      setAccountLookup({ status: "loading" });
      try {
        const params = new URLSearchParams({ email, propertyId });
        const res = await fetch(`/api/renters/lookup?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as {
          error?: string;
          tenantExists?: boolean;
          sharedUserExists?: boolean;
          clerkUserExists?: boolean;
        };

        if (!res.ok) {
          setAccountLookup({ status: "error", message: data.error ?? "Could not check this email." });
          return;
        }

        const tenantExists = Boolean(data.tenantExists);
        const sharedUserExists = Boolean(data.sharedUserExists);
        const clerkUserExists = Boolean(data.clerkUserExists);

        setAccountLookup(
          tenantExists || sharedUserExists || clerkUserExists
            ? { status: "existing", tenantExists, sharedUserExists, clerkUserExists }
            : { status: "new" },
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAccountLookup({ status: "error", message: "Could not check this email." });
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [form.email, propertyId, step]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    if (picked) {
      setFile(picked);
      setFileName(picked.name);
      setExtractedAddress(null);
      setExtractedUnitNumber(null);
      setScanError(null);
      setScanNotice(null);
      setSkipLeaseMismatchValidation(false);
      preMismatchOverrideFormRef.current = null;
      startScan(picked);
    }
    e.target.value = "";
  }

  function patchForm(partial: Partial<FormData>) {
    setForm((f) => ({ ...f, ...partial }));
  }

  function setLeaseMismatchOverride(enabled: boolean) {
    setSkipLeaseMismatchValidation(enabled);

    if (enabled) {
      preMismatchOverrideFormRef.current = form;
      const email = currentUser?.primaryEmailAddress?.emailAddress ?? "";
      const firstName = currentUser?.firstName ?? "";
      const lastName = currentUser?.lastName ?? "";
      const nameParts = !firstName && !lastName ? (currentUser?.fullName ?? "").trim().split(/\s+/) : [];

      patchForm({
        firstName: firstName || nameParts[0] || form.firstName,
        lastName: lastName || nameParts.slice(1).join(" ") || form.lastName,
        email: email || form.email,
        phone: "",
      });
      return;
    }

    if (preMismatchOverrideFormRef.current) {
      setForm(preMismatchOverrideFormRef.current);
      preMismatchOverrideFormRef.current = null;
    }
  }

  function submitPdfPassword() {
    if (!passwordPrompt) return;
    const password = pdfPassword;
    const resolve = passwordPrompt.resolve;
    setPasswordPrompt(null);
    setPdfPassword("");
    resolve(password);
  }

  function cancelPdfPassword() {
    if (!passwordPrompt) return;
    const resolve = passwordPrompt.resolve;
    setPasswordPrompt(null);
    setPdfPassword("");
    resolve(null);
  }

  async function submitOnboard() {
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("propertyId", propertyId);
      body.append("unitId", selectedUnitId);
      body.append("firstName", form.firstName.trim());
      body.append("lastName", form.lastName.trim());
      body.append("email", form.email.trim());
      if (form.phone.trim()) body.append("phone", form.phone.trim());
      body.append("startDate", form.startDate);
      if (form.endDate) body.append("endDate", form.endDate);
      body.append("rentAmount", String(Number(form.rentAmount)));
      if (form.securityDeposit) body.append("securityDeposit", String(Number(form.securityDeposit)));
      if (file) body.append("leaseFile", file);
      if (testMode) body.append("testMode", "true");

      const res = await fetch("/api/renters/onboard", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        invited?: string;
        linked?: string;
        skippedInvite?: string;
        testMode?: boolean;
        tenantId?: string;
      };
      if (!res.ok && res.status !== 207) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResultEmail(data.invited ?? data.linked ?? data.skippedInvite ?? form.email.trim());
      setResultLinked(!!data.linked);
      setResultTestMode(!!data.testMode);
      setCompletedActions(0);
      setStep("done");
      onSuccess(selectedUnitId);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render steps ──────────────────────────────────────────────────────────

  function renderSelectUnit() {
    if (vacantUnits.length === 0) {
      return (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <BedIcon className="h-7 w-7 text-slate-400" />
          </div>
          <div>
            <p className="font-semibold text-slate-800">No vacant units</p>
            <p className="mt-1 text-sm text-slate-500">All units at {propertyName} are currently occupied.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Choose which unit you&apos;re onboarding a tenant into. Only vacant units are shown.</p>
        <div className="space-y-2">
          {vacantUnits.map((unit) => {
            const selected = unit.id === selectedUnitId;
            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => setSelectedUnitId(unit.id)}
                className={[
                  "w-full rounded-xl border-2 px-4 py-3.5 text-left transition-all",
                  selected
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
                    : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={["flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold", selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"].join(" ")}>
                      {unit.unitNumber}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">Unit {unit.unitNumber}</p>
                      <p className="text-xs text-slate-500">
                        {unit.bedrooms} bed · {unit.bathrooms} bath
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {unit.rentAmount != null ? (
                      <p className="font-semibold text-slate-800">{fmt(unit.rentAmount)}<span className="text-xs font-normal text-slate-500">/mo</span></p>
                    ) : (
                      <p className="text-xs text-slate-400">Rent TBD</p>
                    )}
                    {selected && <p className="mt-0.5 text-xs font-medium text-emerald-600">Selected</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={!selectedUnitId}
            onClick={() => setStep("upload-lease")}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  function renderUploadLease() {
    const phase = SCAN_PHASES[Math.min(scanPhaseIdx, SCAN_PHASES.length - 1)];
    const progress = scanning ? phase.progress : scanDone ? 100 : 0;

    return (
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          Upload the signed physical lease. The AI will scan it and automatically extract the tenant&apos;s details, lease terms, and financial information.
        </p>

        {/* Drop zone */}
        <div
          className={[
            "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            fileName ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/40",
          ].join(" ")}
          onClick={() => !scanning && fileInputRef.current?.click()}
          style={{ cursor: scanning ? "default" : "pointer" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            onChange={handleFileChange}
          />
          {fileName ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                <FileIcon className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-slate-800">{fileName}</p>
                {scanning && <p className="mt-0.5 text-xs text-slate-500">Extracting automatically…</p>}
                {scanDone && <p className="mt-0.5 text-xs text-emerald-600">Extraction complete</p>}
              </div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
                <UploadIcon className="h-6 w-6 text-slate-400" />
              </div>
              <div>
                <p className="font-medium text-slate-700">Click to upload lease document</p>
                <p className="mt-0.5 text-xs text-slate-400">PDF, JPG, or PNG</p>
              </div>
            </>
          )}
        </div>

        {/* Progress */}
        {(scanning || scanDone) && (
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-700">
                <SparklesIcon className="h-4 w-4 text-emerald-600" />
                <span className="font-medium">
                  {scanDone ? "Extraction complete" : phase.label}
                </span>
              </div>
              <span className="tabular-nums text-xs font-semibold text-emerald-600">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            {scanDone && (
              <div className="mt-1 grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "Renter info", val: "3 fields" },
                  { label: "Lease terms", val: "2 dates" },
                  { label: "Financials", val: "2 fields" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-emerald-50 px-2 py-1.5">
                    <p className="text-xs font-semibold text-emerald-700">{item.val}</p>
                    <p className="text-xs text-emerald-600">{item.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {scanError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {scanError}
          </p>
        )}

        {scanNotice && (
          <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
            {scanNotice}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          {!initialUnitId ? (
            <button type="button" onClick={() => setStep("select-unit")} className="text-sm text-slate-500 hover:text-slate-800">
              ← Back
            </button>
          ) : <div />}
          {!scanDone ? (
            <button
              type="button"
              disabled={!fileName || scanning}
              onClick={() => startScan()}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Extracting…
                </>
              ) : (
                <>
                  <SparklesIcon className="h-4 w-4" />
                  Extract now
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep("review")}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              Review details →
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderReview() {
    const missingExtractedAddress = extractedAddress !== null && !extractedAddress.trim();
    const missingExtractedUnit = extractedUnitNumber !== null && !extractedUnitNumber.trim();
    const addressMismatch = Boolean(
      extractedAddress !== null &&
      extractedAddress.trim() &&
      normalizeAddressForMatch(extractedAddress) !== normalizeAddressForMatch(propertyAddress),
    );
    const unitMismatch = Boolean(
      extractedUnitNumber !== null &&
      extractedUnitNumber.trim() &&
      normalizeUnitForMatch(extractedUnitNumber) !== normalizeUnitForMatch(selectedUnit?.unitNumber ?? ""),
    );
    const leaseValidationBlocked =
      missingExtractedAddress || missingExtractedUnit || addressMismatch || unitMismatch;
    const canSkipLeaseValidation = allowLeaseMismatchOverride && leaseValidationBlocked;
    const blockContinueForLeaseValidation = leaseValidationBlocked && !skipLeaseMismatchValidation;
    const accountNotice =
      accountLookup.status === "loading"
        ? {
            className: "border-slate-200 bg-slate-50 text-slate-700",
            iconClassName: "text-slate-500",
            text: "Checking whether this renter already has an account...",
          }
        : accountLookup.status === "existing"
          ? accountLookup.clerkUserExists
            ? {
                className: "border-emerald-200 bg-emerald-50 text-emerald-800",
                iconClassName: "text-emerald-600",
                text: "Existing renter account found. This lease will be linked to their current login.",
              }
            : accountLookup.tenantExists || accountLookup.sharedUserExists
              ? {
                  className: "border-sky-200 bg-sky-50 text-sky-800",
                  iconClassName: "text-sky-600",
                  text: "Existing renter record found. We will update it and attach this lease.",
                }
              : null
          : accountLookup.status === "new"
            ? {
                className: "border-amber-200 bg-amber-50 text-amber-800",
                iconClassName: "text-amber-600",
                text: "No existing account found for this email. A new renter account will be created when you complete onboarding.",
              }
            : accountLookup.status === "error"
              ? {
                  className: "border-amber-200 bg-amber-50 text-amber-800",
                  iconClassName: "text-amber-600",
                  text: accountLookup.message ?? "Could not check this email. We will verify it when you complete onboarding.",
                }
              : null;

    return (
      <div className="space-y-4">
        {/* Mismatch warning */}
        {leaseValidationBlocked && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <div className="flex items-start gap-2.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="text-xs text-red-800">
                <p className="font-semibold">Lease document can&apos;t be used for this unit</p>
                {missingExtractedAddress && (
                  <p className="mt-1">
                    The lease address could not be read. Upload a clearer document before continuing.
                  </p>
                )}
                {addressMismatch && (
                  <p className="mt-1">
                    Address on lease: <span className="font-medium">{extractedAddress}</span>
                    <br />Expected: <span className="font-medium">{propertyAddress}</span>
                  </p>
                )}
                {missingExtractedUnit && (
                  <p className="mt-1">
                    The lease unit number could not be read. Upload a clearer document before continuing.
                  </p>
                )}
                {unitMismatch && (
                  <p className="mt-1">
                    Unit on lease: <span className="font-medium">{extractedUnitNumber}</span>
                    <br />Expected: <span className="font-medium">Unit {selectedUnit?.unitNumber}</span>
                  </p>
                )}
                <p className="mt-1.5 text-red-700">
                  {canSkipLeaseValidation
                    ? "Non-production override is available below for testing only."
                    : "You cannot continue until the uploaded lease matches the selected property and unit."}
                </p>
              </div>
            </div>
          </div>
        )}

        {canSkipLeaseValidation && (
          <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <input
              type="checkbox"
              checked={skipLeaseMismatchValidation}
              onChange={(e) => setLeaseMismatchOverride(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <span>
              <span className="font-semibold">Skip lease mismatch validation</span>
              <span className="block text-amber-700">
                Non-production testing only. This replaces tenant contact fields with your signed-in account and production users will still be blocked.
              </span>
            </span>
          </label>
        )}

        {accountNotice && (
          <div className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${accountNotice.className}`}>
            <UserIcon className={`mt-0.5 h-4 w-4 shrink-0 ${accountNotice.iconClassName}`} />
            <p className="text-xs">{accountNotice.text}</p>
          </div>
        )}

        <div className="space-y-3">
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant info</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                First name <span className="text-red-500">*</span>
                <input className={inputClass} value={form.firstName} onChange={(e) => patchForm({ firstName: e.target.value })} placeholder="Jordan" />
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Last name <span className="text-red-500">*</span>
                <input className={inputClass} value={form.lastName} onChange={(e) => patchForm({ lastName: e.target.value })} placeholder="Taylor" />
              </label>
            </div>
            <label className="block space-y-1 text-xs font-medium text-slate-700">
              Email <span className="text-red-500">*</span>
              <input className={inputClass} type="email" value={form.email} onChange={(e) => patchForm({ email: e.target.value })} placeholder="jordan@example.com" />
            </label>
            <label className="block space-y-1 text-xs font-medium text-slate-700">
              Phone <span className="text-slate-400 font-normal">(optional)</span>
              <input className={inputClass} type="tel" value={form.phone} onChange={(e) => patchForm({ phone: e.target.value })} placeholder="(555) 000-0000" />
            </label>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lease terms</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Lease start date <span className="text-red-500">*</span>
                <input className={inputClass} type="date" value={form.startDate} onChange={(e) => patchForm({ startDate: e.target.value })} />
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Lease end date <span className="text-slate-400 font-normal">(optional)</span>
                <input className={inputClass} type="date" value={form.endDate} onChange={(e) => patchForm({ endDate: e.target.value })} />
              </label>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Lease will be set to <span className="font-semibold text-slate-800">active</span> immediately. The tenant will have portal access from day one.
            </div>
          </section>

          <section className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financial</p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Monthly rent <span className="text-red-500">*</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input className={inputClass + " pl-7"} type="number" min="0" step="1" value={form.rentAmount} onChange={(e) => patchForm({ rentAmount: e.target.value })} placeholder="2200" />
                </div>
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-700">
                Security deposit <span className="text-slate-400 font-normal">(optional)</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input className={inputClass + " pl-7"} type="number" min="0" step="1" value={form.securityDeposit} onChange={(e) => patchForm({ securityDeposit: e.target.value })} placeholder="3300" />
                </div>
              </label>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={() => setStep("upload-lease")} className="text-sm text-slate-500 hover:text-slate-800">
            ← Back
          </button>
          <button
            type="button"
            disabled={
              blockContinueForLeaseValidation ||
              !form.firstName.trim() ||
              !form.lastName.trim() ||
              !form.email.trim() ||
              !form.startDate ||
              !form.rentAmount
            }
            onClick={() => setStep("confirm")}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  function renderConfirm() {
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const unitNum = selectedUnit?.unitNumber ?? "";
    const actions = [
      `Create a tenant account for ${form.email.trim()}`,
      `Mark Unit ${unitNum} as occupied`,
      `Create an active lease starting ${form.startDate}`,
      `Create monthly rent charges from the lease dates`,
      testMode
        ? `Skip welcome email and Clerk account linking`
        : `Send a welcome & login email to ${form.email.trim()}`,
      testMode ? `Leave existing portal access unchanged` : `Grant immediate tenant portal access`,
    ];

    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            What will happen automatically
          </p>
          <ul className="space-y-2.5">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {i + 1}
                </div>
                {action}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Tenant</p>
            <p className="mt-0.5 font-semibold text-slate-800">{name}</p>
            <p className="text-xs text-slate-500">{form.email.trim()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Unit</p>
            <p className="mt-0.5 font-semibold text-slate-800">Unit {unitNum}</p>
            <p className="text-xs text-slate-500">{fmt(Number(form.rentAmount))}/mo</p>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>
            <span className="font-semibold text-slate-900">Test onboarding, don&apos;t send invite</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Creates the tenant, lease, document, and payment schedule, but skips invite email and Clerk account linking.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={() => setStep("review")} className="text-sm text-slate-500 hover:text-slate-800">
            ← Back
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submitOnboard}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Onboarding…
              </>
            ) : (
              testMode ? "Run test onboarding" : `Onboard ${form.firstName.trim() || "tenant"} now`
            )}
          </button>
        </div>
      </div>
    );
  }

  function renderDone() {
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const unitNum = selectedUnit?.unitNumber ?? "";

    return (
      <div className="space-y-6 py-2">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckIcon className="h-7 w-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{name} is onboarded!</h3>
          <p className="mt-1 text-sm text-slate-500">
            {resultTestMode
              ? `Test onboarding completed for ${resultEmail}. No invite email was sent.`
              : resultLinked
              ? `${resultEmail} already had an account — tenant portal access granted instantly.`
              : `An invite email was sent to ${resultEmail}.`}
          </p>
        </div>

        {/* Animated checklist */}
        <div className="space-y-2">
          {DONE_ACTIONS.map((getLabel, i) => {
            const visible = i < completedActions;
            return (
              <div
                key={i}
                className={[
                  "flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-all duration-300",
                  visible ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-transparent bg-transparent text-transparent",
                ].join(" ")}
              >
                <div className={["flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors", visible ? "bg-emerald-500" : "bg-transparent"].join(" ")}>
                  {visible && <CheckIcon className="h-3 w-3 text-white" />}
                </div>
                {getLabel({ name, unit: unitNum, email: resultEmail, testMode: resultTestMode })}
              </div>
            );
          })}
        </div>

        {/* Time saved */}
        {completedActions >= DONE_ACTIONS.length && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Time saved</p>
                <p className="mt-0.5 text-2xl font-bold text-emerald-800">~45 min</p>
                <p className="text-xs text-emerald-600">vs. manual data entry &amp; email follow-ups</p>
              </div>
              <div className="text-right text-xs text-emerald-700">
                <p className="font-semibold">What {form.firstName.trim()} sees next:</p>
                <p className="mt-0.5">1. Login link in email</p>
                <p>2. Sets up password</p>
                <p>3. Immediate portal access</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700">
            Done
          </button>
        </div>
      </div>
    );
  }

  const stepContent: Record<Step, () => React.ReactNode> = {
    "select-unit": renderSelectUnit,
    "upload-lease": renderUploadLease,
    "review": renderReview,
    "confirm": renderConfirm,
    "done": renderDone,
  };

  const stepTitles: Record<Step, string> = {
    "select-unit": "Select unit",
    "upload-lease": "Upload lease",
    "review": "Review extracted details",
    "confirm": "Ready to onboard",
    "done": "Onboarding complete",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-8">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={step !== "done" ? onClose : undefined} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-100 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Onboard a tenant
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{stepTitles[step]}</h2>
                {initialUnitId && selectedUnit && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Unit {selectedUnit.unitNumber}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">{propertyAddress}</p>
            </div>
            {step !== "done" && (
              <button type="button" onClick={onClose} className="ml-4 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {step !== "done" && (
            <div className="mt-4">
              <StepIndicator current={step} unitPreselected={!!initialUnitId} />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {stepContent[step]()}
        </div>
      </div>
      {passwordPrompt && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <FileIcon className="h-5 w-5 text-amber-600" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">PDF password required</h3>
            <p className="mt-1 text-sm text-slate-500">
              {passwordPrompt.reason === "incorrect"
                ? "That password did not unlock the lease. Try again or cancel."
                : "Enter the PDF password so we can read the visible lease pages locally."}
            </p>
            <label className="mt-4 block space-y-1 text-xs font-medium text-slate-700">
              Password
              <input
                autoFocus
                className={inputClass}
                type="password"
                value={pdfPassword}
                onChange={(e) => setPdfPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pdfPassword) submitPdfPassword();
                  if (e.key === "Escape") cancelPdfPassword();
                }}
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={cancelPdfPassword} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                Cancel
              </button>
              <button
                type="button"
                disabled={!pdfPassword}
                onClick={submitPdfPassword}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
