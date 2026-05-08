import "server-only";

import { supabaseAdmin } from "./supabase/admin";

export type GlossaryEventType =
  | "term_hovered"
  | "term_clicked"
  | "tooltip_opened"
  | "tooltip_closed"
  | "explanation_requested"
  | "explanation_generated"
  | "explanation_failed"
  | "term_starred"
  | "term_unstarred"
  | "term_hidden"
  | "term_marked_incorrect"
  | "term_marked_not_needed"
  | "term_feedback_cleared"
  | "term_added_by_user"
  | "term_removed_by_user"
  | "term_restored";

export type GlossaryEventSource = "user" | "system" | "llm";

export type GlossaryGenerationType =
  | "pre_generate"
  | "hover_generate"
  | "manual_generate"
  | "user_added_generate"
  | "repair"
  | "retry";

export type GlossaryGenerationTriggerSource =
  | "system"
  | "user_hover"
  | "user_click"
  | "user_added"
  | "retry";

export type GlossaryGenerationStatus = "success" | "failed" | "timeout" | "skipped";

type SafeJsonValue =
  | string
  | number
  | boolean
  | null
  | SafeJsonValue[]
  | { [key: string]: SafeJsonValue | undefined };

type LogGlossaryEventInput = {
  userId?: string | null;
  contentId: string;
  glossaryTermId?: string | null;
  contentGlossaryTermId?: string | null;
  eventType: GlossaryEventType;
  eventSource?: GlossaryEventSource;
  metadata?: Record<string, SafeJsonValue | undefined>;
};

type LogGlossaryGenerationRunInput = {
  contentId: string;
  contentGlossaryTermId?: string | null;
  glossaryTermId?: string | null;
  generationType: GlossaryGenerationType;
  triggerSource: GlossaryGenerationTriggerSource;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  status: GlossaryGenerationStatus;
  errorType?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  metadata?: Record<string, SafeJsonValue | undefined>;
};

const DEFAULT_LOCAL_USER_ID = "local-user";

function clampNonNegativeInteger(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.round(value));
}

export async function logGlossaryEvent({
  userId = DEFAULT_LOCAL_USER_ID,
  contentId,
  glossaryTermId = null,
  contentGlossaryTermId = null,
  eventType,
  eventSource = "user",
  metadata = {},
}: LogGlossaryEventInput) {
  const { error } = await supabaseAdmin.from("glossary_events").insert({
    user_id: userId,
    content_id: contentId,
    glossary_term_id: glossaryTermId,
    content_glossary_term_id: contentGlossaryTermId,
    event_type: eventType,
    event_source: eventSource,
    metadata,
  });

  if (error) {
    throw error;
  }
}

export async function safeLogGlossaryEvent(input: LogGlossaryEventInput) {
  try {
    await logGlossaryEvent(input);
  } catch (error) {
    console.error("[glossary-events] failed to write event", {
      contentId: input.contentId,
      eventType: input.eventType,
      contentGlossaryTermId: input.contentGlossaryTermId,
      glossaryTermId: input.glossaryTermId,
      error,
    });
  }
}

export async function logGlossaryGenerationRun({
  contentId,
  contentGlossaryTermId = null,
  glossaryTermId = null,
  generationType,
  triggerSource,
  provider = null,
  model = null,
  promptVersion = null,
  status,
  errorType = null,
  errorMessage = null,
  durationMs = null,
  inputTokens = null,
  outputTokens = null,
  metadata = {},
}: LogGlossaryGenerationRunInput) {
  const { error } = await supabaseAdmin.from("glossary_generation_runs").insert({
    content_id: contentId,
    content_glossary_term_id: contentGlossaryTermId,
    glossary_term_id: glossaryTermId,
    generation_type: generationType,
    trigger_source: triggerSource,
    provider,
    model,
    prompt_version: promptVersion,
    status,
    error_type: errorType,
    error_message: errorMessage,
    duration_ms: clampNonNegativeInteger(durationMs),
    input_tokens: clampNonNegativeInteger(inputTokens),
    output_tokens: clampNonNegativeInteger(outputTokens),
    metadata,
  });

  if (error) {
    throw error;
  }
}

export async function safeLogGlossaryGenerationRun(
  input: LogGlossaryGenerationRunInput,
) {
  try {
    await logGlossaryGenerationRun(input);
  } catch (error) {
    console.error("[glossary-generation-runs] failed to write generation run", {
      contentId: input.contentId,
      generationType: input.generationType,
      triggerSource: input.triggerSource,
      status: input.status,
      contentGlossaryTermId: input.contentGlossaryTermId,
      glossaryTermId: input.glossaryTermId,
      error,
    });
  }
}

export function classifyGlossaryGenerationFailure(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : String(error ?? "");
  const normalized = message.toLowerCase();
  const explicitErrorType =
    error && typeof error === "object" && "errorType" in error
      ? String((error as { errorType?: unknown }).errorType ?? "").trim()
      : "";

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("time out") ||
    normalized.includes("abort") ||
    explicitErrorType === "timeout" ||
    explicitErrorType === "llm_timeout"
  ) {
    return {
      status: "timeout" as const,
      errorType: explicitErrorType || "timeout",
      errorMessage: message || "Generation timed out.",
    };
  }

  return {
    status: "failed" as const,
    errorType: explicitErrorType || "generation_failed",
    errorMessage: message || "Generation failed.",
  };
}
