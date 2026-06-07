const DOCUSEAL_BASE_URL = "https://api.docuseal.com";

export type DocuSealStatus = "creating" | "pending" | "completed" | "declined" | "expired";

export type DocuSealRecipient = {
  email: string;
  name: string;
  role: string;
};

function apiKey() {
  const key = process.env.DOCUSEAL_API_SECRET || process.env.DOCUSEAL_API_KEY;
  if (!key) throw new Error("DOCUSEAL_API_SECRET is not configured.");
  return key;
}

async function docusealFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers as HeadersInit);
  headers.set("X-Auth-Token", apiKey());
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${DOCUSEAL_BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as Record<string, unknown>).error)
        : text || `DocuSeal request failed with status ${res.status}.`;
    throw new Error(msg);
  }
  return data;
}

export function normalizeDocuSealStatus(status: string | null | undefined): DocuSealStatus {
  switch (status) {
    case "completed": return "completed";
    case "declined": return "declined";
    case "expired": return "expired";
    case "pending":
    case "awaiting":
    case "sent": return "pending";
    default: return "creating";
  }
}

export async function createDocuSealSubmission(input: {
  file: File;
  name: string;
  recipients: DocuSealRecipient[];
}): Promise<{ id: number }> {
  const arrayBuffer = await input.file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return docusealFetch<{ id: number }>("/submissions/pdf", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      send_email: true,
      order: "preserved",
      documents: [{ name: input.name, file: base64 }],
      submitters: input.recipients.map((r) => ({ role: r.role, email: r.email, name: r.name })),
    }),
  });
}

export async function getDocuSealSubmission(submissionId: string): Promise<{ id: number; status: string }> {
  return docusealFetch<{ id: number; status: string }>(`/submissions/${submissionId}`);
}

export async function downloadDocuSealDocument(submissionId: string): Promise<File> {
  const res = await fetch(`${DOCUSEAL_BASE_URL}/submissions/${submissionId}/documents?merge=true`, {
    headers: { "X-Auth-Token": apiKey() },
  });
  if (!res.ok) throw new Error(`Could not download signed DocuSeal document (${res.status}).`);
  return new File([await res.arrayBuffer()], `docuseal-${submissionId}.pdf`, {
    type: res.headers.get("content-type") || "application/pdf",
  });
}
