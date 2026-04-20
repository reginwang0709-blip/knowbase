import { NextResponse } from "next/server";

import { mapContentRowToKnowledgeItem } from "@/lib/api-mappers";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ContentRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: ContentRouteContext) {
  const { id } = await context.params;

  const { data: content, error } = await supabaseAdmin
    .from("contents")
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

  if (!content) {
    return NextResponse.json(
      {
        error: "content not found",
      },
      { status: 404 },
    );
  }

  return NextResponse.json(mapContentRowToKnowledgeItem(content));
}

export async function DELETE(_request: Request, context: ContentRouteContext) {
  const { id } = await context.params;

  const { data: content, error: findError } = await supabaseAdmin
    .from("contents")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json(
      {
        error: findError.message,
      },
      { status: 500 },
    );
  }

  if (!content) {
    return NextResponse.json(
      {
        error: "content not found",
      },
      { status: 404 },
    );
  }

  const { error: taskUpdateError } = await supabaseAdmin
    .from("parse_tasks")
    .update({
      content_id: null,
    })
    .eq("content_id", id);

  if (taskUpdateError) {
    return NextResponse.json(
      {
        error: taskUpdateError.message,
      },
      { status: 500 },
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("contents")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json(
      {
        error: deleteError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    deletedContentId: id,
  });
}
