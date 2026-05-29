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

type Step = "select-unit" | "choose-path" | "upload-lease" | "review" | "preview-lease" | "confirm" | "done";
type LeaseMode = "uploaded" | "generate";

type AdditionalTenant = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  startDate: string;
  endDate: string;
  rentAmount: string;
  securityDeposit: string;
  additionalTenants: AdditionalTenant[];
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
  additionalTenants?: AdditionalTenant[];
  startDate?: string;
  endDate?: string;
  rentAmount?: string;
  securityDeposit?: string;
};

type PasswordPromptState = {
  reason: "required" | "incorrect";
  resolve: (password: string | null) => void;
};

type LeaseTemplate = {
  id: string;
  name: string;
  fileName: string;
  contentType: string;
  blobUrl: string;
  isActive: boolean;
  createdAt: string;
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
  { id: "select-unit",   label: "Select unit"    },
  { id: "choose-path",   label: "Lease path"     },
  { id: "upload-lease",  label: "Upload lease"   },
  { id: "review",        label: "Review details" },
  { id: "preview-lease", label: "Preview lease"  },
  { id: "confirm",       label: "Confirm"        },
  { id: "done",          label: "Done"           },
];

function StepIndicator({ current, unitPreselected, leaseMode }: { current: Step; unitPreselected: boolean; leaseMode: LeaseMode }) {
  const visibleSteps = STEPS.filter((s) => {
    if (unitPreselected && s.id === "select-unit") return false;
    if (leaseMode === "generate" && s.id === "upload-lease") return false;
    if (leaseMode !== "generate" && s.id === "preview-lease") return false;
    return true;
  });
  const rawIdx = visibleSteps.findIndex((s) => s.id === current);
  const idx = rawIdx >= 0 ? rawIdx : 0;
  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {visibleSteps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.id} className="flex min-w-fit items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done ? "bg-emerald-600 text-white" : active ? "bg-emerald-600 text-white ring-4 ring-emerald-100" : "bg-slate-100 text-slate-400",
                ].join(" ")}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={["whitespace-nowrap text-[11px] font-medium sm:text-xs", active ? "text-emerald-700" : done ? "text-slate-500" : "text-slate-400"].join(" ")}>
                {s.label}
              </span>
            </div>
            {i < visibleSteps.length - 1 && (
              <div className={["mx-1.5 mb-4 h-0.5 w-6 flex-shrink-0 transition-colors sm:w-8", i < idx ? "bg-emerald-400" : "bg-slate-200"].join(" ")} />
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
  onSuccess: (unitId: string, options?: { pendingSignature?: boolean }) => void;
}) {
  const { user: currentUser } = useUser();
  const [step, setStep] = useState<Step>(initialUnitId ? "choose-path" : "select-unit");
  const [leaseMode, setLeaseMode] = useState<LeaseMode>("uploaded");
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
    additionalTenants: [],
  });

  // Step 4/5 — submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultEmail, setResultEmail] = useState<string>("");
  const [resultLinked, setResultLinked] = useState(false);
  const [resultTestMode, setResultTestMode] = useState(false);
  const [resultSentForSignature, setResultSentForSignature] = useState(false);
  const [completedActions, setCompletedActions] = useState(0);
  const [accountLookup, setAccountLookup] = useState<AccountLookup>({ status: "idle" });
  const [additionalLookups, setAdditionalLookups] = useState<AccountLookup[]>([]);
  const [testMode, setTestMode] = useState(false);
  const [skipLeaseMismatchValidation, setSkipLeaseMismatchValidation] = useState(false);
  const preMismatchOverrideFormRef = useRef<FormData | null>(null);
  const additionalTenantKeysRef = useRef<string[]>([]);
  const [templates, setTemplates] = useState<LeaseTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [filledLeaseUrl, setFilledLeaseUrl] = useState<string | null>(null);
  const [filledLeaseHtml, setFilledLeaseHtml] = useState<string | null>(null);
  const [fillingLease, setFillingLease] = useState(false);
  const [fillError, setFillError] = useState<string | null>(null);

  const selectedUnit = vacantUnits.find((u) => u.id === selectedUnitId) ?? null;

  async function loadTemplates() {
    setTemplatesLoading(true);
    setTemplateError(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/lease-templates`);
      const data = (await res.json()) as { error?: string; templates?: LeaseTemplate[] };
      if (!res.ok) {
        setTemplateError(data.error ?? "Could not load lease templates.");
        return;
      }
      const nextTemplates = data.templates ?? [];
      setTemplates(nextTemplates);
      setSelectedTemplateId((current) => current || nextTemplates.find((t) => t.isActive)?.id || nextTemplates[0]?.id || "");
    } catch {
      setTemplateError("Could not load lease templates.");
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    if (leaseMode !== "generate") return;
    void loadTemplates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseMode, propertyId]);

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
        additionalTenants: data.additionalTenants ?? [],
      });
      additionalTenantKeysRef.current = (data.additionalTenants ?? []).map(() => crypto.randomUUID());
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

  const additionalEmailKey = form.additionalTenants.map((t) => t.email).join(",");
  useEffect(() => {
    if (step !== "review" || form.additionalTenants.length === 0) {
      setAdditionalLookups([]);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const tenants = form.additionalTenants;

    setAdditionalLookups(
      tenants.map((t) =>
        emailRegex.test(t.email.trim().toLowerCase()) ? { status: "loading" } : { status: "idle" },
      ),
    );

    const controllers = tenants.map(() => new AbortController());

    tenants.forEach(async (tenant, idx) => {
      const email = tenant.email.trim().toLowerCase();
      if (!emailRegex.test(email)) return;
      try {
        const params = new URLSearchParams({ email, propertyId });
        const res = await fetch(`/api/renters/lookup?${params.toString()}`, {
          signal: controllers[idx].signal,
        });
        const data = (await res.json()) as {
          error?: string;
          tenantExists?: boolean;
          sharedUserExists?: boolean;
          clerkUserExists?: boolean;
        };

        if (!res.ok) {
          setAdditionalLookups((prev) => {
            const next = [...prev];
            next[idx] = { status: "error", message: data.error ?? "Could not check this email." };
            return next;
          });
          return;
        }

        const tenantExists = Boolean(data.tenantExists);
        const sharedUserExists = Boolean(data.sharedUserExists);
        const clerkUserExists = Boolean(data.clerkUserExists);

        setAdditionalLookups((prev) => {
          const next = [...prev];
          next[idx] =
            tenantExists || sharedUserExists || clerkUserExists
              ? { status: "existing", tenantExists, sharedUserExists, clerkUserExists }
              : { status: "new" };
          return next;
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setAdditionalLookups((prev) => {
          const next = [...prev];
          next[idx] = { status: "error", message: "Could not check this email." };
          return next;
        });
      }
    });

    return () => controllers.forEach((c) => c.abort());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalEmailKey, form.additionalTenants.length, propertyId, step]);

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

  function patchAdditional(index: number, partial: Partial<AdditionalTenant>) {
    setForm((f) => {
      const next = f.additionalTenants.map((t, i) => (i === index ? { ...t, ...partial } : t));
      return { ...f, additionalTenants: next };
    });
  }

  function addAdditionalTenant() {
    additionalTenantKeysRef.current = [...additionalTenantKeysRef.current, crypto.randomUUID()];
    setForm((f) => ({
      ...f,
      additionalTenants: [...f.additionalTenants, { firstName: "", lastName: "", email: "", phone: "" }],
    }));
  }

  function removeAdditionalTenant(index: number) {
    additionalTenantKeysRef.current = additionalTenantKeysRef.current.filter((_, i) => i !== index);
    setForm((f) => ({
      ...f,
      additionalTenants: f.additionalTenants.filter((_, i) => i !== index),
    }));
  }

  function setLeaseMismatchOverride(enabled: boolean) {
    setSkipLeaseMismatchValidation(enabled);

    if (enabled) {
      preMismatchOverrideFormRef.current = form;
      const email = currentUser?.primaryEmailAddress?.emailAddress ?? "";
      const firstName = currentUser?.firstName ?? "";
      const lastName = currentUser?.lastName ?? "";
      const nameParts = !firstName && !lastName ? (currentUser?.fullName ?? "").trim().split(/\s+/) : [];

      additionalTenantKeysRef.current = [];
      patchForm({
        firstName: firstName || nameParts[0] || form.firstName,
        lastName: lastName || nameParts.slice(1).join(" ") || form.lastName,
        email: email || form.email,
        phone: "",
        additionalTenants: [],
      });
      return;
    }

    if (preMismatchOverrideFormRef.current) {
      additionalTenantKeysRef.current = preMismatchOverrideFormRef.current.additionalTenants.map(() => crypto.randomUUID());
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
      body.append("leaseMode", leaseMode);
      body.append("firstName", form.firstName.trim());
      body.append("lastName", form.lastName.trim());
      body.append("email", form.email.trim());
      if (form.phone.trim()) body.append("phone", form.phone.trim());
      body.append("startDate", form.startDate);
      if (form.endDate) body.append("endDate", form.endDate);
      body.append("rentAmount", String(Number(form.rentAmount)));
      if (form.securityDeposit) body.append("securityDeposit", String(Number(form.securityDeposit)));
      if (leaseMode === "uploaded" && file) body.append("leaseFile", file);
      if (leaseMode === "generate" && selectedTemplateId) body.append("templateId", selectedTemplateId);
      if (form.additionalTenants.length > 0) {
        body.append("additionalTenants", JSON.stringify(form.additionalTenants));
      }
      if (testMode) body.append("testMode", "true");

      const res = await fetch("/api/renters/onboard", { method: "POST", body });
      const data = (await res.json()) as {
        error?: string;
        invited?: string;
        linked?: string;
        skippedInvite?: string;
        testMode?: boolean;
        tenantId?: string;
        sentForSignature?: boolean;
        docusealSubmissionId?: string;
      };
      if (!res.ok && res.status !== 207) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResultEmail(data.invited ?? data.linked ?? data.skippedInvite ?? form.email.trim());
      setResultLinked(!!data.linked);
      setResultTestMode(!!data.testMode);
      setResultSentForSignature(!!data.sentForSignature || leaseMode === "generate");
      setCompletedActions(0);
      setStep("done");
      onSuccess(selectedUnitId, { pendingSignature: !!data.sentForSignature || leaseMode === "generate" });
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
                onClick={() => { setSelectedUnitId(unit.id); setStep("choose-path"); }}
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
      </div>
    );
  }

  function renderChoosePath() {
    const unit = selectedUnit;
    const pathCards = [
      {
        id: "uploaded" as LeaseMode,
        title: "Upload signed lease",
        text: "Use this when the tenant already signed a lease. We will scan it and activate the lease now.",
        icon: <UploadIcon className="h-5 w-5" />,
      },
      {
        id: "generate" as LeaseMode,
        title: "Generate lease for e-sign",
        text: "Enter tenant details, choose a property template, and send the lease through DocuSeal.",
        icon: <SparklesIcon className="h-5 w-5" />,
      },
    ];

    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected unit</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">Unit {unit?.unitNumber}</p>
              <p className="text-sm text-slate-500">
                {unit?.bedrooms} bed · {unit?.bathrooms} bath
              </p>
            </div>
            {unit?.rentAmount != null && (
              <p className="text-sm font-semibold text-slate-800">{fmt(unit.rentAmount)}/mo</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {pathCards.map((card) => {
            const selected = leaseMode === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setLeaseMode(card.id);
                  if (card.id === "generate") {
                    setFile(null);
                    setFileName(null);
                    setScanDone(false);
                    setExtractedAddress(null);
                    setExtractedUnitNumber(null);
                    patchForm({
                      rentAmount: form.rentAmount || (selectedUnit?.rentAmount != null ? String(selectedUnit.rentAmount) : ""),
                    });
                    setStep("review");
                  } else {
                    setStep("upload-lease");
                  }
                }}
                className={[
                  "min-h-[148px] rounded-xl border-2 p-4 text-left transition",
                  selected
                    ? "border-emerald-500 bg-emerald-50 shadow-sm ring-2 ring-emerald-100"
                    : "border-slate-200 bg-white hover:border-emerald-300",
                ].join(" ")}
              >
                <div className={["mb-3 flex h-10 w-10 items-center justify-center rounded-lg", selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"].join(" ")}>
                  {card.icon}
                </div>
                <p className="font-semibold text-slate-900">{card.title}</p>
                <p className="mt-1 text-sm leading-5 text-slate-500">{card.text}</p>
              </button>
            );
          })}
        </div>

        {!initialUnitId && (
          <div className="border-t border-slate-100 pt-2">
            <button type="button" onClick={() => setStep("select-unit")} className="text-sm text-slate-500 hover:text-slate-800">
              ← Back
            </button>
          </div>
        )}
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
          <button type="button" onClick={() => setStep("choose-path")} className="text-sm text-slate-500 hover:text-slate-800">
              ← Back
          </button>
          {!scanDone ? (
            <button
              type="button"
              disabled={!fileName || scanning}
              onClick={() => startScan()}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="h-11 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Review details →
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderReview() {
    const missingExtractedAddress = leaseMode === "uploaded" && extractedAddress !== null && !extractedAddress.trim();
    const missingExtractedUnit = leaseMode === "uploaded" && extractedUnitNumber !== null && !extractedUnitNumber.trim();
    const addressMismatch = Boolean(
      leaseMode === "uploaded" &&
      extractedAddress !== null &&
      extractedAddress.trim() &&
      normalizeAddressForMatch(extractedAddress) !== normalizeAddressForMatch(propertyAddress),
    );
    const unitMismatch = Boolean(
      leaseMode === "uploaded" &&
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
        ? { className: "border-slate-200 bg-slate-50 text-slate-700", iconClassName: "text-slate-500", text: "Checking account…" }
        : accountLookup.status === "existing"
          ? accountLookup.clerkUserExists
            ? { className: "border-emerald-200 bg-emerald-50 text-emerald-800", iconClassName: "text-emerald-600", text: "Existing account — lease will be linked to their current login." }
            : accountLookup.tenantExists || accountLookup.sharedUserExists
              ? { className: "border-sky-200 bg-sky-50 text-sky-800", iconClassName: "text-sky-600", text: "Existing renter record found — will be updated." }
              : null
          : accountLookup.status === "new"
            ? { className: "border-amber-200 bg-amber-50 text-amber-800", iconClassName: "text-amber-600", text: "No existing account — a new renter account will be created." }
            : accountLookup.status === "error"
              ? { className: "border-amber-200 bg-amber-50 text-amber-800", iconClassName: "text-amber-600", text: accountLookup.message ?? "Could not check this email." }
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
                {missingExtractedAddress && <p className="mt-1">The lease address could not be read. Upload a clearer document before continuing.</p>}
                {addressMismatch && <p className="mt-1">Address on lease: <span className="font-medium">{extractedAddress}</span> · Expected: <span className="font-medium">{propertyAddress}</span></p>}
                {missingExtractedUnit && <p className="mt-1">The lease unit number could not be read. Upload a clearer document before continuing.</p>}
                {unitMismatch && <p className="mt-1">Unit on lease: <span className="font-medium">{extractedUnitNumber}</span> · Expected: <span className="font-medium">Unit {selectedUnit?.unitNumber}</span></p>}
                <p className="mt-1 text-red-700">{canSkipLeaseValidation ? "Non-production override available below." : "Upload a matching lease to continue."}</p>
              </div>
            </div>
          </div>
        )}
        {canSkipLeaseValidation && (
          <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <input type="checkbox" checked={skipLeaseMismatchValidation} onChange={(e) => setLeaseMismatchOverride(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
            <span>
              <span className="font-semibold">Skip lease mismatch validation</span>
              <span className="block text-amber-700">
                Non-production testing only. Checking this will replace the primary tenant fields with your signed-in account info. Uncheck to restore the extracted values.
              </span>
            </span>
          </label>
        )}

        {leaseMode === "generate" && !templatesLoading && templates.length === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No lease template uploaded for this property yet. Add one from the property edit screen before sending an e-sign lease.
          </p>
        )}
        {leaseMode === "generate" && templateError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {templateError}
          </p>
        )}

        {/* ── Side-by-side: Primary tenant | Co-tenants ── */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left: Primary tenant */}
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">1</div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Primary Tenant</p>
            </div>
            {accountNotice && (
              <div className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 ${accountNotice.className}`}>
                <UserIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${accountNotice.iconClassName}`} />
                <p className="text-xs">{accountNotice.text}</p>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
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
          </div>

          {/* Right: Co-tenants */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-700">+</div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Co-tenants{form.additionalTenants.length > 0 ? ` (${form.additionalTenants.length})` : ""}
              </p>
            </div>

            {form.additionalTenants.length > 0 && (
              <div className="space-y-2">
                {form.additionalTenants.map((tenant, i) => {
                  const stableKey = additionalTenantKeysRef.current[i] ?? i;
                  const lookup = additionalLookups[i];
                  const cotenantNotice =
                    lookup?.status === "loading"
                      ? { className: "border-slate-200 bg-slate-50 text-slate-700", iconClassName: "text-slate-500", text: "Checking…" }
                      : lookup?.status === "existing"
                        ? lookup.clerkUserExists
                          ? { className: "border-emerald-200 bg-emerald-50 text-emerald-800", iconClassName: "text-emerald-600", text: "Existing account — will be linked." }
                          : { className: "border-sky-200 bg-sky-50 text-sky-800", iconClassName: "text-sky-600", text: "Existing record — will be updated." }
                        : lookup?.status === "new"
                          ? { className: "border-amber-200 bg-amber-50 text-amber-800", iconClassName: "text-amber-600", text: "New account will be created." }
                          : null;
                  return (
                    <div key={stableKey} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-600">Co-tenant {i + 1}</p>
                        <button type="button" onClick={() => removeAdditionalTenant(i)} className="text-xs text-slate-400 hover:text-red-600" aria-label={`Remove co-tenant ${i + 1}`}>
                          Remove
                        </button>
                      </div>
                      {cotenantNotice && (
                        <div className={`flex items-start gap-1.5 rounded-md border px-2 py-1 ${cotenantNotice.className}`}>
                          <UserIcon className={`mt-0.5 h-3 w-3 shrink-0 ${cotenantNotice.iconClassName}`} />
                          <p className="text-xs">{cotenantNotice.text}</p>
                        </div>
                      )}
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        <label className="block space-y-1 text-xs font-medium text-slate-700">
                          First name
                          <input className={inputClass} value={tenant.firstName} onChange={(e) => patchAdditional(i, { firstName: e.target.value })} placeholder="Alex" />
                        </label>
                        <label className="block space-y-1 text-xs font-medium text-slate-700">
                          Last name
                          <input className={inputClass} value={tenant.lastName} onChange={(e) => patchAdditional(i, { lastName: e.target.value })} placeholder="Smith" />
                        </label>
                      </div>
                      <label className="block space-y-1 text-xs font-medium text-slate-700">
                        Email
                        <input className={inputClass} type="email" value={tenant.email} onChange={(e) => patchAdditional(i, { email: e.target.value })} placeholder="alex@example.com" />
                      </label>
                      <label className="block space-y-1 text-xs font-medium text-slate-700">
                        Phone <span className="text-slate-400 font-normal">(optional)</span>
                        <input className={inputClass} type="tel" value={tenant.phone} onChange={(e) => patchAdditional(i, { phone: e.target.value })} placeholder="(555) 000-0000" />
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add button — always at the bottom, never overlapping cards */}
            <button
              type="button"
              onClick={addAdditionalTenant}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-emerald-400 hover:text-emerald-600"
            >
              + Add co-tenant
            </button>
          </div>
        </div>

        {/* ── Lease & Financial (full width, 2-col grid) ── */}
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lease terms</p>
            <label className="block space-y-1 text-xs font-medium text-slate-700">
              Start date <span className="text-red-500">*</span>
              <input className={inputClass} type="date" value={form.startDate} onChange={(e) => patchForm({ startDate: e.target.value })} />
            </label>
            <label className="block space-y-1 text-xs font-medium text-slate-700">
              End date {leaseMode === "generate" ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(optional)</span>}
              <input className={inputClass} type="date" value={form.endDate} onChange={(e) => patchForm({ endDate: e.target.value })} />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financial</p>
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
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setStep(leaseMode === "generate" ? "preview-lease" : "upload-lease")} className="h-11 text-sm text-slate-500 hover:text-slate-800">
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
              !form.rentAmount ||
              (leaseMode === "generate" && (!form.endDate || !selectedTemplateId))
            }
            onClick={async () => {
              if (leaseMode !== "generate") { setStep("confirm"); return; }
              if (filledLeaseUrl) { URL.revokeObjectURL(filledLeaseUrl); }
              setFilledLeaseUrl(null);
              setFilledLeaseHtml(null);
              setFillError(null);
              setFillingLease(true);
              setStep("preview-lease");
              try {
                const res = await fetch("/api/leases/fill-template", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    templateId: selectedTemplateId,
                    propertyId,
                    propertyName,
                    propertyAddress,
                    unitNumber: selectedUnit?.unitNumber ?? "",
                    primaryTenant: { firstName: form.firstName, lastName: form.lastName, email: form.email },
                    additionalTenants: form.additionalTenants.map((t) => ({
                      firstName: t.firstName, lastName: t.lastName, email: t.email,
                    })),
                    startDate: form.startDate,
                    endDate: form.endDate,
                    rentAmount: form.rentAmount,
                    securityDeposit: form.securityDeposit || undefined,
                  }),
                });
                let data: { fileBase64?: string; previewHtml?: string; error?: string } = {};
                try { data = await res.json(); } catch { /* non-JSON body */ }
                if (!res.ok || !data.fileBase64) {
                  throw new Error(data.error ?? `Server error ${res.status} — check template format.`);
                }
                const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
                const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
                setFilledLeaseUrl(url);
                setFilledLeaseHtml(data.previewHtml ?? null);
              } catch (err) {
                setFillError(err instanceof Error ? err.message : "Could not generate lease preview.");
              } finally {
                setFillingLease(false);
              }
            }}
            className="h-11 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  function renderPreviewLease() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Review the filled lease before sending it for e-signature.
        </p>

        {fillingLease ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 py-10 text-sm text-slate-400">
            <svg className="h-6 w-6 animate-spin text-emerald-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span>Generating filled lease… (may take up to 60 s the first time)</span>
          </div>
        ) : fillError ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 py-8 text-sm">
            <p className="font-medium text-red-600">Could not generate lease</p>
            <p className="text-slate-500">{fillError}</p>
          </div>
        ) : filledLeaseHtml ? (
          <>
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                <span className="text-xs font-medium text-slate-500">Lease preview</span>
                <a
                  href={filledLeaseUrl ?? "#"}
                  download="lease-preview.docx"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download .docx
                </a>
              </div>
              <div
                className="lease-preview h-[480px] overflow-y-auto bg-white px-10 py-8 text-sm leading-relaxed text-slate-800"
                dangerouslySetInnerHTML={{ __html: filledLeaseHtml }}
              />
            </div>
            <style>{`
              .lease-preview h1, .lease-preview h2 { font-weight: 700; margin: 1em 0 0.4em; }
              .lease-preview h1 { font-size: 1.15em; text-align: center; }
              .lease-preview h2 { font-size: 1em; }
              .lease-preview p { margin: 0.5em 0; }
              .lease-preview table { width: 100%; border-collapse: collapse; margin: 0.75em 0; }
              .lease-preview td, .lease-preview th { border: 1px solid #e2e8f0; padding: 6px 10px; vertical-align: top; }
              .lease-preview strong, .lease-preview b { font-weight: 600; }
            `}</style>
          </>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <button type="button" onClick={() => setStep("review")} className="text-sm text-slate-500 hover:text-slate-800">
            ← Back
          </button>
          <button
            type="button"
            disabled={fillingLease || !!fillError || !filledLeaseHtml}
            onClick={() => setStep("confirm")}
            className="h-11 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Looks good — continue →
          </button>
        </div>
      </div>
    );
  }

  function renderConfirm() {
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const unitNum = selectedUnit?.unitNumber ?? "";
    const coTenantCount = form.additionalTenants.length;
    const actions =
      leaseMode === "generate"
        ? [
            `Create a pending lease for Unit ${unitNum}`,
            `Use the selected property lease template`,
            `Send DocuSeal e-signature to ${1 + coTenantCount} tenant${coTenantCount > 0 ? "s" : ""} and manager`,
            `Activate the lease only after all signatures are complete`,
            `Create rent charges after signing`,
            testMode ? `Skip welcome email and Clerk account linking` : `Send renter portal invite emails`,
          ]
        : [
            `Create a tenant account for ${form.email.trim()}`,
            ...(coTenantCount > 0 ? [`Create ${coTenantCount} co-tenant account${coTenantCount > 1 ? "s" : ""}`] : []),
            `Mark Unit ${unitNum} as occupied`,
            `Create an active lease starting ${form.startDate}`,
            `Create monthly rent charges from the lease dates`,
            testMode
              ? `Skip welcome email and Clerk account linking`
              : coTenantCount > 0
                ? `Send welcome & login emails to all ${1 + coTenantCount} tenants`
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

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Primary tenant</p>
            <p className="mt-0.5 font-semibold text-slate-800">{name}</p>
            <p className="text-xs text-slate-500">{form.email.trim()}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs text-slate-500">Unit</p>
            <p className="mt-0.5 font-semibold text-slate-800">Unit {unitNum}</p>
            <p className="text-xs text-slate-500">{fmt(Number(form.rentAmount))}/mo</p>
          </div>
        </div>
        {form.additionalTenants.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <p className="mb-2 text-xs text-slate-500">Co-tenants ({form.additionalTenants.length})</p>
            <ul className="space-y-1">
              {form.additionalTenants.map((t, i) => (
                <li key={i} className="flex items-center gap-2 text-slate-700">
                  <span className="font-medium">{[t.firstName, t.lastName].filter(Boolean).join(" ") || "Unnamed"}</span>
                  {t.email && <span className="text-xs text-slate-500">{t.email}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

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
              {leaseMode === "generate"
                ? "Creates the pending lease and sends DocuSeal, but skips invite email and Clerk account linking."
                : "Creates the tenant, lease, document, and payment schedule, but skips invite email and Clerk account linking."}
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
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Onboarding…
              </>
            ) : (
              testMode
                ? "Run test onboarding"
                : leaseMode === "generate"
                  ? "Send lease for e-sign"
                  : `Onboard ${form.firstName.trim() || "tenant"} now`
            )}
          </button>
        </div>
      </div>
    );
  }

  function renderDone() {
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`;
    const unitNum = selectedUnit?.unitNumber ?? "";
    const doneActions =
      resultSentForSignature
        ? [
            `Created tenant record for ${name}`,
            `Created pending lease for Unit ${unitNum}`,
            `Sent DocuSeal lease for e-signature`,
            `Lease will activate after all signatures are complete`,
          ]
        : DONE_ACTIONS.map((getLabel) => getLabel({ name, unit: unitNum, email: resultEmail, testMode: resultTestMode }));

    return (
      <div className="space-y-6 py-2">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckIcon className="h-7 w-7 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{name} is onboarded!</h3>
          <p className="mt-1 text-sm text-slate-500">
            {resultSentForSignature
              ? `A DocuSeal signature request was sent for ${resultEmail}.`
              : resultTestMode
              ? `Test onboarding completed for ${resultEmail}. No invite email was sent.`
              : resultLinked
              ? `${resultEmail} already had an account — tenant portal access granted instantly.`
              : `An invite email was sent to ${resultEmail}.`}
          </p>
        </div>

        {/* Animated checklist */}
        <div className="space-y-2">
          {doneActions.map((label, i) => {
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
                {label}
              </div>
            );
          })}
        </div>

        {/* Time saved */}
        {completedActions >= doneActions.length && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  {resultSentForSignature ? "Next step" : "Time saved"}
                </p>
                <p className="mt-0.5 text-2xl font-bold text-emerald-800">
                  {resultSentForSignature ? "Awaiting signatures" : "~45 min"}
                </p>
                <p className="text-xs text-emerald-600">
                  {resultSentForSignature ? "DocuSeal will notify signers by email." : "vs. manual data entry & email follow-ups"}
                </p>
              </div>
              <div className="text-right text-xs text-emerald-700">
                <p className="font-semibold">What happens next:</p>
                {resultSentForSignature ? (
                  <>
                    <p className="mt-0.5">1. Everyone signs in DocuSeal</p>
                    <p>2. Webhook activates the lease</p>
                    <p>3. Payments are created</p>
                  </>
                ) : (
                  <>
                    <p className="mt-0.5">1. Login link in email</p>
                    <p>2. Sets up password</p>
                    <p>3. Immediate portal access</p>
                  </>
                )}
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
    "choose-path": renderChoosePath,
    "upload-lease": renderUploadLease,
    "review": renderReview,
    "preview-lease": renderPreviewLease,
    "confirm": renderConfirm,
    "done": renderDone,
  };

  const stepTitles: Record<Step, string> = {
    "select-unit": "Select unit",
    "choose-path": "Choose lease path",
    "upload-lease": "Upload lease",
    "review": leaseMode === "generate" ? "Enter lease details" : "Review extracted details",
    "preview-lease": "Preview lease",
    "confirm": leaseMode === "generate" ? "Ready to send" : "Ready to onboard",
    "done": "Onboarding complete",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={step !== "done" ? onClose : undefined} />
      <div className="relative flex w-full flex-col border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-2xl">
        {/* Header */}
        <div className="border-b border-slate-100 px-4 pb-4 pt-5 sm:px-6">
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
              <StepIndicator current={step} unitPreselected={!!initialUnitId} leaseMode={leaseMode} />
            </div>
          )}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" style={{ maxHeight: "calc(100dvh - 190px)" }}>
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
                className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50"
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
