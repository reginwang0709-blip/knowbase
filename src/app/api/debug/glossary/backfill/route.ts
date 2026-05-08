import { NextResponse } from "next/server";

import {
  backfillLegacyGlossaryTermsForContent,
  previewLegacyGlossaryBackfill,
} from "@/lib/glossary-store";

type GlossaryBackfillRequestBody = {
  contentId?: unknown;
  dryRun?: unknown;
  force?: unknown;
  commit?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as GlossaryBackfillRequestBody | null;
  const contentId = typeof body?.contentId === "string" ? body.contentId.trim() : "";
  const dryRun = body?.dryRun !== false;
  const commit = body?.commit === true;
  const force = body?.force === true;
  const shouldWrite = commit || force || dryRun === false;

  if (!contentId) {
    return NextResponse.json(
      {
        ok: false,
        message: "contentId 为必填。",
      },
      { status: 400 },
    );
  }

  try {
    const preview = await previewLegacyGlossaryBackfill(contentId);

    if (!shouldWrite) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        ...preview,
        wroteToDatabase: false,
        errors: [],
      });
    }

    const persistence = await backfillLegacyGlossaryTermsForContent({
      contentId,
    });

    return NextResponse.json({
      ok: true,
      dryRun: false,
      ...preview,
      wroteToDatabase: persistence.wroteToDatabase,
      errors: [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "glossary backfill failed";

    return NextResponse.json(
      {
        ok: false,
        contentId,
        dryRun: !shouldWrite,
        wroteToDatabase: false,
        errors: [message],
      },
      { status: 500 },
    );
  }
}
