import { NextResponse } from "next/server";

import {
  generateSummaryKeywordsFromTranscript,
  type GeneratedSummaryKeywords,
  type KnowledgePackGenerationStage,
} from "@/lib/llm/knowledge-pack-generator";
import {
  MiniMaxRequestError,
  getMiniMaxEndpointHost,
  getMiniMaxModel,
} from "@/lib/llm/minimax-client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Keyword, TranscriptBlock } from "@/lib/mock-data";
import type { Json } from "@/lib/supabase/types";

type StageStatus = "pending" | "running" | "succeeded" | "failed";

type SummaryKeywordsStageState = {
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
    summaryKeywords?: SummaryKeywordsStageState;
    sections?: {
      status?: StageStatus;
    };
    glossary?: {
      status?: StageStatus;
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toContentPayload(value: Json | null | undefined) {
  if (!value || !isRecord(value)) {
    return {} as Record<string, Json | undefined>;
  }

  return value as Record<string, Json | undefined>;
}

function toGenerationMetadata(payload: Record<string, Json | undefined>) {
  if (!isRecord(payload.generationMetadata)) {
    return null;
  }

  return payload.generationMetadata as unknown as GenerationMetadata;
}

function getSummaryKeywordsStageState(payload: Record<string, Json | undefined>) {
  const generationMetadata = toGenerationMetadata(payload);

  if (!generationMetadata?.stages?.summaryKeywords) {
    return null;
  }

  return generationMetadata.stages.summaryKeywords;
}

function getExistingKeywords(payload: Record<string, Json | undefined>) {
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

function getExistingGeneratedSummary(payload: Record<string, Json | undefined>) {
  return typeof payload.generatedSummary === "string"
    ? payload.generatedSummary.trim()
    : "";
}

function buildGenerationMetadata({
  payload,
  model,
  stageState,
}: {
  payload: Record<string, Json | undefined>;
  model: string;
  stageState: SummaryKeywordsStageState;
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
      summaryKeywords: stageState,
    },
  } as Json;
}

function buildStageStateFromSuccess(generated: GeneratedSummaryKeywords) {
  const timestamp = new Date().toISOString();

  return {
    status: "succeeded" as const,
    completedAt: timestamp,
    updatedAt: timestamp,
    inputBlockCount: generated.sampledBlocksCount,
    inputCharCount: generated.sampledTranscriptChars,
  };
}

function classifyUnknownGenerationError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "MiniMax generation failed.";
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
  existingStage: SummaryKeywordsStageState | null;
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

function buildRunningStageState(existingStage: SummaryKeywordsStageState | null) {
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

    return {
      contentId:
        typeof body.contentId === "string" ? body.contentId.trim() : "",
      stage:
        body.stage === "summary_keywords"
          ? ("summary_keywords" as KnowledgePackGenerationStage)
          : ("summary_keywords" as KnowledgePackGenerationStage),
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

function getTranscriptBlocks(payload: Record<string, Json | undefined>) {
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

async function updateGenerationState({
  contentId,
  payload,
  model,
  stageState,
  generatedSummary,
  keywords,
}: {
  contentId: string;
  payload: Record<string, Json | undefined>;
  model: string;
  stageState: SummaryKeywordsStageState;
  generatedSummary?: string;
  keywords?: Keyword[];
}) {
  const updatedPayload = {
    ...payload,
    ...(typeof generatedSummary === "string"
      ? { generatedSummary }
      : {}),
    ...(Array.isArray(keywords) ? { keywords } : {}),
    generationMetadata: buildGenerationMetadata({
      payload,
      model,
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
      stageState: buildRunningStageState(existingStage),
    });
  }

  try {
    const generated = await generateSummaryKeywordsFromTranscript({
      title: content.title,
      platform: content.platform,
      summary: content.summary,
      transcriptBlocks,
    });

    if (!dryRun) {
      await updateGenerationState({
        contentId: content.id,
        payload: existingPayload,
        model: generated.model,
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
        stageState: buildFailureStageState({
          errorType: errorDetails.errorType,
          message: errorDetails.message,
          existingStage,
        }),
      });
    }

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
}
