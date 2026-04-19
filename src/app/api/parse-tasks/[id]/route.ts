import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

type ParseTaskRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: ParseTaskRouteContext) {
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

  return NextResponse.json({
    task,
  });
}
