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
