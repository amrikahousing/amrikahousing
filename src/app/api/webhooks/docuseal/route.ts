import { syncDocuSealSignatureRequest } from "@/lib/lease-signatures";

function extractSubmissionId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null;
  const submission =
    data?.submission && typeof data.submission === "object"
      ? (data.submission as Record<string, unknown>)
      : null;

  const id = submission?.id ?? data?.id ?? record.id ?? null;
  return id != null ? String(id) : null;
}

function extractStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : null;
  const submission =
    data?.submission && typeof data.submission === "object"
      ? (data.submission as Record<string, unknown>)
      : null;

  const eventType = typeof record.event_type === "string" ? record.event_type : null;
  if (eventType === "submission.completed" || submission?.status === "completed") return "completed";
  if (eventType === "form.declined") return "declined";
  if (typeof data?.status === "string") return data.status;
  return null;
}

export async function POST(request: Request) {
  const configuredSecret = process.env.DOCUSEAL_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-docuseal-webhook-secret");
  if (configuredSecret && providedSecret !== configuredSecret) {
    return Response.json({ error: "Invalid webhook secret." }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const submissionId = extractSubmissionId(payload);
  if (!submissionId) {
    return Response.json({ error: "Missing DocuSeal submission id." }, { status: 400 });
  }

  const result = await syncDocuSealSignatureRequest(submissionId, extractStatus(payload));
  return Response.json(result);
}
