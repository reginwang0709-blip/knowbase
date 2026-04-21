import "server-only";

import type { TranscriptBlock } from "@/lib/mock-data";

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

function getDashscopeBaseUrl() {
  return (
    process.env.DASHSCOPE_BASE_URL?.trim().replace(/\/+$/, "") ||
    defaultBaseUrl
  );
}

function getDashscopeApiKey() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("缺少 DASHSCOPE_API_KEY，无法调用 Fun-ASR。");
  }

  return apiKey;
}

function getHeaders() {
  return {
    Authorization: `Bearer ${getDashscopeApiKey()}`,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
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

export async function submitFunAsrTask(audioUrl: string) {
  const response = await fetch(
    `${getDashscopeBaseUrl()}/services/audio/asr/transcription`,
    {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        model: "fun-asr",
        input: {
          file_urls: [audioUrl],
        },
      }),
    },
  );

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
  const response = await fetch(`${getDashscopeBaseUrl()}/tasks/${taskId}`, {
    method: "POST",
    headers: getHeaders(),
  });

  const data = (await response.json().catch(() => null)) as FunAsrQueryResponse | null;

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, `查询 Fun-ASR 任务失败，HTTP ${response.status}`),
    );
  }

  const output = data?.output;

  if (!output?.task_id || !output.task_status) {
    throw new Error("Fun-ASR 查询成功，但响应中缺少任务状态。");
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
  const response = await fetch(transcriptionUrl, {
    method: "GET",
    cache: "no-store",
  });

  const data = (await response.json().catch(() => null)) as FunAsrTranscriptionResult | null;

  if (!response.ok || !data) {
    throw new Error(`下载 Fun-ASR 转写结果失败，HTTP ${response.status}`);
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

  return blocks;
}
