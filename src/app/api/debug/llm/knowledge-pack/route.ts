import { NextResponse } from "next/server";

import type {
  GlossaryTerm,
  Keyword,
  Section,
  TranscriptBlock,
} from "@/lib/mock-data";
import {
  buildSectionsFromTimestampDirectory,
} from "@/lib/source-adapters/xiaoyuzhou";
import {
  buildGlossaryCandidateBatches,
  diagnoseGlossaryCandidatesFromFullTranscript,
  GlossaryGenerationError,
  generateSummaryKeywordsFromTranscript,
  LlmJsonParseError,
  type KnowledgePackGenerationStage,
} from "@/lib/llm/knowledge-pack-generator";
import { buildGlossaryInventoryFromContent } from "@/lib/llm/glossary-service";
import {
  persistGlossaryTermsForContent,
  previewGlossaryPersistenceForContent,
} from "@/lib/glossary-store";
import {
  MiniMaxRequestError,
  getMiniMaxEndpointHost,
  getMiniMaxModel,
} from "@/lib/llm/minimax-client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const maxDuration = 180;

type StageStatus = "pending" | "running" | "succeeded" | "failed";

type GenerationStageState = {
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  updatedAt?: string;
  errorType?: string;
  errorMessage?: string;
  inputBlockCount?: number;
  inputCharCount?: number;
};

type GenerationMetadata = {
  llmProvider?: string;
  llmModel?: string;
  generatedAt?: string;
  stages?: {
    summaryKeywords?: GenerationStageState;
    sections?: {
      status?: StageStatus;
    };
    glossary?: GenerationStageState;
  };
};

type ContentPayload = Record<string, Json | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toContentPayload(value: Json | null | undefined) {
  if (!value || !isRecord(value)) {
    return {} as ContentPayload;
  }

  return value as ContentPayload;
}

function toGenerationMetadata(payload: ContentPayload) {
  if (!isRecord(payload.generationMetadata)) {
    return null;
  }

  return payload.generationMetadata as unknown as GenerationMetadata;
}

function getSummaryKeywordsStageState(payload: ContentPayload) {
  const generationMetadata = toGenerationMetadata(payload);

  return generationMetadata?.stages?.summaryKeywords ?? null;
}

function getGlossaryStageState(payload: ContentPayload) {
  const generationMetadata = toGenerationMetadata(payload);

  return generationMetadata?.stages?.glossary ?? null;
}

function getExistingKeywords(payload: ContentPayload) {
  if (!Array.isArray(payload.keywords)) {
    return [] as Keyword[];
  }

  return payload.keywords.filter(
    (keyword): keyword is Keyword =>
      isRecord(keyword) &&
      typeof keyword.term === "string" &&
      typeof keyword.explanation === "string" &&
      typeof keyword.context === "string" &&
      typeof keyword.evidenceBlockId === "string",
  );
}

function getExistingGlossaryTerms(payload: ContentPayload) {
  if (!Array.isArray(payload.glossaryTerms)) {
    return [] as GlossaryTerm[];
  }

  return payload.glossaryTerms.filter(
    (term): term is GlossaryTerm =>
      isRecord(term) &&
      typeof term.id === "string" &&
      typeof term.term === "string" &&
      typeof term.definition === "string" &&
      typeof term.contextExample === "string" &&
      typeof term.occurrenceCount === "number" &&
      Array.isArray(term.evidenceBlockIds),
  );
}

function getExistingGeneratedSummary(payload: ContentPayload) {
  return typeof payload.generatedSummary === "string"
    ? payload.generatedSummary.trim()
    : "";
}

function getTranscriptBlocks(payload: ContentPayload) {
  if (!Array.isArray(payload.transcriptBlocks)) {
    return [] as TranscriptBlock[];
  }

  return payload.transcriptBlocks.filter(
    (block): block is TranscriptBlock =>
      isRecord(block) &&
      typeof block.id === "string" &&
      typeof block.time === "string" &&
      typeof block.speaker === "string" &&
      typeof block.text === "string",
  );
}

