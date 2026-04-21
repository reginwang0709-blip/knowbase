import "server-only";

import type { TranscriptBlock } from "@/lib/mock-data";
import { postProcessTranscriptBlocks } from "@/lib/source-adapters/xiaoyuzhou";

const defaultBaseUrl = "https://dashscope.aliyuncs.com/api/v1";

type FunAsrTaskStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

type FunAsrSubmitResponse = {
  request_id?: string;
  output?: {
    task_id?: string;
    task_status?: FunAsrTaskStatus;
  };
  code?: string;
  message?: string;
};

type FunAsrTaskResult = {
  file_url?: string;
  transcription_url?: string;
  subtask_status?: FunAsrTaskStatus;
  code?: string;
  message?: string;
};

type FunAsrQueryResponse = {
  request_id?: string;
  output?: {
    task_id?: string;
    task_status?: FunAsrTaskStatus;
    results?: FunAsrTaskResult[];
  };
  code?: string;
  message?: string;
};

type FunAsrSentence = {
  begin_time?: number;
  end_time?: number;
  text?: string;
  sentence_id?: number;
  speaker_id?: number;
};

type FunAsrTranscript = {
  channel_id?: number;
  text?: string;
  sentences?: FunAsrSentence[];
};

export type FunAsrTranscriptionResult = {
  file_url?: string;
  transcripts?: FunAsrTranscript[];
};

const pollIntervalMs = 3000;
const maxPollCount = 20;

function getDashscopeBaseUrl() {
  const configuredBaseUrl =
    process.env.DASHSCOPE_BASE_URL?.trim().replace(/\/+$/, "") ||
    defaultBaseUrl;

  return configuredBaseUrl.replace(
    /\/api\/v1(?:\/api\/v1)+$/i,
    "/api/v1",
  );
}

function getDashscopeApiKey() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("缺少 DASHSCOPE_API_KEY，无法调用 Fun-ASR。");
  }

  return apiKey;
}

function getSubmitHeaders() {
  return {
    Authorization: `Bearer ${getDashscopeApiKey()}`,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  };
}

function getQueryHeaders() {
  return {
    Authorization: `Bearer ${getDashscopeApiKey()}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(data: unknown, fallback: string) {
  if (isRecord(data)) {
    const code = typeof data.code === "string" ? data.code : "";
    const message = typeof data.message === "string" ? data.message : "";

    if (code && message) {
      return `${fallback}（${code}: ${message}）`;
    }

    if (message) {
      return `${fallback}（${message}）`;
    }
  }

  return fallback;
}

function buildDashscopeUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${getDashscopeBaseUrl()}${normalizedPath}`;
}

function getFetchErrorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "unknown fetch error";
}

function msToTimestamp(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(value / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((part) => String(part).padStart(2, "0"))
      .join(":");
  }

  return [minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function submitFunAsrTask(audioUrl: string) {
  let response: Response;

  try {
    response = await fetch(buildDashscopeUrl("/services/audio/asr/transcription"), {
      method: "POST",
      headers: getSubmitHeaders(),
      body: JSON.stringify({
        model: "fun-asr",
        input: {
          file_urls: [audioUrl],
        },
      }),
    });
  } catch (error) {
    throw new Error(
      `提交 Fun-ASR 任务时网络请求失败：${getFetchErrorMessage(error)}`,
    );
  }

  const data = (await response.json().catch(() => null)) as FunAsrSubmitResponse | null;

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, `提交 Fun-ASR 任务失败，HTTP ${response.status}`),
    );
  }

  const taskId = data?.output?.task_id;

  if (!taskId) {
    throw new Error("Fun-ASR 提交成功，但响应中缺少 task_id。");
  }

  return {
    taskId,
    taskStatus: data.output?.task_status ?? "PENDING",
    requestId: data.request_id ?? "",
  };
}

