import { NextResponse } from "next/server";

import {
  commitLibraryArchiveSuggestion,
  LibraryArchiveSuggestionError,
  LibraryArchiveRequiresReviewError,
  generateLibraryArchiveSuggestion,
} from "@/lib/llm/library-archive-service";

export const maxDuration = 180;

type LibraryArchiveRequestBody = {
  contentId?: unknown;
  dryRun?: unknown;
  commit?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LibraryArchiveRequestBody | null;
  const contentId = typeof body?.contentId === "string" ? body.contentId.trim() : "";
  const dryRun = body?.dryRun !== false;
  const commit = body?.commit === true;

  if (!contentId) {
    return NextResponse.json(
      {
        ok: false,
        dryRun: true,
        message: "contentId 为必填。",
        wroteToDatabase: false,
      },
      { status: 400 },
    );
  }

  if (!dryRun && !commit) {
    return NextResponse.json(
      {
        ok: false,
        dryRun: false,
        contentId,
        message: "commit=true 时才允许写库。",
        wroteToDatabase: false,
      },
      { status: 400 },
    );
  }

  try {
    if (!dryRun && commit) {
      const result = await commitLibraryArchiveSuggestion(contentId);

      return NextResponse.json(result);
    }

    const result = await generateLibraryArchiveSuggestion(contentId);

    return NextResponse.json({
      ok: true,
      dryRun: true,
      contentId,
      archiveSuggestion: result.archiveSuggestion,
      diagnostics: result.diagnostics,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成归档建议失败。";
    const diagnostics =
      error instanceof LibraryArchiveSuggestionError
        ? error.diagnostics
        : {
            contentTitle: "",
            categoryCount: 0,
            topicCount: 0,
            titleSource: "missing",
            summarySource: "missing",
            keywordsSource: "missing",
            sectionsSource: "missing",
            rawSectionsCount: 0,
            usedSectionsCount: 0,
            usedSectionsPreview: [],
            rawKeywordsCount: 0,
            usedKeywords: [],
            usedSectionSignals: [],
            keywordThemeSignals: [],
            glossaryAuxiliarySignals: [],
            archiveDecisionMainSignals: [],
            rawGlossaryTermsCount: 0,
            filteredGlossaryTermsCount: 0,
            usedGlossaryTermsCount: 0,
            droppedGlossaryTermsPreview: [],
            usedGlossaryTermsPreview: [],
            contentPayloadKeys: [],
            whetherMockFallbackUsed: false,
            provider: "minimax" as const,
            model: "",
            wroteToDatabase: false as const,
          };
    const archiveSuggestion =
      error instanceof LibraryArchiveRequiresReviewError
        ? error.archiveSuggestion
        : null;
    const requiresReview = error instanceof LibraryArchiveRequiresReviewError;
    const reviewReason =
      error instanceof LibraryArchiveRequiresReviewError
        ? error.reviewReason
        : undefined;

    return NextResponse.json(
      {
        ok: false,
        dryRun,
        commit,
        contentId,
        archiveSuggestion,
        diagnostics,
        requiresReview,
        reviewReason,
        message,
      },
      { status: 500 },
    );
  }
}