function getStoredSections(payload: ContentPayload) {
  if (!Array.isArray(payload.sections)) {
    return [] as Section[];
  }

  return payload.sections.filter(
    (section): section is Section =>
      isRecord(section) &&
      typeof section.id === "string" &&
      typeof section.title === "string" &&
      typeof section.summary === "string" &&
      typeof section.order === "number" &&
      typeof section.startBlockId === "string",
  );
}

function getEffectiveSections({
  payload,
  summary,
  transcriptBlocks,
}: {
  payload: ContentPayload;
  summary: string | null;
  transcriptBlocks: TranscriptBlock[];
}) {
  const shownoteSections = buildSectionsFromTimestampDirectory(
    summary ?? "",
    transcriptBlocks,
  );

  if (shownoteSections.length > 0) {
    return shownoteSections;
  }

  return getStoredSections(payload);
}

function buildGenerationMetadata({
  payload,
  model,
  stageKey,
  stageState,
}: {
  payload: ContentPayload;
  model: string;
  stageKey: "summaryKeywords" | "glossary";
  stageState: GenerationStageState;
}) {
  const existingGenerationMetadata = toGenerationMetadata(payload);

  return {
    ...(existingGenerationMetadata ?? {}),
    llmProvider: "minimax",
    llmModel: model,
    generatedAt:
      stageState.status === "succeeded"
        ? stageState.completedAt || stageState.updatedAt
        : existingGenerationMetadata?.generatedAt,
    stages: {
      ...(existingGenerationMetadata?.stages ?? {}),
      [stageKey]: stageState,
    },
  } as Json;
}

function buildStageStateFromSuccess({
  sampledBlocksCount,
  sampledTranscriptChars,
}: {
  sampledBlocksCount: number;
  sampledTranscriptChars: number;
}) {
  const timestamp = new Date().toISOString();

  return {
    status: "succeeded" as const,
    completedAt: timestamp,
    updatedAt: timestamp,
    inputBlockCount: sampledBlocksCount,
    inputCharCount: sampledTranscriptChars,
  };
}

function classifyUnknownGenerationError(error: unknown) {
  if (error instanceof GlossaryGenerationError) {
    return {
      errorType: error.errorType,
      message: error.message.trim(),
    };
  }

  if (error instanceof LlmJsonParseError) {
    return {
      errorType: error.diagnostics.likelyTruncated
        ? "llm_output_truncated"
        : "response_format_error",
      message: error.message.trim(),
    };
  }

  const message =
    error instanceof Error ? error.message.trim() : "MiniMax generation failed.";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("token") &&
    (normalized.includes("too long") ||
      normalized.includes("context") ||
      normalized.includes("length") ||
      normalized.includes("maximum"))
  ) {
    return {
      errorType: "token_limit",
      message: "输入内容超出当前模型限制，已建议进一步缩短 transcript 输入。",
    };
  }

  return {
    errorType: "unknown_error",
    message,
  };
}

function buildFailureStageState({
  errorType,
  message,
  existingStage,
}: {
  errorType: string;
  message: string;
  existingStage: GenerationStageState | null;
}) {
  const timestamp = new Date().toISOString();

  return {
    status: "failed" as const,
    startedAt: existingStage?.startedAt,
    completedAt: timestamp,
    updatedAt: timestamp,
    errorType,
    errorMessage: message,
    inputBlockCount: existingStage?.inputBlockCount,
    inputCharCount: existingStage?.inputCharCount,
  };
}

function buildRunningStageState(existingStage: GenerationStageState | null) {
  const timestamp = new Date().toISOString();

  return {
    status: "running" as const,
    startedAt: existingStage?.startedAt || timestamp,
    updatedAt: timestamp,
    errorType: undefined,
    errorMessage: undefined,
    inputBlockCount: existingStage?.inputBlockCount,
    inputCharCount: existingStage?.inputCharCount,
  };
}

