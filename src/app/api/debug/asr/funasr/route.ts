import { NextResponse } from "next/server";

import {
  fetchFunAsrTranscription,
  queryFunAsrTask,
  submitFunAsrTask,
  transcriptionToTranscriptBlocks,
} from "@/lib/asr/dashscope-funasr";

const pollIntervalMs = 3000;
const maxPollCount = 20;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function readBody(request: Request) {
  try {
    const body = (await request.json()) as {
      audioUrl?: unknown;
      wait?: unknown;
    };

    return {
      audioUrl: typeof body.audioUrl === "string" ? body.audioUrl.trim() : "",
      wait: body.wait === true,
    };
  } catch {
    return {
      audioUrl: "",
      wait: false,
    };
  }
}

export async function POST(request: Request) {
  const { audioUrl, wait } = await readBody(request);

  if (!audioUrl) {
    return NextResponse.json(
      {
        error: "audioUrl is required",
      },
      { status: 400 },
    );
  }

  if (!isPublicHttpUrl(audioUrl)) {
    return NextResponse.json(
      {
        error: "audioUrl 必须是可访问的公网 http(s) 地址。",
      },
      { status: 400 },
    );
  }

  try {
    const submitted = await submitFunAsrTask(audioUrl);

    if (!wait) {
      return NextResponse.json({
        taskId: submitted.taskId,
        taskStatus: submitted.taskStatus,
      });
    }

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
        const textPreview = transcriptBlocks
          .map((block) => block.text)
          .join(" ")
          .slice(0, 200);

        return NextResponse.json({
          taskId: queried.taskId,
          taskStatus: queried.taskStatus,
          transcriptionUrl: queried.transcriptionUrl,
          transcriptBlocks,
          textPreview,
        });
      }

      if (queried.taskStatus === "FAILED") {
        return NextResponse.json(
          {
            taskId: queried.taskId,
            taskStatus: queried.taskStatus,
            error: queried.failureMessage || "Fun-ASR 任务执行失败。",
          },
          { status: 502 },
        );
      }

      if (attempt < maxPollCount - 1) {
        await sleep(pollIntervalMs);
      }
    }

    return NextResponse.json(
      {
        taskId: submitted.taskId,
        taskStatus: "RUNNING",
        error: "Fun-ASR 任务仍在处理中，请稍后继续查询。",
      },
      { status: 202 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Fun-ASR debug probe failed.",
      },
      { status: 500 },
    );
  }
}
