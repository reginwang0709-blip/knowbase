import { NextResponse } from "next/server";

import type { GlossaryTerm } from "@/lib/mock-data";
import { normalizeGlossaryTermRecord, normalizeGlossaryTermText } from "@/lib/glossary-terms";
import {
  classifyGlossaryGenerationFailure,
  safeLogGlossaryEvent,
  safeLogGlossaryGenerationRun,
} from "@/lib/glossary-logging";
import {
  getContentGlossaryContext,
  getContentRowById,
  updateGlossaryTermsForContent,
} from "@/lib/glossary-store";
import { explainSingleGlossaryTerm } from "@/lib/llm/glossary-service";
import { getMiniMaxModel } from "@/lib/llm/minimax-client";
import { supabaseAdmin } from "@/lib/supabase/admin";

const explainInFlight = new Map<string, Promise<unknown>>();

type ExplainRequestBody = {
  contentId?: unknown;
  termId?: unknown;
  contentGlossaryTermId?: unknown;
  term?: unknown;
  force?: unknown;
  requestSource?: unknown;
};

function findGlossaryTerm({
  glossaryTerms,
  termId,
  term,
}: {
  glossaryTerms: GlossaryTerm[];
  termId: string;
  term: string;
}) {
  const normalizedTerm = normalizeGlossaryTermText(term);

  return glossaryTerms.find(
    (item) =>
      item.id === termId ||
      item.termId === termId ||
      (normalizedTerm && item.normalizedTerm === normalizedTerm),
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ExplainRequestBody | null;
  const contentId = typeof body?.contentId === "string" ? body.contentId.trim() : "";
  const termId = typeof body?.termId === "string" ? body.termId.trim() : "";
  const contentGlossaryTermId =
    typeof body?.contentGlossaryTermId === "string"
      ? body.contentGlossaryTermId.trim()
      : "";
  const term = typeof body?.term === "string" ? body.term.trim() : "";
  const force = body?.force === true;
  const requestSource =
    body?.requestSource === "retry_button" ? "retry_button" : "generate_button";

  if (!contentId || (!termId && !contentGlossaryTermId) || !term) {
    return NextResponse.json(
      {
        ok: false,
        message: "contentId、termId/contentGlossaryTermId、term 均为必填。",
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
  const targetTerm = findGlossaryTerm({
    glossaryTerms: context.glossaryTerms,
    termId: contentGlossaryTermId || termId,
    term,
  });

  if (!targetTerm) {
    return NextResponse.json(
      {
        ok: false,
        message: "术语不存在。",
      },
      { status: 404 },
    );
  }

  if (!force && targetTerm.highlightEnabled === false) {
    return NextResponse.json(
      {
        ok: false,
        contentId,
        termId,
        explanationStatus: targetTerm.explanationStatus ?? "pending",
        glossaryTerm: targetTerm,
        wroteToDatabase: false,
        message: "该术语当前仅保留在 inventory 中，不会由普通悬停触发解释生成。",
      },
      { status: 409 },
    );
  }

  if (targetTerm.explanationStatus === "ready" && targetTerm.explanation) {
    return NextResponse.json({
      ok: true,
      contentId,
      termId,
      explanationStatus: "ready",
      glossaryTerm: targetTerm,
      explanation: targetTerm.explanation,
      wroteToDatabase: false,
    });
  }

  const inflightKey = `${contentId}:${targetTerm.contentGlossaryTermId || targetTerm.id}`;
  const existingPromise = explainInFlight.get(inflightKey);

  if (existingPromise) {
    const glossaryTerm = (await existingPromise) as ReturnType<typeof normalizeGlossaryTermRecord>;
    return NextResponse.json({
      ok: true,
      contentId,
      termId,
      explanationStatus: glossaryTerm.explanationStatus,
      glossaryTerm,
      explanation: glossaryTerm.explanation,
      wroteToDatabase: false,
    });
  }

  const generatingTerm = normalizeGlossaryTermRecord(
    {
      ...targetTerm,
      explanationStatus: "generating",
    },
    contentId,
  );
  if (targetTerm.contentGlossaryTermId) {
    const { error } = await supabaseAdmin
      .from("content_glossary_terms")
      .update({
        explanation_status: "generating",
        updated_at: new Date().toISOString(),
      })
      .eq("id", targetTerm.contentGlossaryTermId);

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
    await updateGlossaryTermsForContent(
      contentId,
      context.glossaryTerms.map((item) => (item.id === targetTerm.id ? generatingTerm : item)),
    );
  }

  const explainPromise = (async () => {
    const generationStartedAt = Date.now();
    const generationType = requestSource === "retry_button" ? "retry" : "manual_generate";
    const triggerSource = requestSource === "retry_button" ? "retry" : "user_click";
    void safeLogGlossaryEvent({
      contentId,
      glossaryTermId: targetTerm.termId || null,
      contentGlossaryTermId: targetTerm.contentGlossaryTermId || targetTerm.id,
      eventType: "explanation_requested",
      eventSource: "user",
      metadata: {
        term: targetTerm.term,
        normalizedTerm: targetTerm.normalizedTerm,
        previousExplanationStatus: targetTerm.explanationStatus ?? "pending",
        requestSource,
        triggerSource,
      },
    });

    try {
      const explainedTerm = await explainSingleGlossaryTerm({
        title: context.title,
        platform: context.platform,
        generatedSummary: context.generatedSummary,
        keywords: context.keywords,
        sections: context.sections,
        term: generatingTerm,
      });

      if (targetTerm.contentGlossaryTermId) {
        const now = new Date().toISOString();
        const { error: updateContentGlossaryTermError } = await supabaseAdmin
          .from("content_glossary_terms")
          .update({
            explanation_status: "ready",
            updated_at: now,
          })
          .eq("id", targetTerm.contentGlossaryTermId);

        if (updateContentGlossaryTermError) {
          throw updateContentGlossaryTermError;
        }

        const { data: existingExplanation, error: lookupExplanationError } = await supabaseAdmin
          .from("glossary_explanations")
          .select("id")
          .eq("content_glossary_term_id", targetTerm.contentGlossaryTermId)
          .maybeSingle();

        if (lookupExplanationError) {
          throw lookupExplanationError;
        }

        const explanationPayload = {
          definition: explainedTerm.explanation?.definition || explainedTerm.definition || "",
          why_it_matters: explainedTerm.explanation?.whyItMatters || "",
          evidence: explainedTerm.explanation?.evidence || explainedTerm.contextExample || "",
          aliases: explainedTerm.explanation?.aliases || explainedTerm.aliases || [],
          provider: "minimax",
          model: getMiniMaxModel(),
          generated_at: now,
          updated_at: now,
        };

        if (existingExplanation) {
          const { error } = await supabaseAdmin
            .from("glossary_explanations")
            .update(explanationPayload)
            .eq("id", existingExplanation.id);

          if (error) {
            throw error;
          }
        } else {
          const { error } = await supabaseAdmin
            .from("glossary_explanations")
            .insert({
              content_glossary_term_id: targetTerm.contentGlossaryTermId,
              ...explanationPayload,
            });

          if (error) {
            throw error;
          }
        }
      } else {
        await updateGlossaryTermsForContent(
          contentId,
          context.glossaryTerms.map((item) => (item.id === targetTerm.id ? explainedTerm : item)),
        );
      }

      void safeLogGlossaryGenerationRun({
        contentId,
        contentGlossaryTermId: targetTerm.contentGlossaryTermId || targetTerm.id,
        glossaryTermId: targetTerm.termId || null,
        generationType,
        triggerSource,
        provider: "minimax",
        model: getMiniMaxModel(),
        promptVersion: "single_term_explain_v1",
        status: "success",
        durationMs: Date.now() - generationStartedAt,
        metadata: {
          term: targetTerm.term,
          normalizedTerm: targetTerm.normalizedTerm,
          explanationStatus: "ready",
          previousExplanationStatus: targetTerm.explanationStatus ?? "pending",
          nextExplanationStatus: "ready",
          requestSource,
        },
      });
      void safeLogGlossaryEvent({
        contentId,
        glossaryTermId: targetTerm.termId || null,
        contentGlossaryTermId: targetTerm.contentGlossaryTermId || targetTerm.id,
        eventType: "explanation_generated",
        eventSource: "llm",
        metadata: {
          term: targetTerm.term,
          normalizedTerm: targetTerm.normalizedTerm,
          previousExplanationStatus: targetTerm.explanationStatus ?? "pending",
          nextExplanationStatus: "ready",
          requestSource,
          provider: "minimax",
          model: getMiniMaxModel(),
          durationMs: Date.now() - generationStartedAt,
        },
      });

      return explainedTerm;
    } catch (error) {
      const failedTerm = normalizeGlossaryTermRecord(
        {
          ...generatingTerm,
          explanationStatus: "failed",
          explanation: null,
        },
        contentId,
      );

      if (targetTerm.contentGlossaryTermId) {
        await supabaseAdmin
          .from("content_glossary_terms")
          .update({
            explanation_status: "failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetTerm.contentGlossaryTermId);
      } else {
        await updateGlossaryTermsForContent(
          contentId,
          context.glossaryTerms.map((item) => (item.id === targetTerm.id ? failedTerm : item)),
        );
      }

      const failure = classifyGlossaryGenerationFailure(error);
      void safeLogGlossaryGenerationRun({
        contentId,
        contentGlossaryTermId: targetTerm.contentGlossaryTermId || targetTerm.id,
        glossaryTermId: targetTerm.termId || null,
        generationType,
        triggerSource,
        provider: "minimax",
        model: getMiniMaxModel(),
        promptVersion: "single_term_explain_v1",
        status: failure.status,
        errorType: failure.errorType,
        errorMessage: failure.errorMessage,
        durationMs: Date.now() - generationStartedAt,
        metadata: {
          term: targetTerm.term,
          normalizedTerm: targetTerm.normalizedTerm,
          previousExplanationStatus: targetTerm.explanationStatus ?? "pending",
          nextExplanationStatus: "failed",
          requestSource,
        },
      });
      void safeLogGlossaryEvent({
        contentId,
        glossaryTermId: targetTerm.termId || null,
        contentGlossaryTermId: targetTerm.contentGlossaryTermId || targetTerm.id,
        eventType: "explanation_failed",
        eventSource: "llm",
        metadata: {
          term: targetTerm.term,
          normalizedTerm: targetTerm.normalizedTerm,
          previousExplanationStatus: targetTerm.explanationStatus ?? "pending",
          nextExplanationStatus: "failed",
          requestSource,
          provider: "minimax",
          model: getMiniMaxModel(),
          durationMs: Date.now() - generationStartedAt,
          errorType: failure.errorType,
          errorMessage: failure.errorMessage,
        },
      });

      return failedTerm;
    } finally {
      explainInFlight.delete(inflightKey);
    }
  })();

  explainInFlight.set(inflightKey, explainPromise);
  const glossaryTerm = (await explainPromise) as ReturnType<typeof normalizeGlossaryTermRecord>;

  return NextResponse.json({
    ok: glossaryTerm.explanationStatus === "ready",
    contentId,
    termId,
    explanationStatus: glossaryTerm.explanationStatus,
    glossaryTerm,
    explanation: glossaryTerm.explanation,
    wroteToDatabase: true,
  });
}