async function readBody(request: Request) {
  try {
    const body = (await request.json()) as {
      contentId?: unknown;
      stage?: unknown;
      dryRun?: unknown;
      force?: unknown;
    };

    const stage =
      body.stage === "glossary_terms" ||
      body.stage === "glossary_candidates"
        ? (body.stage as KnowledgePackGenerationStage)
        : ("summary_keywords" as KnowledgePackGenerationStage);

    return {
      contentId:
        typeof body.contentId === "string" ? body.contentId.trim() : "",
      stage,
      dryRun: body.dryRun !== false,
      force: body.force === true,
    };
  } catch {
    return {
      contentId: "",
      stage: "summary_keywords" as KnowledgePackGenerationStage,
      dryRun: true,
      force: false,
    };
  }
}

// Diagnostics-only sample terms for glossary_candidates auditing.
// They must never affect candidate generation, scoring, filtering, or rescue.
const GLOSSARY_EXPECTED_TERMS = [
  "GitHub Copilot",
  "Opus 4.6",
  "OPUS4.6",
  "OSWorld",
  "OS WORLD",
  "Traction",
  "Sora",
  "张国栋",
  "戴子航",
  "蒸馏",
  "Brian Chesky",
  "GDC大会",
  "GDC 大会",
  "Viral Ruby",
  "Anthropic",
  "OpenAI",
  "DeepSeek",
  "Meta",
  "Devin",
  "Cursor",
];

async function updateGenerationState({
  contentId,
  payload,
  model,
  stageKey,
  stageState,
  generatedSummary,
  keywords,
  glossaryTerms,
}: {
  contentId: string;
  payload: ContentPayload;
  model: string;
  stageKey: "summaryKeywords" | "glossary";
  stageState: GenerationStageState;
  generatedSummary?: string;
  keywords?: Keyword[];
  glossaryTerms?: GlossaryTerm[];
}) {
  const updatedPayload = {
    ...payload,
    ...(typeof generatedSummary === "string" ? { generatedSummary } : {}),
    ...(Array.isArray(keywords) ? { keywords } : {}),
    ...(Array.isArray(glossaryTerms) ? { glossaryTerms } : {}),
    generationMetadata: buildGenerationMetadata({
      payload,
      model,
      stageKey,
      stageState,
    }),
  } as Json;

  const { error } = await supabaseAdmin
    .from("contents")
    .update({
      content_payload: updatedPayload,
    })
    .eq("id", contentId);

  if (error) {
    throw error;
  }
}

