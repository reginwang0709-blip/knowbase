import { NextResponse } from "next/server";

import type { GlossaryTerm } from "@/lib/mock-data";
import {
  isValidUserGlossarySelection,
  normalizeGlossaryTermRecord,
  normalizeGlossaryTermText,
} from "@/lib/glossary-terms";
import {
  safeLogGlossaryEvent,
} from "@/lib/glossary-logging";
import {
  getContentGlossaryContext,
  getContentRowById,
  updateGlossaryTermsForContent,
} from "@/lib/glossary-store";
import { createUserAddedGlossaryTerm } from "@/lib/llm/glossary-service";

type AddGlossaryTermRequestBody = {
  contentId?: unknown;
  selectedText?: unknown;
  blockId?: unknown;
  startOffset?: unknown;
  endOffset?: unknown;
  contextBefore?: unknown;
  contextAfter?: unknown;
};

function findPersistedGlossaryTerm({
  glossaryTerms,
  normalizedTerm,
}: {
  glossaryTerms: GlossaryTerm[];
  normalizedTerm: string;
}) {
  return glossaryTerms.find((term) => term.normalizedTerm === normalizedTerm) ?? null;
}

function buildEvidenceSnippet({
  selectedText,
  contextBefore,
  contextAfter,
}: {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
}) {
  return `${contextBefore}${selectedText}${contextAfter}`.trim().replace(/\s+/g, " ").slice(0, 120);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as AddGlossaryTermRequestBody | null;
    const contentId = typeof body?.contentId === "string" ? body.contentId.trim() : "";
    const selectedText =
      typeof body?.selectedText === "string" ? body.selectedText.trim() : "";
    const blockId = typeof body?.blockId === "string" ? body.blockId.trim() : "";
    const startOffset =
      typeof body?.startOffset === "number" && Number.isFinite(body.startOffset)
        ? body.startOffset
        : 0;
    const endOffset =
      typeof body?.endOffset === "number" && Number.isFinite(body.endOffset)
        ? body.endOffset
        : 0;
    const contextBefore =
      typeof body?.contextBefore === "string" ? body.contextBefore : "";
    const contextAfter =
      typeof body?.contextAfter === "string" ? body.contextAfter : "";

    if (!contentId || !selectedText || !blockId) {
      return NextResponse.json(
        {
          ok: false,
          message: "contentId、selectedText、blockId 均为必填。",
        },
        { status: 400 },
      );
    }

    if (!isValidUserGlossarySelection(selectedText)) {
      return NextResponse.json(
        {
          ok: false,
          message: "选中的文本不适合作为术语。",
        },
        { status: 400 },
      );
    }

    const content = await getContentRowById(contentId);

    if (!content) {
      return NextResponse.json(
        {
          ok: false,
          message: "内容不存在。",
        },
        { status: 404 },
      );
    }

    const context = await getContentGlossaryContext(content);
    const normalizedTerm = normalizeGlossaryTermText(selectedText);
    const existingTerm = context.glossaryTerms.find(
      (term) => term.normalizedTerm === normalizedTerm,
    );
    const evidenceSnippet = buildEvidenceSnippet({
      selectedText,
      contextBefore,
      contextAfter,
    });

    let glossaryTerm = existingTerm
      ? normalizeGlossaryTermRecord(
        {
          ...existingTerm,
          source: "user_added",
          termId: existingTerm.termId,
          contentGlossaryTermId: existingTerm.contentGlossaryTermId || existingTerm.id,
          blockId: existingTerm.blockId || blockId,
          firstEvidenceBlockId: existingTerm.firstEvidenceBlockId || blockId,
          evidenceSnippet: existingTerm.evidenceSnippet || evidenceSnippet,
          evidenceBlockIds: Array.from(
            new Set([...(existingTerm.evidenceBlockIds ?? []), blockId]),
          ),
          occurrences: [
            ...(existingTerm.occurrences ?? []),
            {
              blockId,
              startOffset,
              endOffset,
              matchedText: selectedText,
            },
          ],
          occurrenceCount: Math.max(existingTerm.occurrenceCount, 1),
          highlightEnabled: true,
          displayStatus: "highlighted",
          displayReason: "user_added",
          hiddenReason: undefined,
          },
          contentId,
        )
      : createUserAddedGlossaryTerm({
          contentId,
          termId: `user-${Date.now().toString(36)}`,
          term: selectedText,
          blockId,
          evidenceSnippet,
        });

    const initialPersistResult = await updateGlossaryTermsForContent(
      contentId,
      existingTerm
        ? context.glossaryTerms.map((term) => (term.id === existingTerm.id ? glossaryTerm : term))
        : [...context.glossaryTerms, glossaryTerm],
    );
    glossaryTerm =
      findPersistedGlossaryTerm({
        glossaryTerms: initialPersistResult.glossaryTerms,
        normalizedTerm,
      }) ?? glossaryTerm;
    void safeLogGlossaryEvent({
      contentId,
      glossaryTermId: glossaryTerm.termId || null,
      contentGlossaryTermId: glossaryTerm.contentGlossaryTermId || glossaryTerm.id,
      eventType: "term_added_by_user",
      eventSource: "user",
      metadata: {
        term: glossaryTerm.term,
        normalizedTerm: glossaryTerm.normalizedTerm,
        blockId,
        startOffset,
        endOffset,
        evidenceSnippet: glossaryTerm.evidenceSnippet || evidenceSnippet,
        previousFeedback: existingTerm?.userFeedback || "none",
        nextFeedback: glossaryTerm.userFeedback || "none",
      },
    });

    return NextResponse.json({
      ok: true,
      contentId,
      glossaryTerm: {
        ...glossaryTerm,
        selection: {
          blockId,
          startOffset,
          endOffset,
        },
      },
      wroteToDatabase: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return "添加术语失败。";
              }
            })();
    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 },
    );
  }
}