export async function queryFunAsrTask(taskId: string) {
  let response: Response;

  try {
    response = await fetch(buildDashscopeUrl(`/tasks/${taskId}`), {
      method: "GET",
      headers: getQueryHeaders(),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `查询 Fun-ASR 任务时网络请求失败：${getFetchErrorMessage(error)}`,
    );
  }

  const data = (await response.json().catch(() => null)) as FunAsrQueryResponse | null;

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, `查询 Fun-ASR 任务失败，HTTP ${response.status}`),
    );
  }

  const output = data?.output;

  if (!output?.task_id || !output.task_status) {
    throw new Error("Fun-ASR 查询响应结构异常：缺少 task_id 或 task_status。");
  }

  const succeededResult =
    output.results?.find((result) => result.subtask_status === "SUCCEEDED") ??
    null;
  const failedResult =
    output.results?.find((result) => result.subtask_status === "FAILED") ?? null;

  return {
    taskId: output.task_id,
    taskStatus: output.task_status,
    results: output.results ?? [],
    transcriptionUrl: succeededResult?.transcription_url ?? "",
    failureMessage: failedResult?.message ?? "",
  };
}

export async function fetchFunAsrTranscription(transcriptionUrl: string) {
  let response: Response;

  try {
    response = await fetch(transcriptionUrl, {
      method: "GET",
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `下载 transcription_url 失败：${getFetchErrorMessage(error)}`,
    );
  }

  const data = (await response.json().catch(() => null)) as FunAsrTranscriptionResult | null;

  if (!response.ok) {
    throw new Error(`下载 Fun-ASR 转写结果失败，HTTP ${response.status}`);
  }

  if (!data) {
    throw new Error("Fun-ASR 转写结果结构异常：返回内容不是有效 JSON。");
  }

  return data;
}

export function transcriptionToTranscriptBlocks(result: FunAsrTranscriptionResult) {
  const blocks: TranscriptBlock[] = [];

  for (const transcript of result.transcripts ?? []) {
    const sentences = transcript.sentences ?? [];

    for (const sentence of sentences) {
      const text = sentence.text?.trim();

      if (!text) {
        continue;
      }

      const blockId =
        typeof sentence.sentence_id === "number"
          ? `t-${transcript.channel_id ?? 0}-${sentence.sentence_id}`
          : `t-${transcript.channel_id ?? 0}-${blocks.length + 1}`;
      const speaker =
        typeof sentence.speaker_id === "number"
          ? `说话人 ${sentence.speaker_id + 1}`
          : "";

      blocks.push({
        id: blockId,
        time: msToTimestamp(sentence.begin_time),
        speaker,
        text,
      });
    }
  }

  if (blocks.length === 0) {
    throw new Error("Fun-ASR 返回成功，但没有可转换的 transcriptBlocks。");
  }

  return postProcessTranscriptBlocks(blocks);
}

export async function transcribeAudioWithFunAsr(audioUrl: string) {
  if (!audioUrl) {
    throw new Error("缺少 audioUrl，无法调用 Fun-ASR。");
  }

  if (!isPublicHttpUrl(audioUrl)) {
    throw new Error("audioUrl 必须是可访问的公网 http(s) 地址。");
  }

  const submitted = await submitFunAsrTask(audioUrl);

  for (let attempt = 0; attempt < maxPollCount; attempt += 1) {
    const queried = await queryFunAsrTask(submitted.taskId);

    if (queried.taskStatus === "SUCCEEDED") {
      if (!queried.transcriptionUrl) {
        throw new Error("Fun-ASR 任务成功，但缺少 transcription_url。");
      }

      const transcription = await fetchFunAsrTranscription(
        queried.transcriptionUrl,
      );
      const transcriptBlocks = transcriptionToTranscriptBlocks(transcription);

      return {
        taskId: queried.taskId,
        taskStatus: queried.taskStatus,
        transcriptionUrl: queried.transcriptionUrl,
        transcriptBlocks,
      };
    }

    if (queried.taskStatus === "FAILED") {
      throw new Error(queried.failureMessage || "Fun-ASR 任务执行失败。");
    }

    if (attempt < maxPollCount - 1) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(
    `Fun-ASR 转写超时，已轮询 ${maxPollCount} 次，间隔 ${pollIntervalMs / 1000} 秒。`,
  );
}
