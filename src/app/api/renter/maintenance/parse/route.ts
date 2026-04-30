import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { isTenantAccessError, requireTenantAccess } from "@/lib/renter-auth";

// Always return partial fields so the client can pre-fill a form even when ready=false
const parseSchema = z.object({
  ready: z.boolean().describe("true if there is enough information to create a complete maintenance request"),
  question: z.string().describe("Single specific follow-up question to ask the tenant. Empty string when ready=true"),
  priority: z.enum(["low", "normal", "high", "emergency"]).describe("Best guess when ready=false"),
  description: z.string().describe("Professional summary of the issue in first person. Best guess when ready=false"),
  category: z.enum(["plumbing", "electrical", "hvac", "appliance", "pest", "security", "general"]).describe("Best guess when ready=false"),
});

export async function POST(request: Request) {
  const ctx = await requireTenantAccess();
  if (isTenantAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "AI parsing is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = (body as Record<string, unknown>).input;
  if (!input || typeof input !== "string" || !input.trim()) {
    return Response.json({ error: "Input is required." }, { status: 400 });
  }

  try {
    const { object } = await generateObject({
      model: anthropic(process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001"),
      schema: parseSchema,
      system:
        "You are a property management assistant. Parse tenant maintenance issue descriptions into structured data. " +
        "Return ready=false whenever: the input is a test, gibberish, a greeting, a question about the system, or too vague to identify an actual maintenance problem. " +
        "Return ready=true only when you can identify a real maintenance issue. " +
        "If you can reasonably infer the issue — even without a room or exact location — return ready=true and do your best. " +
        "Never invent or fabricate a description — if you don't know what the problem is, return ready=false. " +
        "When ready=false, the question must reference what the tenant already said and ask for the specific missing detail. " +
        "Example: if they said 'something is broken', ask 'You mentioned something is broken — what exactly is the issue and where in your unit?' " +
        "Priority rules: 'emergency' = safety hazard or no heat/water; 'high' = urgent repair affecting habitability; " +
        "'normal' = standard maintenance; 'low' = cosmetic or minor. " +
        "Write the description in first person from the tenant's perspective (e.g. 'The heating system in my bedroom is not working'). Keep titles concise.",
      prompt: `Tenant reported: "${input.trim().slice(0, 1000)}"`,
    });

    return Response.json(object);
  } catch (err) {
    console.error("[maintenance/parse]", err);
    return Response.json({ error: "Could not parse the description." }, { status: 502 });
  }
}
