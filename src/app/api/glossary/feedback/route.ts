import { NextResponse } from "next/server";

import { safeLogGlossaryEvent } from "@/lib/glossary-logging";
import { normalizeGlossaryTermRecord } from "@/lib/glossary-terms";
import {
  getContentGlossaryContext,
  getContentRowById,
  updateGlossaryTermsForContent,
} from "@/lib/glossary-store";
import { supabaseAdmin } from "@/lib/supabase/admin";

type GlossaryFeedbackRequestBody = {
  contentId?: unknown;
  termId?: unknown;
  contentGlossaryTermId?: unknown;
  action?: unknown;
  feedback?: unknown;
};

type GlossaryFeedbackAction =
  | "starred"
  | "hidden"
  | "incorrect"
  | "not_needed"
  | "none"
  | "star"
  | "hide";

function isFeedbackAction(value: unknown): value is GlossaryFeedbackAction {
  return (
    value === "starred" ||
    value === "hidden" ||
    value === "incorrect" ||
    value === "not_needed" ||
    value === "none" ||
    value === "star" ||
    value === "hide"
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as GlossaryFeedbackRequestBody | null;
  const contentId = typeof body?.contentId === "string" ? body.contentId.trim() : "";
  const termId = typeof body?.termId === "string" ? body.termId.trim() : "";
  const contentGlossaryTermId =
    typeof body?.contentGlossaryTermId === "string"
      ? body.contentGlossaryTermId.trim()
      : "";
  const action = body?.feedback ?? body?.action;

  if (!contentId || (!termId && !contentGlossaryTermId) || !isFeedbackAction(action)) {
    return NextResponse.json(
      {
        ok: false,
        message: "contentId、contentGlossaryTermId/termId、feedback 均为必填。",
      },
      { status: 400 },
    );
  }

  const content = await getContentRowById(contentId);

  if (!content) {
    return NextResponse.json(
      {
        ok: false,
        message: "内容不存在。",
      },
      { status: 404 },
    );
  }

  const context = await getContentGlossaryContext(content);
  const existingTerm = context.glossaryTerms.find(
    (term) =>
      term.id === contentGlossaryTermId ||
      term.contentGlossaryTermId === contentGlossaryTermId ||
      term.id === termId ||
      term.termId === termId,
  );

  if (!existingTerm) {
    return NextResponse.json(
      {
        ok: false,
        message: "术语不存在。",
      },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const normalizedAction =
    action === "star" ? "starred" : action === "hide" ? "hidden" : action;
  const previousFeedback = existingTerm.userFeedback || (existingTerm.isStarred ? "starred" : "none");
  const updatedTerm = normalizeGlossaryTermRecord(
    {
      ...existingTerm,
      ...(normalizedAction === "starred"
        ? {
            isStarred: true,
            userFeedback: "starred" as const,
            highlightEnabled: true,
            displayStatus: "highlighted" as const,
            displayReason: "user_starred",
            hiddenReason: undefined,
          }
        : normalizedAction === "hidden"
          ? {
              isStarred: false,
              userFeedback: "hidden" as const,
              highlightEnabled: false,
              displayStatus: "hidden" as const,
              hiddenReason: "user_feedback",
            }
          : normalizedAction === "incorrect"
            ? {
              userFeedback: "incorrect" as const,
              highlightEnabled: false,
              displayStatus: "hidden" as const,
              hiddenReason: "incorrect_feedback",
            }
            : normalizedAction === "not_needed"
              ? {
                  isStarred: false,
                  userFeedback: "not_needed" as const,
                  highlightEnabled: false,
                  displayStatus: "inventory_only" as const,
                  hiddenReason: "not_needed",
                }
              : {
                  isStarred: false,
                  userFeedback: "none" as const,
                }),
      feedbackUpdatedAt: now,
      updatedAt: now,
    },
    contentId,
  );

  if (existingTerm.contentGlossaryTermId && existingTerm.termId) {
    const { error: updateContentGlossaryTermError } = await supabaseAdmin
      .from("content_glossary_terms")
      .update({
        highlight_enabled: updatedTerm.highlightEnabled === true,
        display_status: updatedTerm.displayStatus || "inventory_only",
        display_reason: updatedTerm.displayReason || null,
        hidden_reason: updatedTerm.hiddenReason || null,
        updated_at: now,
      })
      .eq("id", existingTerm.contentGlossaryTermId);

    if (updateContentGlossaryTermError) {
      return NextResponse.json(
        {
          ok: false,
          message: updateContentGlossaryTermError.message,
        },
        { status: 500 },
      );
    }

    const { data: existingFeedback, error: feedbackLookupError } = await supabaseAdmin
      .from("user_glossary_feedback")
      .select("id")
      .eq("content_glossary_term_id", existingTerm.contentGlossaryTermId)
      .eq("user_id", "local-user")
      .maybeSingle();

    if (feedbackLookupError) {
      return NextResponse.json(
        {
          ok: false,
          message: feedbackLookupError.message,
        },
        { status: 500 },
      );
    }

    if (existingFeedback) {
      const { error } = await supabaseAdmin
        .from("user_glossary_feedback")
        .update({
          feedback_type: normalizedAction,
          updated_at: now,
        })
        .eq("id", existingFeedback.id);

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            message: error.message,
          },
          { status: 500 },
        );
      }
    } else {
      const { error } = await supabaseAdmin
        .from("user_glossary_feedback")
        .insert({
          user_id: "local-user",
          content_id: contentId,
          glossary_term_id: existingTerm.termId,
          content_glossary_term_id: existingTerm.contentGlossaryTermId,
          feedback_type: normalizedAction,
          user_note: null,
          updated_at: now,
        });

      if (error) {
        return NextResponse.json(
          {
            ok: false,
            message: error.message,
          },
          { status: 500 },
        );
      }
    }
  } else {
    await updateGlossaryTermsForContent(
      contentId,
      context.glossaryTerms.map((term) => (term.id === existingTerm.id ? updatedTerm : term)),
    );
  }

  const eventType =
    normalizedAction === "starred"
      ? "term_starred"
      : normalizedAction === "hidden"
        ? "term_hidden"
        : normalizedAction === "incorrect"
          ? "term_marked_incorrect"
          : normalizedAction === "not_needed"
            ? "term_marked_not_needed"
            : previousFeedback === "starred"
              ? "term_unstarred"
              : "term_feedback_cleared";
  void safeLogGlossaryEvent({
    contentId,
    glossaryTermId: existingTerm.termId || null,
    contentGlossaryTermId: existingTerm.contentGlossaryTermId || existingTerm.id,
    eventType,
    eventSource: "user",
    metadata: {
      term: existingTerm.term,
      normalizedTerm: existingTerm.normalizedTerm,
      previousFeedback,
      nextFeedback: normalizedAction,
      previousDisplayStatus: existingTerm.displayStatus || "inventory_only",
      nextDisplayStatus: updatedTerm.displayStatus || "inventory_only",
      previousHighlightEnabled: existingTerm.highlightEnabled === true,
      nextHighlightEnabled: updatedTerm.highlightEnabled === true,
    },
  });

  return NextResponse.json({
    ok: true,
    contentId,
    termId: existingTerm.termId || termId,
    contentGlossaryTermId: existingTerm.contentGlossaryTermId || existingTerm.id,
    action: normalizedAction,
    glossaryTerm: updatedTerm,
    wroteToDatabase: true,
  });
}
