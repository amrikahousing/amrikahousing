import { requireOrgAccess, isAccessError } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

export type AiParsedUnit = {
  unit_number: string;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  rent_amount?: number;
  status?: "vacant" | "occupied" | "maintenance";
};

export type AiParsedProperty = {
  name: string;
  type: "rental" | "association";
  address: string;
  city: string;
  state: string;
  zip: string;
  description?: string;
  units?: AiParsedUnit[];
};

const client = new Anthropic();

const propertiesTool: Anthropic.Tool = {
  name: "extract_properties",
  description: "Extract a structured list of real estate properties from user-provided text.",
  input_schema: {
    type: "object" as const,
    properties: {
      properties: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Property name. Derive from address if not given, e.g. '123 Main St'." },
            type: { type: "string", enum: ["rental", "association"], description: "Property type. Default to 'rental'." },
            address: { type: "string", description: "Street address only, no city/state/zip." },
            city: { type: "string" },
            state: { type: "string", description: "2-letter US state code, uppercase." },
            zip: { type: "string", description: "5-digit US zip code." },
            description: { type: "string", description: "Optional notes about the property." },
            units: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  unit_number: { type: "string" },
                  bedrooms: { type: "number" },
                  bathrooms: { type: "number" },
                  square_feet: { type: "number" },
                  rent_amount: { type: "number" },
                  status: { type: "string", enum: ["vacant", "occupied", "maintenance"] },
                },
                required: ["unit_number"],
              },
            },
          },
          required: ["name", "type", "address", "city", "state", "zip"],
        },
      },
    },
    required: ["properties"],
  },
};

export type AiImportContext = {
  name?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export async function POST(request: Request) {
  const ctx = await requireOrgAccess();
  if (isAccessError(ctx)) {
    return Response.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: { prompt: string; context?: AiImportContext };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prompt, context } = body;
  if (!prompt?.trim()) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > 10000) {
    return Response.json({ error: "Prompt too long (max 10,000 characters)" }, { status: 400 });
  }

  const contextLines: string[] = [];
  if (context?.name) contextLines.push(`Property name: ${context.name}`);
  if (context?.type) contextLines.push(`Property type: ${context.type}`);
  if (context?.address) contextLines.push(`Address: ${context.address}`);
  if (context?.city) contextLines.push(`City: ${context.city}`);
  if (context?.state) contextLines.push(`State: ${context.state}`);
  if (context?.zip) contextLines.push(`Zip: ${context.zip}`);

  const userMessage = contextLines.length
    ? `Property context:\n${contextLines.join("\n")}\n\nUnit/property data:\n${prompt}`
    : prompt;

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    tools: [propertiesTool],
    tool_choice: { type: "any" },
    system:
      "You are a property data extraction assistant. Extract all real estate properties from the user's text.\n" +
      "Rules:\n" +
      "- If property context is provided (name, address, city, state, zip), apply it to all extracted units and create ONE property.\n" +
      "- If the input is a unit list without property details, group all units into ONE property and use empty strings for unknown address fields.\n" +
      "- If the input describes multiple distinct properties, extract each as a separate property.\n" +
      "- Bedroom type shorthands: 's' or 'studio' = 0 bedrooms, '1br'/'1BR' = 1 bedroom, '2br'/'2BR' = 2 bedrooms, etc.\n" +
      "- Strip '$' and ',' from rent amounts and parse as a number.\n" +
      "- State must be a 2-letter US code, uppercase. Zip must be 5 digits.\n" +
      "- If no unit info is given for a property, omit the units array — a single unit will be auto-created.\n" +
      "- Use empty string for required fields you cannot determine (address, city, state, zip). Do NOT guess or invent addresses.",
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) {
    return Response.json({ error: "Could not parse properties from your description. Please try again with more detail." }, { status: 422 });
  }

  const { properties } = toolUse.input as { properties: AiParsedProperty[] };

  if (!properties?.length) {
    return Response.json({ error: "No properties found in your description." }, { status: 422 });
  }

  return Response.json({ properties });
}