async function handleSummaryKeywordsStage({
  content,
  stage,
  dryRun,
  force,
}: {
  content: {
    id: string;
    title: string;
    platform: string;
    summary: string | null;
    content_payload: Json | null;
  };
  stage: KnowledgePackGenerationStage;
  dryRun: boolean;
  force: boolean;
}) {
  const existingPayload = toContentPayload(content.content_payload);
  const transcriptBlocks = getTranscriptBlocks(existingPayload);

  if (transcriptBlocks.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        errorType: "missing_transcript",
        message: "content_payload.transcriptBlocks 为空，无法执行 LLM debug。",
      },
      { status: 400 },
    );
  }

  const existingStage = getSummaryKeywordsStageState(existingPayload);
  const existingGeneratedSummary = getExistingGeneratedSummary(existingPayload);
  const existingKeywords = getExistingKeywords(existingPayload);

  if (!dryRun) {
    if (existingStage?.status === "running") {
      return NextResponse.json(
        {
          ok: false,
          code: "LLM_GENERATION_IN_PROGRESS",
          provider: "minimax",
          stage,
          dryRun,
          wroteToDatabase: false,
          errorType: "generation_in_progress",
          message: "summary_keywords 正在生成中，请稍后再试。",
        },
        { status: 409 },
      );
    }

    if (
      !force &&
      existingStage?.status === "succeeded" &&
      existingGeneratedSummary &&
      existingKeywords.length > 0
    ) {
      return NextResponse.json({
        ok: true,
        code: "LLM_GENERATION_ALREADY_EXISTS",
        contentId: content.id,
        provider: "minimax",
        stage,
        dryRun,
        model: toGenerationMetadata(existingPayload)?.llmModel || getMiniMaxModel(),
        generated: {
          generatedSummary: existingGeneratedSummary,
          keywords: existingKeywords,
        },
        wroteToDatabase: false,
      });
    }

    await updateGenerationState({
      contentId: content.id,
      payload: existingPayload,
      model: getMiniMaxModel(),
      stageKey: "summaryKeywords",
      stageState: buildRunningStageState(existingStage),
    });
  }

  try {
    const generated = await generateSummaryKeywordsFromTranscript({
      title: content.title,
      platform: content.platform,
      summary: content.summary ?? "",
      transcriptBlocks,
    });

    if (!dryRun) {
      await updateGenerationState({
        contentId: content.id,
        payload: existingPayload,
        model: generated.model,
        stageKey: "summaryKeywords",
        stageState: buildStageStateFromSuccess(generated),
        generatedSummary: generated.generatedSummary,
        keywords: generated.normalizedKeywords,
      });
    }

    return NextResponse.json({
      ok: true,
      contentId: content.id,
      provider: "minimax",
      stage,
      dryRun,
      model: generated.model,
      sampledBlockIds: generated.sampledBlockIds,
      sampledBlocksCount: generated.sampledBlocksCount,
      sampledTranscriptChars: generated.sampledTranscriptChars,
      generated: {
        generatedSummary: generated.generatedSummary,
        keywords: generated.keywords,
      },
      wroteToDatabase: !dryRun,
    });
  } catch (generationError) {
    if (!dryRun) {
      const errorDetails =
        generationError instanceof MiniMaxRequestError
          ? {
              errorType: generationError.errorType,
              message: generationError.message,
              model: generationError.model,
            }
          : {
              ...classifyUnknownGenerationError(generationError),
              model: getMiniMaxModel(),
            };

      await updateGenerationState({
        contentId: content.id,
        payload: existingPayload,
        model: errorDetails.model,
        stageKey: "summaryKeywords",
        stageState: buildFailureStageState({
          errorType: errorDetails.errorType,
          message: errorDetails.message,
          existingStage,
        }),
      });
    }

    return buildErrorResponse({
      stage,
      dryRun,
      generationError,
    });
  }
}

