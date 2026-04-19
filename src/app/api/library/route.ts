import { NextResponse } from "next/server";

import { mapLibraryRowsToResponse } from "@/lib/api-mappers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const { data: contents, error: contentsError } = await supabaseAdmin
    .from("contents")
    .select("*")
    .order("parsed_at", { ascending: false });

  if (contentsError) {
    return NextResponse.json(
      {
        error: contentsError.message,
      },
      { status: 500 },
    );
  }

  if (!contents || contents.length === 0) {
    return NextResponse.json({
      libraryCategories: [],
      recentTopics: [],
      recentContents: [],
    });
  }

  const [
    categoriesResult,
    topicsResult,
    assignmentsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("library_categories")
      .select("*")
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("library_topics")
      .select("*")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("content_topic_assignments")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  if (categoriesResult.error) {
    return NextResponse.json(
      {
        error: categoriesResult.error.message,
      },
      { status: 500 },
    );
  }

  if (topicsResult.error) {
    return NextResponse.json(
      {
        error: topicsResult.error.message,
      },
      { status: 500 },
    );
  }

  if (assignmentsResult.error) {
    return NextResponse.json(
      {
        error: assignmentsResult.error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    mapLibraryRowsToResponse({
      categories: categoriesResult.data ?? [],
      topics: topicsResult.data ?? [],
      assignments: assignmentsResult.data ?? [],
      contents,
    }),
  );
}
