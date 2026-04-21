import { NextResponse } from "next/server";

import { submitFunAsrTask } from "@/lib/asr/dashscope-funasr";
import {
  contentHasResolvedTranscript,
  findFirstContentBySourceUrl,
  runMockProcessingForTask,
  saveResolvedTranscriptContent,
  type ContentBasics,
  type ParseTaskProcessingPayload,
  type SourceMetadataPayload,
} from "@/lib/mock-processing";
import {
  authorFromUrl,
  extractLinkMetadata,
  isXiaoyuzhouEpisodeUrl,
  normalizeSubmittedUrl,
  platformFromUrl,
  readableTitleFromUrl,
  type LinkMetadata,
} from "@/lib/link-metadata";
import {
  transcriptTextToTranscriptBlocks,
  type TranscriptSourceDecision,
} from "@/lib/source-adapters/xiaoyuzhou";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/types";

type ParseTaskRow = Database["public"]["Tables"]["parse_tasks"]["Row"];
type ParseTaskStatus = ParseTaskRow["status"];

const inProgressStatuses: ParseTaskStatus[] = [
  "submitted",
  "detecting_source",
  "extracting_content",
  "generating_transcript",
  "generating_knowledge_pack",
];

class HttpError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
}

function getErrorStatus(error: unknown) {
  return error instanceof HttpError ? error.status : 500;
}

function getErrorCode(error: unknown) {
  return error instanceof HttpError ? error.code : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toProcessingPayload(value: Json | null | undefined): ParseTaskProcessingPayload {
  if (!value || !isRecord(value)) {
    return {};
  }

  return value as ParseTaskProcessingPayload;
}

async function readUrl(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return "";
  }

  if (!body || typeof body !== "object" || !("url" in body)) {
    return "";
  }

  const url = (body as { url?: unknown }).url;

  return typeof url === "string" ? url.trim() : "";
}

function buildContentBasics({
  metadata,
  normalizedSubmittedUrl,
}: {
  metadata: LinkMetadata;
  normalizedSubmittedUrl: string;
}): ContentBasics {
  const sourceUrl = metadata.canonicalUrl || normalizedSubmittedUrl;
  const isXiaoyuzhouEpisode = isXiaoyuzhouEpisodeUrl(sourceUrl);

  return {
    title:
      metadata.title ||
      readableTitleFromUrl(sourceUrl) ||
      (isXiaoyuzhouEpisode ? "未命名小宇宙节目" : "未命名内容"),
    platform:
      metadata.siteName ||
      metadata.platform ||
      platformFromUrl(sourceUrl) ||
      "未知来源",
    source_url: sourceUrl,
    author: metadata.author || (!isXiaoyuzhouEpisode ? authorFromUrl(sourceUrl) : null) || null,
    published_at: metadata.publishedAt || null,
    summary:
      metadata.description ||
      (isXiaoyuzhouEpisode ? "暂未提取到节目简介。" : "暂未提取到网页摘要。"),
  };
}

function buildSourceMetadata(
  metadata: LinkMetadata,
  overrides: Partial<SourceMetadataPayload> = {},
): SourceMetadataPayload {
  return {
    audioUrl: metadata.audioUrl,
    coverUrl: metadata.coverUrl,
    ...overrides,
  };
}

