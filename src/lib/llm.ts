// ─── LLM abstraction ─────────────────────────────────────────────────────────
// Locally: routes requests to a running Ollama instance (OLLAMA_BASE_URL).
// Production: falls back to the Anthropic API (ANTHROPIC_API_KEY).
//
// The input format mirrors Anthropic's /v1/messages schema.
// When Ollama is active, the adapter converts it to the OpenAI-compatible
// chat/completions format that Ollama exposes at /v1/chat/completions.

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
        | { type: "document"; source: { type: "base64"; media_type: string; data: string } }
      >;
}

export interface LLMRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: LLMMessage[];
  tools?: unknown[];
  tool_choice?: unknown;
}

function isOllamaEnabled() {
  return !!process.env.OLLAMA_BASE_URL;
}

/** True when at least one LLM backend is configured (Ollama locally or Anthropic in prod). */
export function isLLMAvailable() {
  return isOllamaEnabled() || !!process.env.ANTHROPIC_API_KEY;
}

function ollamaModel() {
  return process.env.OLLAMA_MODEL || "llama3.2";
}

// Reasoning cloud models (e.g. minimax-m3) can take many minutes to return a
// full, non-streamed response. undici's default headers/body timeout (~5 min)
// aborts these with UND_ERR_HEADERS_TIMEOUT, so route Ollama calls through a
// dispatcher with generous limits. Lazily created and cached; falls back to the
// global dispatcher if undici can't be loaded.
type FetchInitWithDispatcher = RequestInit & { dispatcher?: unknown };

let ollamaDispatcherPromise: Promise<unknown> | null = null;
function getOllamaDispatcher(): Promise<unknown> {
  if (!ollamaDispatcherPromise) {
    ollamaDispatcherPromise = import("undici")
      .then(({ Agent }) =>
        new Agent({
          headersTimeout: 15 * 60_000,
          bodyTimeout: 15 * 60_000,
          connectTimeout: 60_000,
        }),
      )
      .catch(() => null);
  }
  return ollamaDispatcherPromise;
}

// fetch() against Ollama with the long-timeout dispatcher and 429-retry logic.
// minimax-m3:cloud has a concurrency limit — back-to-back calls within the same
// session (e.g. extractLeaseSchema's 3 sequential LLM calls) hit the slot queue
// and get a 429 "timed out waiting for a concurrent request slot". We retry up to
// MAX_RETRIES times with exponential back-off before giving up.
const OLLAMA_MAX_RETRIES = 5;
const OLLAMA_RETRY_BASE_MS = 8_000; // 8s, 16s, 32s, 64s, 128s