async function handleGlossaryTermsStage({
  content,
  stage,
  dryRun,
  force,
}: {
  content: {
    id: string;
    title: string;
    platform: string;
    summary: string | null;
    content_payload: Json | null;
  };
  stage: KnowledgePackGenerationStage;
  dryRun: boolean;
  force: boolean;
}) {
  const existingPayload = toContentPayload(content.content_payload);
  const transcriptBlocks = getTranscriptBlocks(existingPayload);

  if (transcriptBlocks.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        errorType: "missing_transcript",
        message: "content_payload.transcriptBlocks 为空，无法执行 glossary_terms。",
      },
      { status: 400 },
    );
  }

  const existingStage = getGlossaryStageState(existingPayload);
  const existingGeneratedSummary = getExistingGeneratedSummary(existingPayload);
  const existingKeywords = getExistingKeywords(existingPayload);
  const existingGlossaryTerms = getExistingGlossaryTerms(existingPayload);
  const sections = getEffectiveSections({
    payload: existingPayload,
    summary: content.summary,
    transcriptBlocks,
  });

  if (!existingGeneratedSummary || existingKeywords.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        provider: "minimax",
        stage,
        dryRun,
        wroteToDatabase: false,
        errorType: "missing_prerequisites",
        message:
          "glossary_terms 依赖已有 generatedSummary 和 keywords，请先完成 summary_keywords 阶段。",
      },
      { status: 400 },
    );
  }

  if (!dryRun) {
    if (existingStage?.status === "running") {
      return NextResponse.json(
        {
          ok: false,
          code: "LLM_GENERATION_IN_PROGRESS",
          provider: "minimax",
          stage,
          dryRun,
          wroteToDatabase: false,
          errorType: "generation_in_progress",
          message: "glossary_terms 正在生成中，请稍后再试。",
        },
        { status: 409 },
      );
    }

    if (
      !force &&
      existingStage?.status === "succeeded" &&
      existingGlossaryTerms.length > 0
    ) {
      return NextResponse.json({
        ok: true,
        code: "LLM_GENERATION_ALREADY_EXISTS",
        contentId: content.id,
        provider: "minimax",
        stage,
        dryRun,
        model: toGenerationMetadata(existingPayload)?.llmModel || getMiniMaxModel(),
        generated: {
          glossaryTerms: existingGlossaryTerms,
        },
        wroteToDatabase: false,
      });
    }

    await updateGenerationState({
      contentId: content.id,
      payload: existingPayload,
      model: getMiniMaxModel(),
      stageKey: "glossary",
      stageState: buildRunningStageState(existingStage),
    });
  }

  try {
    const generated = await buildGlossaryInventoryFromContent({
      contentId: content.id,
      title: content.title,
      platform: content.platform,
      generatedSummary: existingGeneratedSummary,
      keywords: existingKeywords,
      sections,
      transcriptBlocks,
    });

    const persistence = dryRun
      ? await previewGlossaryPersistenceForContent(content.id, generated.glossaryTerms)
      : await persistGlossaryTermsForContent(content.id, generated.glossaryTerms, {
          dryRun: false,
          writeCompatibilityPayload: true,
        });

    if (!dryRun) {
      await updateGenerationState({
        contentId: content.id,
        payload: existingPayload,
        model: generated.model,
        stageKey: "glossary",
        stageState: buildStageStateFromSuccess(generated),
        glossaryTerms: generated.glossaryTerms,
      });
    }

    return NextResponse.json({
      ok: true,
      contentId: content.id,
      provider: "minimax",
      stage,
      dryRun,
      model: generated.model,
      sampledBlockIds: generated.sampledBlockIds,
      sampledBlocksCount: generated.sampledBlocksCount,
      sampledTranscriptChars: generated.sampledTranscriptChars,
      totalInventoryCount: generated.totalInventoryCount,
      highlightableCount: generated.displayDiagnostics.highlightableCount,
      readyCount: generated.displayDiagnostics.readyCount,
      pendingCount: generated.displayDiagnostics.pendingCount,
      inventoryOnlyCount: generated.displayDiagnostics.inventoryOnlyCount,
      lowConfidenceInventoryCount:
        generated.displayDiagnostics.lowConfidenceInventoryCount,
      preGeneratedCount: generated.preGeneratedCount,
      userAddedCount: generated.displayDiagnostics.userAddedCount,
      displayPolicyUsed: generated.displayDiagnostics.displayPolicyUsed,
      topHighlightableTerms: generated.displayDiagnostics.topHighlightableTerms,
      droppedFromHighlightExamples:
        generated.displayDiagnostics.droppedFromHighlightExamples,
      inventoryOnlyExamples: generated.displayDiagnostics.inventoryOnlyExamples,
      generated: {
        glossaryTerms: persistence.glossaryTerms,
        highlightableGlossaryTerms: generated.highlightableGlossaryTerms,
        readyGlossaryTerms: generated.readyGlossaryTerms,
        pendingGlossaryTerms: generated.pendingGlossaryTerms,
      },
	      glossaryTerms: persistence.glossaryTerms,
	      persistencePreview: persistence.preview,
	      wouldInsert: {
	        glossaryTerms: persistence.preview.glossaryTermInserts,
	        contentGlossaryTerms: persistence.preview.contentGlossaryTermInserts,
	        occurrences: persistence.preview.occurrenceInserts,
	        explanations: persistence.preview.explanationInserts,
	        feedback: persistence.preview.feedbackUpserts,
	      },
	      wouldUpdate: {
	        glossaryTerms: persistence.preview.glossaryTermUpdates,
	        contentGlossaryTerms: persistence.preview.contentGlossaryTermUpdates,
	        explanations: persistence.preview.explanationUpdates,
	      },
	      wroteToDatabase: !dryRun,
	    });
  } catch (generationError) {
    if (!dryRun) {
      const errorDetails =
        generationError instanceof MiniMaxRequestError
          ? {
              errorType: generationError.errorType,
              message: generationError.message,
              model: generationError.model,
            }
          : {
              ...classifyUnknownGenerationError(generationError),
              model: getMiniMaxModel(),
            };

      await updateGenerationState({
        contentId: content.id,
        payload: existingPayload,
        model: errorDetails.model,
        stageKey: "glossary",
        stageState: buildFailureStageState({
          errorType: errorDetails.errorType,
          message: errorDetails.message,
          existingStage,
        }),
      });
    }

    return buildErrorResponse({
      stage,
      dryRun,
      generationError,
    });
  }
}

