import { env } from "@/server/config";

// Minimal Anthropic Messages API client over fetch - no SDK dependency (doc 01 stack table).
// Only used by the AI Tutor.

const API_VERSION = "2023-06-01";
const TIMEOUT_MS = 25_000; // route budget is 30 s (doc 03 §9.4)

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** Thrown for any upstream problem; the caller maps it to 502 INTERNAL "TUTOR_UPSTREAM". */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

export function isAnthropicConfigured(): boolean {
  return env().ANTHROPIC_API_KEY.length > 0;
}

export async function chat(opts: {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<ChatResult> {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new UpstreamError("ANTHROPIC_API_KEY not configured");
  const model = env().AI_TUTOR_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${env().ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.3,
        system: opts.system,
        messages: opts.messages,
      }),
    });
  } catch (e) {
    throw new UpstreamError(e instanceof Error ? e.message : "network error");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Body may carry an error message; never surface it to the client verbatim.
    const body = await res.text().catch(() => "");
    throw new UpstreamError(`anthropic ${res.status}: ${body.slice(0, 300)}`, res.status);
  }

  const json = (await res.json().catch(() => null)) as {
    content?: Array<{ type: string; text?: string }>;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;

  const text = (json?.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("\n")
    .trim();
  if (!text) throw new UpstreamError("empty completion");

  return {
    text,
    model: json?.model ?? model,
    inputTokens: json?.usage?.input_tokens ?? 0,
    outputTokens: json?.usage?.output_tokens ?? 0,
  };
}
