import { NextResponse } from "next/server";

import {
  authorFromUrl,
  extractLinkMetadata,
  isXiaoyuzhouEpisodeUrl,
  normalizeSubmittedUrl,
  platformFromUrl,
  readableTitleFromUrl,
  type LinkMetadata,
} from "@/lib/link-metadata";
import { runMockProcessingForTask } from "@/lib/mock-processing";
import { supabaseAdmin } from "@/lib/supabase/admin";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown server error";
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
}) {
  const sourceUrl = metadata.canonicalUrl || normalizedSubmittedUrl;

  return {
    title:
      metadata.title || readableTitleFromUrl(sourceUrl) || "未命名内容",
    platform:
      metadata.siteName ||
      metadata.platform ||
      platformFromUrl(sourceUrl) ||
      "未知来源",
    source_url: sourceUrl,
    author: metadata.author || authorFromUrl(sourceUrl) || null,
    published_at: metadata.publishedAt || null,
    summary: metadata.description || "暂未提取到网页摘要。",
  };
}

function buildSourceMetadata(metadata: LinkMetadata) {
  return {
    audioUrl: metadata.audioUrl,
    coverUrl: metadata.coverUrl,
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

  const metadata = await extractLinkMetadata(normalizedSubmittedUrl);
  const isXiaoyuzhouEpisode = isXiaoyuzhouEpisodeUrl(normalizedSubmittedUrl);

  if (isXiaoyuzhouEpisode && !metadata.audioUrl) {
    return NextResponse.json(
      {
        error: "未能从小宇宙单集页面提取到可用的音频地址。",
      },
      { status: 422 },
    );
  }

  const contentBasics = buildContentBasics({
    metadata,
    normalizedSubmittedUrl,
  });
  const processingMetadata = {
    ...metadata,
    url: normalizedSubmittedUrl,
    canonicalUrl: metadata.canonicalUrl,
  };

  const { data: createdTask, error: createTaskError } = await supabaseAdmin
    .from("parse_tasks")
    .insert({
      url: normalizedSubmittedUrl,
      title: contentBasics.title,
      platform: contentBasics.platform,
      status: "submitted",
      progress: 0,
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
    const { data: existingContent, error: existingContentError } =
      await supabaseAdmin
        .from("contents")
        .select("*")
        .eq("source_url", contentBasics.source_url)
        .order("created_at", { ascending: true })
        .limit(1);

    if (existingContentError) {
      throw existingContentError;
    }

    const matchedContent = existingContent?.[0];

    if (matchedContent) {
      const existingPayload =
        matchedContent.content_payload &&
        typeof matchedContent.content_payload === "object" &&
        !Array.isArray(matchedContent.content_payload)
          ? matchedContent.content_payload
          : {};
      const { data: refreshedContent, error: refreshContentError } =
        await supabaseAdmin
          .from("contents")
          .update({
            ...contentBasics,
            content_payload: {
              ...existingPayload,
              sourceMetadata: buildSourceMetadata(metadata),
            },
          })
          .eq("id", matchedContent.id)
          .select("*")
          .single();

      if (refreshContentError) {
        throw refreshContentError;
      }

      const { data: completedTask, error: completeTaskError } =
        await supabaseAdmin
          .from("parse_tasks")
          .update({
            status: "completed",
            progress: 100,
            content_id: refreshedContent.id,
            title: refreshedContent.title,
            platform: refreshedContent.platform,
          })
          .eq("id", createdTask.id)
          .select("*")
          .single();

      if (completeTaskError) {
        throw completeTaskError;
      }

      return NextResponse.json({
        task: completedTask,
        contentId: refreshedContent.id,
        duplicated: true,
        sourceMetadata: buildSourceMetadata(metadata),
      });
    }

    const { task, content } = await runMockProcessingForTask({
      metadata: processingMetadata,
      taskId: createdTask.id,
    });

    return NextResponse.json({
      task,
      contentId: content.id,
      duplicated: false,
      sourceMetadata: buildSourceMetadata(metadata),
    });
  } catch (error) {
    const errorMessage = getErrorMessage(error);

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
      },
      { status: 500 },
    );
  }
}