async function handleGlossaryCandidatesStage({
  content,
  stage,
  dryRun,
}: {
  content: {
    id: string;
    title: string;
    platform: string;
    summary: string | null;
    content_payload: Json | null;
  };
  stage: KnowledgePackGenerationStage;
  dryRun: boolean;
}) {
  const existingPayload = toContentPayload(content.content_payload);
  const transcriptBlocks = getTranscriptBlocks(existingPayload);

  if (transcriptBlocks.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        provider: "minimax",
        stage,
        dryRun,
        wroteToDatabase: false,
        errorType: "missing_transcript",
        message: "content_payload.transcriptBlocks 为空，无法执行 glossary_candidates。",
      },
      { status: 400 },
    );
  }

  const existingKeywords = getExistingKeywords(existingPayload);
  const generatedSummary = getExistingGeneratedSummary(existingPayload);
  const sections = getEffectiveSections({
    payload: existingPayload,
    summary: content.summary,
    transcriptBlocks,
  });
  const diagnostics = diagnoseGlossaryCandidatesFromFullTranscript({
    blocks: transcriptBlocks,
    existingKeywords,
    expectedTerms: GLOSSARY_EXPECTED_TERMS,
    documentContext: {
      title: content.title,
      generatedSummary,
      sections,
      keywords: existingKeywords,
    },
  });
  const batches = buildGlossaryCandidateBatches(diagnostics.candidates);

  return NextResponse.json({
    ok: true,
    contentId: content.id,
    provider: "minimax",
    stage,
    dryRun,
    wroteToDatabase: false,
    totalTranscriptBlocks: diagnostics.totalTranscriptBlocks,
    rawCandidateCount: diagnostics.rawCandidateCount,
    filteredCandidateCount: diagnostics.filteredCandidateCount,
    excludedCount: diagnostics.excludedCount,
    confidenceCounts: diagnostics.confidenceCounts,
    candidates: diagnostics.candidates,
    excludedCandidates: diagnostics.excludedCandidates,
    expectedTermCheck: diagnostics.expectedTermCheck,
    batchCount: batches.length,
    batches: batches.map((batch) => ({
      index: batch.index,
      candidateCount: batch.candidateCount,
      estimatedPromptChars: batch.estimatedPromptChars,
    })),
  });
}

