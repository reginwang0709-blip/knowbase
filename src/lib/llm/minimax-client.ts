import "server-only";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string | Array<{ type?: string; text?: string }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export type MiniMaxErrorType =
  | "dns_error"
  | "tls_error"
  | "timeout"
  | "connection_reset"
  | "proxy_error"
  | "auth_error"
  | "rate_limited"
  | "overloaded_error"
  | "http_error"
  | "network_error"
  | "response_format_error"
  | "unknown_fetch_error";

export class MiniMaxRequestError extends Error {
  provider = "minimax" as const;
  model: string;
  endpointHost: string;
  errorType: MiniMaxErrorType;
  attempts: number;
  status?: number;

  constructor({
    message,
    model,
    endpointHost,
    errorType,
    attempts = 1,
    status,
  }: {
    message: string;
    model: string;
    endpointHost: string;
    errorType: MiniMaxErrorType;
    attempts?: number;
    status?: number;
  }) {
    super(message);
    this.name = "MiniMaxRequestError";
    this.model = model;
    this.endpointHost = endpointHost;
    this.errorType = errorType;
    this.attempts = attempts;
    this.status = status;
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getMiniMaxBaseUrl() {
  const configuredBaseUrl =
    process.env.MINIMAX_BASE_URL?.trim().replace(/\/+$/, "") ||
    "https://api.minimaxi.com/v1";

  return configuredBaseUrl.replace(/\/v1(?:\/v1)+$/i, "/v1");
}

export function getMiniMaxModel() {
  return process.env.MINIMAX_MODEL?.trim() || "MiniMax-M2.7";
}

function getMiniMaxApiKey() {
  return requireEnv("MINIMAX_API_KEY");
}

export function hasMiniMaxApiKey() {
  return Boolean(process.env.MINIMAX_API_KEY?.trim());
}

function responseTextFromChoiceContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  return "";
}

function buildErrorMessage(data: ChatCompletionResponse | null, fallback: string) {
  const message = data?.error?.message?.trim();
  const code = data?.error?.code?.trim();

  if (message && code) {
    return `${fallback}（${code}: ${message}）`;
  }

  if (message) {
    return `${fallback}（${message}）`;
  }

  return fallback;
}

export function buildMiniMaxUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${getMiniMaxBaseUrl()}${normalizedPath}`;
}

export function getMiniMaxEndpointHost() {
  try {
    return new URL(buildMiniMaxUrl("/chat/completions")).host;
  } catch {
    return "";
  }
}

function normalizeErrorText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function describeFetchFailure(error: unknown) {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorMessage = error instanceof Error ? normalizeErrorText(error.message) : "";
  const causeMessage =
    error instanceof Error && "cause" in error
      ? normalizeErrorText((error as { cause?: { message?: unknown } }).cause?.message)
      : "";
  const diagnosticText = [errorName, errorMessage, causeMessage]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();

  const errorType: MiniMaxErrorType = diagnosticText.includes("getaddrinfo") ||
    diagnosticText.includes("enotfound") ||
    diagnosticText.includes("dns")
    ? "dns_error"
    : diagnosticText.includes("ssl") ||
        diagnosticText.includes("tls") ||
        diagnosticText.includes("certificate") ||
        diagnosticText.includes("handshake")
      ? "tls_error"
      : diagnosticText.includes("timeout") ||
          diagnosticText.includes("timed out") ||
          diagnosticText.includes("aborterror")
        ? "timeout"
        : diagnosticText.includes("econnreset") ||
            diagnosticText.includes("socket hang up") ||
            diagnosticText.includes("connection reset")
          ? "connection_reset"
          : diagnosticText.includes("proxy") || diagnosticText.includes("tunnel")
            ? "proxy_error"
            : diagnosticText.includes("fetch failed") || diagnosticText.includes("network")
              ? "network_error"
              : "unknown_fetch_error";

  const parts = [`${errorName}: ${errorMessage || "fetch failed"}`];

  if (causeMessage) {
    parts.push(`cause: ${causeMessage}`);
  }

  return {
    errorType,
    message: `MiniMax 请求失败（${errorType}）：${parts.join("; ")}`,
  };
}

export async function createMiniMaxChatCompletion({
  messages,
  temperature = 0.2,
  maxTokens = 2200,
}: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}) {
  const model = getMiniMaxModel();
  const endpointUrl = buildMiniMaxUrl("/chat/completions");
  const endpointHost = getMiniMaxEndpointHost();
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getMiniMaxApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: {
        type: "json_object",
      },
    }),
  }).catch((error) => {
    const failure = describeFetchFailure(error);

    throw new MiniMaxRequestError({
      message: failure.message,
      model,
      endpointHost,
      errorType: failure.errorType,
      attempts: 1,
    });
  });

  const data =
    (await response.json().catch(() => null)) as ChatCompletionResponse | null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new MiniMaxRequestError({
        message:
          "MiniMax 鉴权失败，请检查：API Key 是否属于当前 endpoint 区域；国内 key 应使用 https://api.minimaxi.com/v1，国际 key 应使用 https://api.minimax.io/v1；并确认 Authorization Bearer header 正确。",
        model,
        endpointHost,
        errorType: "auth_error",
        attempts: 1,
        status: response.status,
      });
    }

    if (response.status === 429) {
      throw new MiniMaxRequestError({
        message: "MiniMax 当前限流，请稍后重试。",
        model,
        endpointHost,
        errorType: "rate_limited",
        attempts: 1,
        status: response.status,
      });
    }

    if (response.status === 529) {
      throw new MiniMaxRequestError({
        message: "MiniMax 当前服务拥挤，请稍后重试。",
        model,
        endpointHost,
        errorType: "overloaded_error",
        attempts: 1,
        status: response.status,
      });
    }

    throw new MiniMaxRequestError({
      message: buildErrorMessage(data, `MiniMax 请求失败，HTTP ${response.status}`),
      model,
      endpointHost,
      errorType: "http_error",
      attempts: 1,
      status: response.status,
    });
  }

  const choice = data?.choices?.[0];
  const content = responseTextFromChoiceContent(choice?.message?.content);

  if (!content) {
    throw new MiniMaxRequestError({
      message: "MiniMax 返回成功，但没有可用内容。",
      model,
      endpointHost,
      errorType: "response_format_error",
      attempts: 1,
      status: response.status,
    });
  }

  return {
    model: data?.model || model,
    content,
    usage: data?.usage,
    finishReason: choice?.finish_reason || "",
  };
}
