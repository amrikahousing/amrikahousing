import { requireOrgAccess, isAccessError } from "@/lib/auth";
import type { AiImportContext, AiParsedProperty } from "@/lib/ai-import-types";
import { PROPERTY_TYPE_OPTIONS, normalizePropertyType } from "@/lib/property-types";

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

type AnthropicMessageResponse = {
  content: AnthropicContentBlock[];
};

const supportedPropertyTypeValues = PROPERTY_TYPE_OPTIONS.map((option) => option.value);

const propertiesTool: AnthropicTool = {
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
            type: {
              type: "string",
              enum: supportedPropertyTypeValues,
              description: "Property type. Use one of the supported property type values.",
            },
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

export async function POST(request: Request) {
  try {
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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "AI import is not configured." }, { status: 500 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
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
          `- Property type must be one of: ${supportedPropertyTypeValues.join(", ")}.\n` +
          "- If no unit info is given for a property, omit the units array - a single unit will be auto-created.\n" +
          "- Use empty string for required fields you cannot determine (address, city, state, zip). Do NOT guess or invent addresses.",
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("Anthropic API error:", response.status, errText);
      return Response.json({ error: "AI import failed. Please try again." }, { status: 502 });
    }

    let message: AnthropicMessageResponse;
    try {
      message = (await response.json()) as AnthropicMessageResponse;
    } catch (err) {
      console.error("Failed to parse Anthropic response:", err);
      return Response.json({ error: "AI import failed. Please try again." }, { status: 502 });
    }

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (!toolUse) {
      return Response.json({ error: "Could not parse properties from your description. Please try again with more detail." }, { status: 422 });
    }

    const { properties } = toolUse.input as { properties: AiParsedProperty[] };

    if (!properties?.length) {
      return Response.json({ error: "No properties found in your description." }, { status: 422 });
    }

    return Response.json({
      properties: properties.map((property) => ({
        ...property,
        type: normalizePropertyType(property.type),
      })),
    });
  } catch (err) {
    console.error("Unhandled error in ai-import route:", err);
    return Response.json({ error: "AI import failed. Please try again." }, { status: 500 });
  }
}