async function ollamaHttpFetch(url: string, init: FetchInitWithDispatcher): Promise<Response> {
  const dispatcher = await getOllamaDispatcher();
  const fetchInit = (dispatcher ? { ...init, dispatcher } : init) as RequestInit;

  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= OLLAMA_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = OLLAMA_RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`[llm] Ollama 429 — retry ${attempt}/${OLLAMA_MAX_RETRIES} in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
    const res = await fetch(url, fetchInit);
    if (res.status !== 429) return res;
    lastRes = res;
  }
  // All retries exhausted — return the last 429 so the caller can surface the error
  return lastRes!;
}

// Upper bound on extracted PDF text fed to the local model. Mirrors the 16k
// slice the DOCX path uses in the lease-template routes so behaviour matches.
const OLLAMA_PDF_TEXT_LIMIT = 16_000;

// Extract plain text from a base64-encoded PDF so a text-only local model can
// read it. llama3.2 cannot consume base64 documents/images directly, so without
// this the lease content never reaches the model and every field comes back empty.
async function extractPdfText(base64: string): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const bytes = new Uint8Array(Buffer.from(base64, "base64"));
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    return merged.trim().slice(0, OLLAMA_PDF_TEXT_LIMIT);
  } catch (err) {
    console.error("[llm] Ollama PDF text extraction failed:", err);
    return "";
  }
}

// Convert Anthropic-format messages to OpenAI/Ollama chat format.
// PDF document parts are converted to extracted text (llama3.2 is text-only);
// raw image parts are skipped since the local model cannot OCR them.
async function toOllamaMessages(req: LLMRequest): Promise<Array<{ role: string; content: string }>> {
  const msgs: Array<{ role: string; content: string }> = [];

  if (req.system) {
    msgs.push({ role: "system", content: req.system });
  }

  for (const msg of req.messages) {
    if (typeof msg.content === "string") {
      msgs.push({ role: msg.role, content: msg.content });
      continue;
    }

    const parts: string[] = [];
    for (const p of msg.content) {
      if (p.type === "text") {
        parts.push(p.text);
      } else if (
        p.type === "document" &&
        p.source.type === "base64" &&
        p.source.media_type === "application/pdf"
      ) {
        const pdfText = await extractPdfText(p.source.data);
        if (pdfText) {
          parts.push(`--- BEGIN DOCUMENT TEXT ---\n${pdfText}\n--- END DOCUMENT TEXT ---`);
        }
      }
      // image parts: skipped — llama3.2 cannot read images
    }

    const text = parts.filter(Boolean).join("\n\n");
    if (text) msgs.push({ role: msg.role, content: text });
  }

  return msgs;
}

// ── Main fetch ────────────────────────────────────────────────────────────────

export async function llmFetch(req: LLMRequest): Promise<string> {
  if (isOllamaEnabled()) {
    return ollamaFetch(req);
  }
  return anthropicFetch(req);
}

// ── Ollama (local) ────────────────────────────────────────────────────────────

async function ollamaFetch(req: LLMRequest): Promise<string> {
  const base = process.env.OLLAMA_BASE_URL!.replace(/\/$/, "");
  const messages = await toOllamaMessages(req);

  const res = await ollamaHttpFetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Ollama accepts any non-empty bearer token locally
      Authorization: "Bearer ollama",
    },
    body: JSON.stringify({
      model: ollamaModel(),
      messages,
      // NOTE: max_tokens is intentionally omitted. Reasoning models served via
      // Ollama Cloud (e.g. minimax-m3) 500 when a completion cap is set, because
      // their reasoning tokens can't fit the budget. Let the model use its default.
      stream: false,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return json.choices?.[0]?.message?.content ?? "";
}

// ── Anthropic (production) ────────────────────────────────────────────────────

async function anthropicFetch(req: LLMRequest): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
    stop_reason: string;
  };

  if (json.stop_reason === "max_tokens") {
    console.warn("[llm] Hit max_tokens limit — output may be truncated");
  }

  return json.content.find((b) => b.type === "text")?.text ?? "";
}

// ── Tool-use variant ──────────────────────────────────────────────────────────
// Anthropic: uses native tool_use blocks.
// Ollama: converts to OpenAI-compatible tool format (supported since Ollama 0.3+).
// Both paths return a shape that callers can treat as an AnthropicMessageResponse —
// the Ollama path normalises its response into the same {content:[{type:"tool_use",input}]}
// structure so callers need no changes.

export async function llmFetchWithTools(req: LLMRequest): Promise<unknown> {
  if (isOllamaEnabled()) {
    return ollamaFetchWithTools(req);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  return res.json();
}

// ── Ollama tool-use implementation ───────────────────────────────────────────
// Faithful drop-in for the Anthropic tool call: forwards the SAME system prompt,
// user prompt, and tool/schema to Ollama via its OpenAI-compatible function-
// calling API, then normalises the response back into the Anthropic
// {stop_reason, content:[{type:"tool_use", input}]} shape so callers need no
// changes. No bespoke prompt or schema — whatever the routes send to Anthropic
// is exactly what Ollama receives.

type AnthropicToolDef = { name: string; description?: string; input_schema?: unknown };

async function ollamaFetchWithTools(req: LLMRequest): Promise<unknown> {
  const base = process.env.OLLAMA_BASE_URL!.replace(/\/$/, "");
  const messages = await toOllamaMessages(req);

  // Convert Anthropic tools ({name, description, input_schema}) to the
  // OpenAI/Ollama function shape ({type:"function", function:{...parameters}}).
  const anthropicTools = (req.tools as AnthropicToolDef[] | undefined) ?? [];
  const tools = anthropicTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));

  // Mirror Anthropic's forced tool_choice ({type:"tool", name}) in OpenAI format.
  const forced = req.tool_choice as { type?: string; name?: string } | undefined;
  const tool_choice =
    forced?.type === "tool" && forced.name
      ? { type: "function", function: { name: forced.name } }
      : tools.length > 0
        ? "auto"
        : undefined;

  const res = await ollamaHttpFetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
    body: JSON.stringify({
      model: ollamaModel(),
      messages,
      // max_tokens omitted on purpose — see ollamaFetch(): a completion cap makes
      // reasoning cloud models (minimax-m3) 500 on forced tool calls.
      stream: false,
      tools,
      tool_choice,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id?: string;
          function?: { name?: string; arguments?: string | Record<string, unknown> };
        }>;
      };
    }>;
  };

  const message = json.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  const toolName = call?.function?.name ?? anthropicTools[0]?.name ?? "tool";

  let input: unknown = {};
  const rawArgs = call?.function?.arguments;
  if (typeof rawArgs === "string" && rawArgs.trim()) {
    try { input = JSON.parse(rawArgs); } catch { input = {}; }
  } else if (rawArgs && typeof rawArgs === "object") {
    // Some Ollama builds return arguments already parsed as an object.
    input = rawArgs;
  } else if (message?.content) {
    // Fallback: model emitted the JSON as plain content instead of a tool call.
    const match = message.content.match(/\{[\s\S]*\}/);
    if (match) {
      try { input = JSON.parse(match[0]); } catch { input = {}; }
    }
  }

  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: call?.id ?? "ollama-tool", name: toolName, input }],
  };
}