function buildErrorResponse({
  stage,
  dryRun,
  generationError,
}: {
  stage: KnowledgePackGenerationStage;
  dryRun: boolean;
  generationError: unknown;
}) {
  if (generationError instanceof MiniMaxRequestError) {
    return NextResponse.json(
      {
        ok: false,
        provider: generationError.provider,
        stage,
        dryRun,
        wroteToDatabase: false,
        model: generationError.model,
        endpointHost: generationError.endpointHost,
        errorType: generationError.errorType,
        message: generationError.message,
        attempts: generationError.attempts,
      },
      {
        status:
          generationError.status && generationError.status >= 400
            ? generationError.status
            : 500,
      },
    );
  }

  if (generationError instanceof LlmJsonParseError) {
    return NextResponse.json(
      {
        ok: false,
        provider: "minimax",
        stage,
        dryRun,
        wroteToDatabase: false,
        model: getMiniMaxModel(),
        endpointHost: getMiniMaxEndpointHost(),
        errorType: generationError.diagnostics.likelyTruncated
          ? "llm_output_truncated"
          : "response_format_error",
        message: generationError.message,
        parseDiagnostics: generationError.diagnostics,
      },
      { status: 500 },
    );
  }

  if (generationError instanceof GlossaryGenerationError) {
    return NextResponse.json(
      {
        ok: false,
        provider: "minimax",
        stage,
        dryRun,
        wroteToDatabase: false,
        model: getMiniMaxModel(),
        endpointHost: getMiniMaxEndpointHost(),
        errorType: generationError.errorType,
        message: generationError.message,
        repaired: generationError.repaired === true,
        usedToolCall: generationError.rawResponseDiagnostics.usedToolCall,
        toolCallCount: generationError.rawResponseDiagnostics.toolCallCount,
        fallbackToContentParser:
          generationError.rawResponseDiagnostics.fallbackToContentParser,
        parsedOk: generationError.validationDiagnostics?.parsedOk ??
          !generationError.parseDiagnostics,
        validationOk: generationError.validationDiagnostics?.validationOk ?? false,
        rawItemCount: generationError.validationDiagnostics?.rawItemCount ?? 0,
        validItemCount: generationError.validationDiagnostics?.validItemCount ?? 0,
        selectedGlossaryCount:
          generationError.validationDiagnostics?.selectedGlossaryCount ?? 0,
        rawResponseDiagnostics: generationError.rawResponseDiagnostics,
        parseDiagnostics: generationError.parseDiagnostics,
        validationDiagnostics: generationError.validationDiagnostics,
      },
      { status: 500 },
    );
  }

  const errorDetails = classifyUnknownGenerationError(generationError);

  return NextResponse.json(
    {
      ok: false,
      provider: "minimax",
      stage,
      dryRun,
      wroteToDatabase: false,
      model: getMiniMaxModel(),
      endpointHost: getMiniMaxEndpointHost(),
      errorType: errorDetails.errorType,
      message: errorDetails.message,
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  const { contentId, dryRun, stage, force } = await readBody(request);

  if (!contentId) {
    return NextResponse.json(
      {
        ok: false,
        errorType: "invalid_request",
        message: "contentId is required",
      },
      { status: 400 },
    );
  }

  const { data: content, error } = await supabaseAdmin
    .from("contents")
    .select("*")
    .eq("id", contentId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        ok: false,
        errorType: "database_error",
        message: error.message,
      },
      { status: 500 },
    );
  }

  if (!content) {
    return NextResponse.json(
      {
        ok: false,
        errorType: "not_found",
        message: "content not found",
      },
      { status: 404 },
    );
  }

  if (stage === "glossary_terms") {
    return handleGlossaryTermsStage({
      content,
      stage,
      dryRun,
      force,
    });
  }

  if (stage === "glossary_candidates") {
    return handleGlossaryCandidatesStage({
      content,
      stage,
      dryRun,
    });
  }

  return handleSummaryKeywordsStage({
    content,
    stage,
    dryRun,
    force,
  });
}