async function updateTaskStatus({
  taskId,
  status,
  progress,
  title,
  platform,
  contentId,
  errorMessage,
  processingPayload,
}: {
  taskId: string;
  status: ParseTaskStatus;
  progress: number;
  title?: string | null;
  platform?: string | null;
  contentId?: string | null;
  errorMessage?: string | null;
  processingPayload?: ParseTaskProcessingPayload;
}) {
  const updatePayload: Database["public"]["Tables"]["parse_tasks"]["Update"] = {
    status,
    progress,
  };

  if (title !== undefined) {
    updatePayload.title = title;
  }

  if (platform !== undefined) {
    updatePayload.platform = platform;
  }

  if (contentId !== undefined) {
    updatePayload.content_id = contentId;
  }

  if (errorMessage !== undefined) {
    updatePayload.error_message = errorMessage;
  }

  if (processingPayload !== undefined) {
    updatePayload.processing_payload = processingPayload as Json;
  }

  const { data, error } = await supabaseAdmin
    .from("parse_tasks")
    .update(updatePayload)
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function findInProgressTask(normalizedUrl: string) {
  const { data, error } = await supabaseAdmin
    .from("parse_tasks")
    .select("*")
    .eq("url", normalizedUrl)
    .in("status", inProgressStatuses)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function buildTaskResponse({
  task,
  code,
  contentId,
  duplicated,
  message,
  sourceMetadata,
}: {
  task: ParseTaskRow;
  code?: string;
  contentId?: string | null;
  duplicated?: boolean;
  message?: string;
  sourceMetadata?: SourceMetadataPayload;
}) {
  return {
    task,
    taskId: task.id,
    contentId: contentId ?? task.content_id ?? undefined,
    duplicated,
    code,
    message,
    sourceMetadata,
  };
}

function resolveExistingTranscript(metadata: LinkMetadata) {
  const transcriptText =
    metadata.transcriptSourceDecision?.transcriptText?.trim() ?? "";

  if (!transcriptText) {
    throw new HttpError("小宇宙已识别到 existing transcript，但内容为空。", 422);
  }

  const transcriptBlocks = transcriptTextToTranscriptBlocks(transcriptText);

  if (transcriptBlocks.length === 0) {
    throw new HttpError(
      "小宇宙 existing transcript 无法转换为 transcriptBlocks。",
      422,
    );
  }

  return {
    transcriptBlocks,
    sourceMetadata: buildSourceMetadata(metadata, {
      transcriptSource: "existing_transcript",
    }),
  };
}

function getXiaoyuzhouTranscriptDecision(
  metadata: LinkMetadata,
): TranscriptSourceDecision {
  if (metadata.transcriptSourceDecision) {
    return metadata.transcriptSourceDecision;
  }

  if (metadata.audioUrl) {
    return {
      source: "asr_required",
      reason: "no existing transcript decision; audioUrl available",
    };
  }

  return {
    source: "none",
    reason: "no existing transcript decision and no audioUrl",
  };
}

export async function POST(request: Request) {
  const url = await readUrl(request);

  if (!url) {
    return NextResponse.json(
      {
        error: "url is required",
      },
      { status: 400 },
    );
  }

  let normalizedSubmittedUrl: string;

  try {
    normalizedSubmittedUrl = normalizeSubmittedUrl(url);
  } catch {
    return NextResponse.json(
      {
        error: "url is invalid",
      },
      { status: 400 },
    );
  }

  try {
    const inProgressTask = await findInProgressTask(normalizedSubmittedUrl);

    if (inProgressTask) {
      return NextResponse.json(
        buildTaskResponse({
          task: inProgressTask,
          code: "TASK_IN_PROGRESS",
          contentId: inProgressTask.content_id,
          message: "相同链接已有任务正在处理中，请继续轮询当前任务。",
        }),
        { status: 409 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: 500 },
    );
  }

  const { data: createdTask, error: createTaskError } = await supabaseAdmin
    .from("parse_tasks")
    .insert({
      url: normalizedSubmittedUrl,
      title: readableTitleFromUrl(normalizedSubmittedUrl) || "未命名内容",
      platform: platformFromUrl(normalizedSubmittedUrl) || "未知来源",
      status: "submitted",
      progress: 5,
      processing_payload: {},
    })
    .select("*")
    .single();

  if (createTaskError) {
    return NextResponse.json(
      {
        error: createTaskError.message,
      },
      { status: 500 },
    );
  }

  try {
    await updateTaskStatus({
      taskId: createdTask.id,
      status: "detecting_source",
      progress: 15,
      processingPayload: {},
      errorMessage: null,
    });

    const metadata = await extractLinkMetadata(normalizedSubmittedUrl);
    const isXiaoyuzhouEpisode = isXiaoyuzhouEpisodeUrl(normalizedSubmittedUrl);
    const contentBasics = buildContentBasics({
      metadata,
      normalizedSubmittedUrl,
    });
    const processingMetadata = {
      ...metadata,
      url: normalizedSubmittedUrl,
      canonicalUrl: metadata.canonicalUrl,
    };

    const taskAfterMetadata = await updateTaskStatus({
      taskId: createdTask.id,
      status: "extracting_content",
      progress: 30,
      title: contentBasics.title,
      platform: contentBasics.platform,
      errorMessage: null,
      processingPayload: {
        contentBasics,
      },
    });

    const matchedContent = await findFirstContentBySourceUrl(
      contentBasics.source_url,
    );

    if (matchedContent && contentHasResolvedTranscript(matchedContent)) {
      const completedTask = await updateTaskStatus({
        taskId: createdTask.id,
        status: "completed",
        progress: 100,
        title: matchedContent.title,
        platform: matchedContent.platform,
        contentId: matchedContent.id,
        processingPayload: {
          ...toProcessingPayload(taskAfterMetadata.processing_payload),
        },
      });

      return NextResponse.json(
        buildTaskResponse({
          task: completedTask,
          code: "CONTENT_ALREADY_EXISTS",
          contentId: matchedContent.id,
          duplicated: true,
          message: "该链接已生成真实知识包，直接返回已有内容。",
        }),
      );
    }

    if (!isXiaoyuzhouEpisode) {
      if (matchedContent) {
        const completedTask = await updateTaskStatus({
          taskId: createdTask.id,
          status: "completed",
          progress: 100,
          title: matchedContent.title,
          platform: matchedContent.platform,
          contentId: matchedContent.id,
          processingPayload: {
            contentBasics,
            sourceMetadata: buildSourceMetadata(metadata, {
              transcriptSource: "demo",
            }),
          },
        });

        return NextResponse.json(
          buildTaskResponse({
            task: completedTask,
            code: "CONTENT_ALREADY_EXISTS",
            contentId: matchedContent.id,
            duplicated: true,
            message: "该链接已生成内容，直接返回已有 content。",
          }),
        );
      }

      const defaultSourceMetadata = buildSourceMetadata(metadata, {
        transcriptSource: "demo",
      });
      const { task, content } = await runMockProcessingForTask({
        metadata: processingMetadata,
        taskId: createdTask.id,
        sourceMetadata: defaultSourceMetadata,
      });

      return NextResponse.json(
        buildTaskResponse({
          task,
          contentId: content.id,
          duplicated: false,
          sourceMetadata: defaultSourceMetadata,
        }),
      );
    }

    const decision = getXiaoyuzhouTranscriptDecision(metadata);

    if (decision.source === "existing_transcript") {
      const resolvedTranscript = resolveExistingTranscript(metadata);
      const { content, duplicated } = await saveResolvedTranscriptContent({
        taskId: createdTask.id,
        contentBasics,
        transcriptBlocks: resolvedTranscript.transcriptBlocks,
        sourceMetadata: resolvedTranscript.sourceMetadata,
      });
      const completedTask = await updateTaskStatus({
        taskId: createdTask.id,
        status: "completed",
        progress: 100,
        title: content.title,
        platform: content.platform,
        contentId: content.id,
        processingPayload: {
          contentBasics,
          sourceMetadata: resolvedTranscript.sourceMetadata,
        },
      });

      return NextResponse.json(
        buildTaskResponse({
          task: completedTask,
          contentId: content.id,
          duplicated,
          sourceMetadata: resolvedTranscript.sourceMetadata,
        }),
      );
    }

    if (decision.source === "asr_required") {
      if (!metadata.audioUrl) {
        throw new HttpError("未能从小宇宙单集页面提取到可用的音频地址。", 422);
      }

      const submittedAsrTask = await submitFunAsrTask(metadata.audioUrl);
      const sourceMetadata = buildSourceMetadata(metadata, {
        transcriptSource: "asr_pending",
        asrProvider: "dashscope-funasr",
      });
      const updatedTask = await updateTaskStatus({
        taskId: createdTask.id,
        status: "generating_transcript",
        progress: 60,
        title: contentBasics.title,
        platform: contentBasics.platform,
        processingPayload: {
          contentBasics,
          sourceMetadata,
          asr: {
            provider: "dashscope-funasr",
            taskId: submittedAsrTask.taskId,
            status: submittedAsrTask.taskStatus,
            submittedAt: new Date().toISOString(),
          },
        },
      });

      return NextResponse.json(
        buildTaskResponse({
          task: updatedTask,
          code: "ASR_TASK_SUBMITTED",
          message: "Fun-ASR 任务已提交，前端请轮询 parse task 获取后续状态。",
          sourceMetadata,
        }),
        { status: 202 },
      );
    }

    throw new HttpError("未能从小宇宙单集页面提取到可用的音频地址。", 422);
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    const status = getErrorStatus(error);
    const code = getErrorCode(error);

    await supabaseAdmin
      .from("parse_tasks")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", createdTask.id);

    return NextResponse.json(
      {
        error: errorMessage,
        code,
      },
      { status },
    );
  }
}
