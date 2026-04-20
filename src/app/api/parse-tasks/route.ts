import { NextResponse } from "next/server";

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

  const { data: createdTask, error: createTaskError } = await supabaseAdmin
    .from("parse_tasks")
    .insert({
      url,
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
        .eq("source_url", url)
        .order("created_at", { ascending: true })
        .limit(1);

    if (existingContentError) {
      throw existingContentError;
    }

    const matchedContent = existingContent?.[0];

    if (matchedContent) {
      const { data: completedTask, error: completeTaskError } =
        await supabaseAdmin
          .from("parse_tasks")
          .update({
            status: "completed",
            progress: 100,
            content_id: matchedContent.id,
            title: matchedContent.title,
            platform: matchedContent.platform,
          })
          .eq("id", createdTask.id)
          .select("*")
          .single();

      if (completeTaskError) {
        throw completeTaskError;
      }

      return NextResponse.json({
        task: completedTask,
        contentId: matchedContent.id,
        duplicated: true,
      });
    }

    const { task, content } = await runMockProcessingForTask({
      taskId: createdTask.id,
      url,
    });

    return NextResponse.json({
      task,
      contentId: content.id,
      duplicated: false,
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
