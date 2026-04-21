import { NextResponse } from "next/server";

import {
  fetchFunAsrTranscription,
  queryFunAsrTask,
  transcriptionToTranscriptBlocks,
} from "@/lib/asr/dashscope-funasr";
import {
  saveResolvedTranscriptContent,
  type ParseTaskProcessingPayload,
  type SourceMetadataPayload,
} from "@/lib/mock-processing";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/types";

type ParseTaskRow = Database["public"]["Tables"]["parse_tasks"]["Row"];
type ParseTaskStatus = ParseTaskRow["status"];
type ContentRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toProcessingPayload(
  value: Json | null | undefined,
): ParseTaskProcessingPayload {
  if (!value || !isRecord(value)) {
    return {};
  }

  return value as ParseTaskProcessingPayload;
}

async function updateTask({
  taskId,
  status,
  progress,
  contentId,
  errorMessage,
  processingPayload,
}: {
  taskId: string;
  status?: ParseTaskStatus;
  progress?: number;
  contentId?: string | null;
  errorMessage?: string | null;
  processingPayload?: ParseTaskProcessingPayload;
}) {
  const updatePayload: Database["public"]["Tables"]["parse_tasks"]["Update"] = {};

  if (status !== undefined) {
    updatePayload.status = status;
  }

  if (progress !== undefined) {
    updatePayload.progress = progress;
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

function buildTaskResponse({
  task,
  code,
  message,
  contentId,
}: {
  task: ParseTaskRow;
  code?: string;
  message?: string;
  contentId?: string | null;
}) {
  return {
    task,
    taskId: task.id,
    contentId: contentId ?? task.content_id ?? undefined,
    code,
    message,
  };
}

function getQueryErrorCount(processingPayload: ParseTaskProcessingPayload) {
  return processingPayload.asr?.queryErrorCount ?? 0;
}

function sanitizeErrorMessage(message: string) {
  return message.trim() || "ASR 状态查询失败。";
}

function buildAsrFailedMessage(message: string) {
  return `ASR 状态查询失败，请稍后重试。原因：${sanitizeErrorMessage(message)}`;
}

function shouldCleanupCompletedTask(processingPayload: ParseTaskProcessingPayload) {
  return Boolean(
    processingPayload.asr?.status === "SUCCEEDED" &&
      (processingPayload.asr?.message ||
        processingPayload.asr?.lastError ||
        (processingPayload.asr?.queryErrorCount ?? 0) > 0),
  );
}

export async function GET(_request: Request, context: ContentRouteContext) {
  const { id } = await context.params;

  const { data: task, error } = await supabaseAdmin
    .from("parse_tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 },
    );
  }

  if (!task) {
    return NextResponse.json(
      {
        error: "parse task not found",
      },
      { status: 404 },
    );
  }

  const processingPayload = toProcessingPayload(task.processing_payload);
  const asrTaskId = processingPayload.asr?.taskId;

  if (task.status === "completed" && shouldCleanupCompletedTask(processingPayload)) {
    const cleanedTask = await updateTask({
      taskId: task.id,
      processingPayload: {
        ...processingPayload,
        asr: {
          ...processingPayload.asr,
          queryErrorCount: 0,
          lastError: undefined,
          message: undefined,
        },
      },
    });

    return NextResponse.json(buildTaskResponse({ task: cleanedTask }));
  }

  if (task.status !== "generating_transcript" || !asrTaskId) {
    return NextResponse.json(buildTaskResponse({ task }));
  }

  try {
    const queried = await queryFunAsrTask(asrTaskId);
    const basePayload: ParseTaskProcessingPayload = {
      ...processingPayload,
      asr: {
        ...processingPayload.asr,
        provider: "dashscope-funasr",
        taskId: asrTaskId,
        status: queried.taskStatus,
        queryErrorCount: 0,
        lastError: undefined,
        message: undefined,
        lastCheckedAt: new Date().toISOString(),
      },
    };

    if (queried.taskStatus === "PENDING" || queried.taskStatus === "RUNNING") {
      const inProgressTask = await updateTask({
        taskId: task.id,
        progress: queried.taskStatus === "RUNNING" ? 75 : 60,
        processingPayload: basePayload,
      });

      return NextResponse.json(
        buildTaskResponse({
          task: inProgressTask,
          code: "ASR_TASK_RUNNING",
          message: "Fun-ASR 仍在处理中，请继续轮询。",
        }),
      );
    }

    if (queried.taskStatus === "FAILED") {
      const failedTask = await updateTask({
        taskId: task.id,
        status: "failed",
        errorMessage: queried.failureMessage || "Fun-ASR 任务执行失败。",
        processingPayload: {
          ...basePayload,
          sourceMetadata: {
            ...(processingPayload.sourceMetadata as SourceMetadataPayload),
          },
        },
      });

      return NextResponse.json(buildTaskResponse({ task: failedTask }));
    }

    if (!queried.transcriptionUrl) {
      throw new Error("Fun-ASR 任务成功，但 transcription_url 尚未就绪。");
    }

    const transcription = await fetchFunAsrTranscription(queried.transcriptionUrl);
    const transcriptBlocks = transcriptionToTranscriptBlocks(transcription);
    const contentBasics = processingPayload.contentBasics;

    if (!contentBasics) {
      throw new Error("parse task processing_payload 缺少 contentBasics。");
    }

    const sourceMetadata: SourceMetadataPayload = {
      ...(processingPayload.sourceMetadata ?? {}),
      transcriptSource: "asr",
      asrProvider: "dashscope-funasr",
    };
    const { content } = await saveResolvedTranscriptContent({
      taskId: task.id,
      contentBasics,
      transcriptBlocks,
      sourceMetadata,
    });
    const completedTask = await updateTask({
      taskId: task.id,
      status: "completed",
      progress: 100,
      contentId: content.id,
      errorMessage: null,
      processingPayload: {
        ...basePayload,
        sourceMetadata,
        asr: {
          ...basePayload.asr,
          status: "SUCCEEDED",
          transcriptionUrl: queried.transcriptionUrl,
          queryErrorCount: 0,
          lastError: undefined,
          message: undefined,
        },
      },
    });

    return NextResponse.json(
      buildTaskResponse({
        task: completedTask,
        code: "ASR_TASK_COMPLETED",
        contentId: content.id,
      }),
    );
  } catch (error) {
    const message = sanitizeErrorMessage(
      error instanceof Error ? error.message : "Fun-ASR query failed.",
    );
    const nextErrorCount = getQueryErrorCount(processingPayload) + 1;

    if (nextErrorCount > 3) {
      const failedTask = await updateTask({
        taskId: task.id,
        status: "failed",
        progress: task.progress,
        errorMessage: buildAsrFailedMessage(message),
        processingPayload: {
          ...processingPayload,
          asr: {
            ...processingPayload.asr,
            queryErrorCount: nextErrorCount,
            lastError: message,
            message,
            lastCheckedAt: new Date().toISOString(),
          },
        },
      });

      return NextResponse.json(buildTaskResponse({ task: failedTask }));
    }

    const recoverableTask = await updateTask({
      taskId: task.id,
      progress: task.progress,
      errorMessage: null,
      processingPayload: {
        ...processingPayload,
        asr: {
          ...processingPayload.asr,
          queryErrorCount: nextErrorCount,
          lastError: message,
          message,
          lastCheckedAt: new Date().toISOString(),
        },
      },
    });

    return NextResponse.json(
      buildTaskResponse({
        task: recoverableTask,
        code: "ASR_QUERY_RETRYING",
        message,
      }),
    );
  }
}
