import { NextResponse } from "next/server";

import type { Json } from "@/lib/supabase/types";
import type {
  GlossaryEventSource,
  GlossaryEventType,
} from "@/lib/glossary-logging";
import { safeLogGlossaryEvent } from "@/lib/glossary-logging";

type GlossaryEventRequestBody = {
  contentId?: unknown;
  glossaryTermId?: unknown;
  contentGlossaryTermId?: unknown;
  eventType?: unknown;
  eventSource?: unknown;
  metadata?: unknown;
};

const eventTypes = new Set<GlossaryEventType>([
  "term_hovered",
  "term_clicked",
  "tooltip_opened",
  "tooltip_closed",
  "explanation_requested",
  "explanation_generated",
  "explanation_failed",
  "term_starred",
  "term_unstarred",
  "term_hidden",
  "term_marked_incorrect",
  "term_marked_not_needed",
  "term_feedback_cleared",
  "term_added_by_user",
  "term_removed_by_user",
  "term_restored",
]);

const eventSources = new Set<GlossaryEventSource>(["user", "system", "llm"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeJsonValue(value: unknown): Json | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toSafeJsonValue(item))
      .filter((item): item is Json => item !== undefined);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        const nextValue = toSafeJsonValue(item);
        return nextValue === undefined ? [] : [[key, nextValue]];
      }),
    );
  }

  return undefined;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as GlossaryEventRequestBody | null;
  const contentId = typeof body?.contentId === "string" ? body.contentId.trim() : "";
  const glossaryTermId =
    typeof body?.glossaryTermId === "string" ? body.glossaryTermId.trim() : "";
  const contentGlossaryTermId =
    typeof body?.contentGlossaryTermId === "string"
      ? body.contentGlossaryTermId.trim()
      : "";
  const eventType =
    typeof body?.eventType === "string" && eventTypes.has(body.eventType as GlossaryEventType)
      ? (body.eventType as GlossaryEventType)
      : null;
  const eventSource =
    typeof body?.eventSource === "string" &&
    eventSources.has(body.eventSource as GlossaryEventSource)
      ? (body.eventSource as GlossaryEventSource)
      : "user";
  const metadata = isRecord(body?.metadata)
    ? (toSafeJsonValue(body.metadata) as Record<string, Json | undefined>)
    : {};

  if (!contentId || !eventType) {
    return NextResponse.json(
      {
        ok: false,
        message: "contentId 和 eventType 为必填。",
      },
      { status: 400 },
    );
  }

  void safeLogGlossaryEvent({
    contentId,
    glossaryTermId: glossaryTermId || null,
    contentGlossaryTermId: contentGlossaryTermId || null,
    eventType,
    eventSource,
    metadata,
  });

  return NextResponse.json({
    ok: true,
  });
}
