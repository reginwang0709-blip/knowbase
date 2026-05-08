import "server-only";

import type {
  GlossaryOccurrence,
  GlossaryTerm,
  Keyword,
  Section,
  TranscriptBlock,
} from "./mock-data";
import {
  normalizeGlossaryTermRecord,
  normalizeGlossaryTermText,
  normalizeGlossaryTermsArray,
  sanitizeGlossaryAliases,
  sanitizeGlossaryExplanation,
} from "./glossary-terms";
import { supabaseAdmin } from "./supabase/admin";
import type { Database, Json } from "./supabase/types";

type ContentRow = Database["public"]["Tables"]["contents"]["Row"];
type GlossaryTermRow = Database["public"]["Tables"]["glossary_terms"]["Row"];
type ContentGlossaryTermRow =
  Database["public"]["Tables"]["content_glossary_terms"]["Row"];
type GlossaryOccurrenceRow =
  Database["public"]["Tables"]["glossary_occurrences"]["Row"];
type GlossaryExplanationRow =
  Database["public"]["Tables"]["glossary_explanations"]["Row"];
type UserGlossaryFeedbackRow =
  Database["public"]["Tables"]["user_glossary_feedback"]["Row"];

type ContentPayload = {
  generatedSummary?: string;
  keywords?: Keyword[];
  sections?: Section[];
  glossaryTerms?: GlossaryTerm[];
  transcriptBlocks?: TranscriptBlock[];
  generationMetadata?: Record<string, Json | undefined>;
};

type GlossaryPersistencePreview = {
  glossaryTermInserts: number;
  glossaryTermUpdates: number;
  contentGlossaryTermInserts: number;
  contentGlossaryTermUpdates: number;
  occurrenceInserts: number;
  explanationInserts: number;
  explanationUpdates: number;
  feedbackUpserts: number;
};

type PersistGlossaryTermsOptions = {
  dryRun?: boolean;
  writeCompatibilityPayload?: boolean;
};

type PersistGlossaryTermsResult = {
  glossaryTerms: GlossaryTerm[];
  wroteToDatabase: boolean;
  preview: GlossaryPersistencePreview;
};

export type GlossaryDataSource = "glossary_tables" | "legacy_payload_fallback";

export type GlossaryReadDiagnostics = {
  glossaryTableCount: number;
  legacyPayloadCount: number;
  usedFallback: boolean;
};

export type GlossaryReadResult = {
  glossaryTerms: GlossaryTerm[];
  glossaryDataSource: GlossaryDataSource;
  diagnostics: GlossaryReadDiagnostics;
};

export type GlossaryBackfillPreview = {
  contentId: string;
  legacyPayloadCount: number;
  existingTableCount: number;
  wouldInsertTerms: number;
  wouldInsertContentTerms: number;
  wouldInsertOccurrences: number;
  wouldInsertExplanations: number;
  wouldUpdateContentTerms: number;
  wouldSkip: number;
  skippedDuplicates: number;
};

const LOCAL_GLOSSARY_FEEDBACK_USER_ID = "local-user";
const SUPABASE_IN_QUERY_CHUNK_SIZE = 25;

function isRecord(value: Json | null | undefined): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toContentPayload(value: Json | null | undefined): ContentPayload {
  if (!isRecord(value)) {
    return {};
  }

  return value as unknown as ContentPayload;
}

function chunkArray<T>(items: T[], size = SUPABASE_IN_QUERY_CHUNK_SIZE) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function mapUiCategoryToDbCategory(category?: GlossaryTerm["category"]) {
  switch (category) {
    case "concept":
      return "technical_concept";
    case "product":
      return "product_name";
    case "organization":
      return "company_name";
    case "method":
      return "framework";
    case "abbreviation":
      return "industry_term";
    case "person":
      return "other";
    case "technical_concept":
    case "product_name":
    case "company_name":
    case "model_name":
    case "framework":
    case "event":
    case "industry_term":
    case "other":
      return category;
    default:
      return "other";
  }
}

function mapDbCategoryToUiCategory(category: string | null | undefined): GlossaryTerm["category"] {
  switch (category) {
    case "technical_concept":
    case "product_name":
    case "company_name":
    case "model_name":
    case "framework":
    case "event":
    case "industry_term":
    case "other":
      return category;
    default:
      return "other";
  }
}

function normalizeGlossaryOccurrences(term: GlossaryTerm): GlossaryOccurrence[] {
  if (Array.isArray(term.occurrences) && term.occurrences.length > 0) {
    return term.occurrences
      .filter((occurrence) => typeof occurrence.blockId === "string" && occurrence.blockId.trim())
      .map((occurrence) => ({
        id: occurrence.id,
        blockId: occurrence.blockId,
        startOffset: occurrence.startOffset ?? null,
        endOffset: occurrence.endOffset ?? null,
        matchedText: occurrence.matchedText || term.term,
      }));
  }

  const blockIds = Array.from(
    new Set(
      [
        term.blockId,
        term.firstEvidenceBlockId,
        ...(term.evidenceBlockIds ?? []),
      ].filter((value): value is string => Boolean(value && value.trim())),
    ),
  );

  return blockIds.map((blockId) => ({
    blockId,
    startOffset: null,
    endOffset: null,
    matchedText: term.term,
  }));
}

function buildCompatibilityGlossaryPayloadTerms(contentId: string, glossaryTerms: GlossaryTerm[]) {
  return glossaryTerms.map((term) => normalizeGlossaryTermRecord(term, contentId));
}

function mergeGlossaryTermsByNormalizedTerm(
  glossaryTerms: GlossaryTerm[],
  contentId: string,
) {
  const mergedByNormalized = new Map<string, GlossaryTerm>();

  for (const rawTerm of glossaryTerms) {
    const term = normalizeGlossaryTermRecord(
      {
        ...rawTerm,
        contentId,
      },
      contentId,
    );
    const normalized =
      term.normalizedTerm || normalizeGlossaryTermText(term.term);
    const existing = mergedByNormalized.get(normalized);

    if (!existing) {
      mergedByNormalized.set(normalized, term);
      continue;
    }

    const mergedOccurrences = [
      ...(existing.occurrences ?? []),
      ...(term.occurrences ?? []),
    ];
    const mergedEvidenceBlockIds = Array.from(
      new Set([...(existing.evidenceBlockIds ?? []), ...(term.evidenceBlockIds ?? [])]),
    );
    const mergedAliases = Array.from(
      new Set([...(existing.aliases ?? []), ...(term.aliases ?? [])]),
    ).slice(0, 3);
    const preferredTerm =
      existing.source === "user_added" ? existing : term.source === "user_added" ? term : existing;
    const preferredExplanation =
      existing.explanationStatus === "ready" && existing.explanation
        ? existing.explanation
        : term.explanationStatus === "ready" && term.explanation
          ? term.explanation
          : existing.explanation ?? term.explanation ?? null;

    mergedByNormalized.set(
      normalized,
      normalizeGlossaryTermRecord(
        {
          ...preferredTerm,
          id: preferredTerm.id || existing.id,
          termId: preferredTerm.termId || existing.termId || term.termId,
          contentGlossaryTermId:
            existing.contentGlossaryTermId || term.contentGlossaryTermId,
          term: preferredTerm.term || existing.term || term.term,
          normalizedTerm: normalized,
          aliases: mergedAliases,
          definition:
            preferredExplanation?.definition ||
            existing.definition ||
            term.definition ||
            "",
          contextExample:
            preferredExplanation?.evidence ||
            existing.contextExample ||
            term.contextExample ||
            "",
          explanation:
            preferredExplanation ||
            existing.explanation ||
            term.explanation ||
            null,
          source:
            existing.source === "user_added" || term.source === "user_added"
              ? "user_added"
              : existing.source || term.source || "auto",
          confidence:
            existing.confidence === "high" || term.confidence === "high"
              ? "high"
              : existing.confidence === "medium" || term.confidence === "medium"
                ? "medium"
                : existing.confidence || term.confidence,
          evidenceSnippet:
            existing.evidenceSnippet || term.evidenceSnippet || "",
          blockId:
            existing.blockId ||
            term.blockId ||
            existing.firstEvidenceBlockId ||
            term.firstEvidenceBlockId ||
            "",
          firstEvidenceBlockId:
            existing.firstEvidenceBlockId ||
            term.firstEvidenceBlockId ||
            existing.blockId ||
            term.blockId ||
            "",
          occurrenceCount: Math.max(
            existing.occurrenceCount,
            term.occurrenceCount,
            mergedOccurrences.length,
            mergedEvidenceBlockIds.length,
          ),
          evidenceBlockIds: mergedEvidenceBlockIds,
          occurrences: mergedOccurrences,
          explanationStatus:
            existing.explanationStatus === "ready" || term.explanationStatus === "ready"
              ? "ready"
              : existing.explanationStatus === "generating" ||
                  term.explanationStatus === "generating"
                ? "generating"
                : existing.explanationStatus === "failed" &&
                    term.explanationStatus === "failed"
                  ? "failed"
                  : existing.explanationStatus || term.explanationStatus || "pending",
          highlightEnabled:
            existing.highlightEnabled === true || term.highlightEnabled === true,
          displayStatus:
            existing.displayStatus === "highlighted" || term.displayStatus === "highlighted"
              ? "highlighted"
              : existing.displayStatus === "hidden" && term.displayStatus === "hidden"
                ? "hidden"
                : existing.displayStatus || term.displayStatus || "inventory_only",
          displayReason:
            existing.displayReason || term.displayReason,
          hiddenReason:
            existing.hiddenReason || term.hiddenReason,
          isStarred: existing.isStarred === true || term.isStarred === true,
          userFeedback:
            existing.userFeedback === "starred" || term.userFeedback === "starred"
              ? "starred"
              : existing.userFeedback === "hidden" || term.userFeedback === "hidden"
                ? "hidden"
                : existing.userFeedback === "incorrect" || term.userFeedback === "incorrect"
                  ? "incorrect"
                  : existing.userFeedback === "not_needed" || term.userFeedback === "not_needed"
                    ? "not_needed"
                    : existing.userFeedback === "none" || term.userFeedback === "none"
                      ? "none"
                      : existing.userFeedback || term.userFeedback,
          feedbackUpdatedAt:
            existing.feedbackUpdatedAt || term.feedbackUpdatedAt,
          createdAt: existing.createdAt || term.createdAt,
          updatedAt: term.updatedAt || existing.updatedAt,
        },
        contentId,
      ),
    );
  }

  return Array.from(mergedByNormalized.values());
}

async function updateCompatibilityGlossaryPayload(
  content: ContentRow,
  glossaryTerms: GlossaryTerm[],
) {
  const payload = toContentPayload(content.content_payload);
  const updatedPayload = {
    ...payload,
    glossaryTerms: buildCompatibilityGlossaryPayloadTerms(content.id, glossaryTerms),
  } as Json;

  const { error } = await supabaseAdmin
    .from("contents")
    .update({
      content_payload: updatedPayload,
    })
    .eq("id", content.id);

  if (error) {
    throw error;
  }
}

function buildGlossaryTermFromRows({
  contentId,
  contentGlossaryTerm,
  glossaryTerm,
  occurrences,
  explanation,
  feedback,
}: {
  contentId: string;
  contentGlossaryTerm: ContentGlossaryTermRow;
  glossaryTerm: GlossaryTermRow | undefined;
  occurrences: GlossaryOccurrenceRow[];
  explanation: GlossaryExplanationRow | undefined;
  feedback: UserGlossaryFeedbackRow | undefined;
}) {
  const normalizedTerm =
    glossaryTerm?.normalized_term || normalizeGlossaryTermText(contentGlossaryTerm.term_text);
  const explanationPayload = explanation
    ? {
        definition: explanation.definition,
        whyItMatters: explanation.why_it_matters,
        evidence: explanation.evidence,
        aliases: sanitizeGlossaryAliases(explanation.aliases),
      }
    : null;

  return normalizeGlossaryTermRecord(
    {
      id: contentGlossaryTerm.id,
      contentGlossaryTermId: contentGlossaryTerm.id,
      termId: contentGlossaryTerm.glossary_term_id,
      contentId,
      term: contentGlossaryTerm.term_text || glossaryTerm?.canonical_term || normalizedTerm,
      normalizedTerm,
      category: mapDbCategoryToUiCategory(glossaryTerm?.category),
      source:
        contentGlossaryTerm.source === "user_added" ? "user_added" : "auto",
      confidence:
        contentGlossaryTerm.confidence === "high" ||
        contentGlossaryTerm.confidence === "medium" ||
        contentGlossaryTerm.confidence === "low"
          ? contentGlossaryTerm.confidence
          : undefined,
      evidenceSnippet: contentGlossaryTerm.evidence_snippet || undefined,
      blockId: contentGlossaryTerm.first_evidence_block_id || undefined,
      firstEvidenceBlockId: contentGlossaryTerm.first_evidence_block_id || undefined,
      occurrenceCount: contentGlossaryTerm.occurrence_count,
      evidenceBlockIds: occurrences.map((occurrence) => occurrence.block_id),
      occurrences: occurrences.map((occurrence) => ({
        id: occurrence.id,
        blockId: occurrence.block_id,
        startOffset: occurrence.start_offset,
        endOffset: occurrence.end_offset,
        matchedText: occurrence.matched_text || undefined,
      })),
      explanationStatus:
        contentGlossaryTerm.explanation_status === "ready" ||
        contentGlossaryTerm.explanation_status === "pending" ||
        contentGlossaryTerm.explanation_status === "generating" ||
        contentGlossaryTerm.explanation_status === "failed"
          ? contentGlossaryTerm.explanation_status
          : "pending",
      explanation: explanationPayload,
      highlightEnabled: contentGlossaryTerm.highlight_enabled,
      displayStatus:
        contentGlossaryTerm.display_status === "highlighted" ||
        contentGlossaryTerm.display_status === "inventory_only" ||
        contentGlossaryTerm.display_status === "hidden"
          ? contentGlossaryTerm.display_status
          : "inventory_only",
      displayReason: contentGlossaryTerm.display_reason || undefined,
      hiddenReason: contentGlossaryTerm.hidden_reason || undefined,
      isStarred: feedback?.feedback_type === "starred",
      userFeedback:
        feedback?.feedback_type === "starred" ||
        feedback?.feedback_type === "hidden" ||
        feedback?.feedback_type === "incorrect" ||
        feedback?.feedback_type === "not_needed" ||
        feedback?.feedback_type === "none"
          ? feedback.feedback_type
          : undefined,
      feedbackUpdatedAt: feedback?.updated_at || undefined,
      createdAt: contentGlossaryTerm.created_at,
      updatedAt: contentGlossaryTerm.updated_at,
    },
    contentId,
  );
}

function buildGlossaryTermsFromTableRows({
  content,
  rows,
}: {
  content: ContentRow;
  rows: Awaited<ReturnType<typeof loadGlossaryRowsForContent>>;
}) {
  const glossaryTermById = new Map(rows.glossaryTerms.map((row) => [row.id, row] as const));
  const occurrencesByContentGlossaryTermId = new Map<string, GlossaryOccurrenceRow[]>();
  const explanationByContentGlossaryTermId = new Map<string, GlossaryExplanationRow>();
  const feedbackByContentGlossaryTermId = new Map<string, UserGlossaryFeedbackRow>();

  for (const occurrence of rows.occurrences) {
    const existing = occurrencesByContentGlossaryTermId.get(occurrence.content_glossary_term_id) ?? [];
    existing.push(occurrence);
    occurrencesByContentGlossaryTermId.set(occurrence.content_glossary_term_id, existing);
  }

  for (const explanation of rows.explanations) {
    explanationByContentGlossaryTermId.set(explanation.content_glossary_term_id, explanation);
  }

  for (const feedback of rows.feedback) {
    feedbackByContentGlossaryTermId.set(feedback.content_glossary_term_id, feedback);
  }

  return rows.contentGlossaryTerms.map((contentGlossaryTerm) =>
    buildGlossaryTermFromRows({
      contentId: content.id,
      contentGlossaryTerm,
      glossaryTerm: glossaryTermById.get(contentGlossaryTerm.glossary_term_id),
      occurrences:
        occurrencesByContentGlossaryTermId.get(contentGlossaryTerm.id) ?? [],
      explanation: explanationByContentGlossaryTermId.get(contentGlossaryTerm.id),
      feedback: feedbackByContentGlossaryTermId.get(contentGlossaryTerm.id),
    }),
  );
}

async function loadGlossaryRowsForContent(contentId: string) {
  const [
    contentGlossaryTermsResult,
    occurrencesResult,
    explanationsResult,
    feedbackResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("content_glossary_terms")
      .select("*")
      .eq("content_id", contentId),
    supabaseAdmin
      .from("glossary_occurrences")
      .select("*")
      .eq("content_id", contentId),
    supabaseAdmin
      .from("glossary_explanations")
      .select("*"),
    supabaseAdmin
      .from("user_glossary_feedback")
      .select("*")
      .eq("content_id", contentId)
      .eq("user_id", LOCAL_GLOSSARY_FEEDBACK_USER_ID),
  ]);

  if (contentGlossaryTermsResult.error) {
    throw contentGlossaryTermsResult.error;
  }

  if (occurrencesResult.error) {
    throw occurrencesResult.error;
  }

  if (explanationsResult.error) {
    throw explanationsResult.error;
  }

  if (feedbackResult.error) {
    throw feedbackResult.error;
  }

  const contentGlossaryTerms = contentGlossaryTermsResult.data ?? [];

  if (contentGlossaryTerms.length === 0) {
    return {
      contentGlossaryTerms,
      glossaryTerms: [] as GlossaryTermRow[],
      occurrences: occurrencesResult.data ?? [],
      explanations: explanationsResult.data ?? [],
      feedback: feedbackResult.data ?? [],
    };
  }

  const glossaryTermIds = Array.from(
    new Set(contentGlossaryTerms.map((row) => row.glossary_term_id)),
  );
  const glossaryTermChunks = chunkArray(glossaryTermIds);
  const glossaryTerms: GlossaryTermRow[] = [];

  for (const glossaryTermChunk of glossaryTermChunks) {
    const glossaryTermsResult = await supabaseAdmin
      .from("glossary_terms")
      .select("*")
      .in("id", glossaryTermChunk);

    if (glossaryTermsResult.error) {
      throw glossaryTermsResult.error;
    }

    glossaryTerms.push(...(glossaryTermsResult.data ?? []));
  }

  return {
    contentGlossaryTerms,
    glossaryTerms,
    occurrences: occurrencesResult.data ?? [],
    explanations: explanationsResult.data ?? [],
    feedback: feedbackResult.data ?? [],
  };
}

function buildPreview({
  glossaryTerms,
  existingGlobalTerms,
  existingContentGlossaryTerms,
  existingExplanations,
}: {
  glossaryTerms: GlossaryTerm[];
  existingGlobalTerms: GlossaryTermRow[];
  existingContentGlossaryTerms: ContentGlossaryTermRow[];
  existingExplanations: GlossaryExplanationRow[];
}): GlossaryPersistencePreview {
  const existingGlobalByNormalized = new Map(
    existingGlobalTerms.map((row) => [row.normalized_term, row] as const),
  );
  const existingContentByPair = new Map(
    existingContentGlossaryTerms.map((row) => [`${row.content_id}:${row.glossary_term_id}`, row] as const),
  );
  const existingExplanationsByContentGlossaryTermId = new Map(
    existingExplanations.map((row) => [row.content_glossary_term_id, row] as const),
  );

  let glossaryTermInserts = 0;
  let glossaryTermUpdates = 0;
  let contentGlossaryTermInserts = 0;
  let contentGlossaryTermUpdates = 0;
  let occurrenceInserts = 0;
  let explanationInserts = 0;
  let explanationUpdates = 0;
  let feedbackUpserts = 0;

  for (const term of glossaryTerms) {
    const normalized = term.normalizedTerm || normalizeGlossaryTermText(term.term);
    const existingGlobal = existingGlobalByNormalized.get(normalized);

    if (!existingGlobal) {
      glossaryTermInserts += 1;
    } else if (
      existingGlobal.canonical_term !== term.term ||
      existingGlobal.category !== mapUiCategoryToDbCategory(term.category)
    ) {
      glossaryTermUpdates += 1;
    }

    const pairKey = `${term.contentId}:${existingGlobal?.id ?? normalized}`;
    const existingContentGlossaryTerm = Array.from(existingContentByPair.values()).find(
      (row) => row.content_id === term.contentId && row.term_text === term.term,
    );

    if (!existingContentGlossaryTerm) {
      contentGlossaryTermInserts += 1;
    } else {
      contentGlossaryTermUpdates += 1;
    }

    occurrenceInserts += normalizeGlossaryOccurrences(term).length;

    const explanation = sanitizeGlossaryExplanation(term.explanation);

    if (explanation || term.definition || term.contextExample) {
      if (
        existingContentGlossaryTerm &&
        existingExplanationsByContentGlossaryTermId.has(existingContentGlossaryTerm.id)
      ) {
        explanationUpdates += 1;
      } else {
        explanationInserts += 1;
      }
    }

    if (term.userFeedback || term.isStarred) {
      feedbackUpserts += 1;
    }

    void pairKey;
  }

  return {
    glossaryTermInserts,
    glossaryTermUpdates,
    contentGlossaryTermInserts,
    contentGlossaryTermUpdates,
    occurrenceInserts,
    explanationInserts,
    explanationUpdates,
    feedbackUpserts,
  };
}

export async function getContentRowById(contentId: string) {
  const { data, error } = await supabaseAdmin
    .from("contents")
    .select("*")
    .eq("id", contentId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export function getNormalizedGlossaryTermsFromPayload(
  payload: Json | null | undefined,
  contentId: string,
) {
  return normalizeGlossaryTermsArray(toContentPayload(payload).glossaryTerms, contentId);
}

export async function readGlossaryTermsForContent(
  content: ContentRow,
): Promise<GlossaryReadResult> {
  const rows = await loadGlossaryRowsForContent(content.id);
  const legacyGlossaryTerms = getNormalizedGlossaryTermsFromPayload(
    content.content_payload,
    content.id,
  );

  if (rows.contentGlossaryTerms.length === 0) {
    return {
      glossaryTerms: legacyGlossaryTerms,
      glossaryDataSource: "legacy_payload_fallback",
      diagnostics: {
        glossaryTableCount: 0,
        legacyPayloadCount: legacyGlossaryTerms.length,
        usedFallback: true,
      },
    };
  }

  return {
    glossaryTerms: buildGlossaryTermsFromTableRows({
      content,
      rows,
    }),
    glossaryDataSource: "glossary_tables",
    diagnostics: {
      glossaryTableCount: rows.contentGlossaryTerms.length,
      legacyPayloadCount: legacyGlossaryTerms.length,
      usedFallback: false,
    },
  };
}

export async function getGlossaryTermsForContent(content: ContentRow) {
  const result = await readGlossaryTermsForContent(content);
  return result.glossaryTerms;
}

export async function getContentGlossaryContext(content: ContentRow) {
  const payload = toContentPayload(content.content_payload);

  return {
    content,
    payload,
    title: content.title,
    platform: content.platform,
    generatedSummary:
      typeof payload.generatedSummary === "string"
        ? payload.generatedSummary
        : content.summary,
    keywords: Array.isArray(payload.keywords) ? payload.keywords : ([] as Keyword[]),
    sections: Array.isArray(payload.sections) ? payload.sections : ([] as Section[]),
    transcriptBlocks: Array.isArray(payload.transcriptBlocks)
      ? payload.transcriptBlocks
      : ([] as TranscriptBlock[]),
    glossaryTerms: await getGlossaryTermsForContent(content),
  };
}

export async function persistGlossaryTermsForContent(
  contentId: string,
  glossaryTerms: GlossaryTerm[],
  options: PersistGlossaryTermsOptions = {},
): Promise<PersistGlossaryTermsResult> {
  const content = await getContentRowById(contentId);

  if (!content) {
    throw new Error("内容不存在。");
  }

  const normalizedTerms = mergeGlossaryTermsByNormalizedTerm(glossaryTerms, contentId);
  const normalizedKeys = Array.from(
    new Set(
      normalizedTerms.map((term) => term.normalizedTerm || normalizeGlossaryTermText(term.term)),
    ),
  );

  const existingGlobalTerms: GlossaryTermRow[] = [];
  for (const normalizedChunk of chunkArray(normalizedKeys)) {
    const existingGlobalTermsResult = await supabaseAdmin
      .from("glossary_terms")
      .select("*")
      .in("normalized_term", normalizedChunk);

    if (existingGlobalTermsResult.error) {
      throw existingGlobalTermsResult.error;
    }

    existingGlobalTerms.push(...(existingGlobalTermsResult.data ?? []));
  }

  const existingContentGlossaryTermsResult = await supabaseAdmin
    .from("content_glossary_terms")
    .select("*")
    .eq("content_id", contentId);

  if (existingContentGlossaryTermsResult.error) {
    throw existingContentGlossaryTermsResult.error;
  }

  const existingExplanationsResult = await supabaseAdmin
    .from("glossary_explanations")
    .select("*");

  if (existingExplanationsResult.error) {
    throw existingExplanationsResult.error;
  }

  const existingFeedbackResult = await supabaseAdmin
    .from("user_glossary_feedback")
    .select("*")
    .eq("content_id", contentId)
    .eq("user_id", LOCAL_GLOSSARY_FEEDBACK_USER_ID);

  if (existingFeedbackResult.error) {
    throw existingFeedbackResult.error;
  }

  const preview = buildPreview({
    glossaryTerms: normalizedTerms,
    existingGlobalTerms,
    existingContentGlossaryTerms: existingContentGlossaryTermsResult.data ?? [],
    existingExplanations: existingExplanationsResult.data ?? [],
  });

  if (options.dryRun) {
    return {
      glossaryTerms: normalizedTerms,
      wroteToDatabase: false,
      preview,
    };
  }

  const globalRows = normalizedTerms.map((term) => ({
    normalized_term:
      term.normalizedTerm || normalizeGlossaryTermText(term.term),
    canonical_term: term.term,
    category: mapUiCategoryToDbCategory(term.category),
    updated_at: new Date().toISOString(),
  }));

  const upsertGlossaryTermsResult = await supabaseAdmin
    .from("glossary_terms")
    .upsert(globalRows, {
      onConflict: "normalized_term",
    })
    .select("*");

  if (upsertGlossaryTermsResult.error) {
    throw upsertGlossaryTermsResult.error;
  }

  const glossaryTermByNormalized = new Map(
    (upsertGlossaryTermsResult.data ?? []).map((row) => [row.normalized_term, row] as const),
  );

  const existingContentGlossaryTermsByGlossaryTermId = new Map(
    (existingContentGlossaryTermsResult.data ?? []).map((row) => [row.glossary_term_id, row] as const),
  );
  const contentGlossaryTermRows = normalizedTerms.map((term) => {
    const normalized = term.normalizedTerm || normalizeGlossaryTermText(term.term);
    const globalTerm = glossaryTermByNormalized.get(normalized);

    if (!globalTerm) {
      throw new Error(`缺少全局术语节点：${term.term}`);
    }

    return {
      id: existingContentGlossaryTermsByGlossaryTermId.get(globalTerm.id)?.id,
      content_id: contentId,
      glossary_term_id: globalTerm.id,
      term_text: term.term,
      source: term.source || "auto",
      confidence: term.confidence || null,
      evidence_snippet: term.evidenceSnippet || null,
      first_evidence_block_id:
        term.firstEvidenceBlockId || term.blockId || term.evidenceBlockIds[0] || null,
      occurrence_count: term.occurrenceCount,
      explanation_status: term.explanationStatus || "pending",
      highlight_enabled: term.highlightEnabled === true,
      display_status: term.displayStatus || "inventory_only",
      display_reason: term.displayReason || null,
      hidden_reason: term.hiddenReason || null,
      updated_at: new Date().toISOString(),
    };
  });

  const updatedContentGlossaryTerms: ContentGlossaryTermRow[] = [];
  const insertContentGlossaryTermRows = contentGlossaryTermRows.filter((row) => !row.id);
  const updateContentGlossaryTermRows = contentGlossaryTermRows.filter((row) => Boolean(row.id));

  for (const row of updateContentGlossaryTermRows) {
    const { id, ...updatePayload } = row;
    const { data, error } = await supabaseAdmin
      .from("content_glossary_terms")
      .update(updatePayload)
      .eq("id", id as string)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    updatedContentGlossaryTerms.push(data);
  }

  if (insertContentGlossaryTermRows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("content_glossary_terms")
      .insert(
        insertContentGlossaryTermRows.map(({ id: _id, ...insertPayload }) => insertPayload),
      )
      .select("*");

    if (error) {
      throw error;
    }

    updatedContentGlossaryTerms.push(...(data ?? []));
  }

  const contentGlossaryTermByNormalized = new Map<string, ContentGlossaryTermRow>();

  for (const row of updatedContentGlossaryTerms) {
    const globalTerm = glossaryTermByNormalized.get(
      normalizedTerms.find((term) => term.term === row.term_text)?.normalizedTerm || "",
    );

    if (globalTerm) {
      contentGlossaryTermByNormalized.set(globalTerm.normalized_term, row);
    } else {
      const matchedNormalized =
        normalizedTerms.find((term) => term.term === row.term_text)?.normalizedTerm ||
        normalizeGlossaryTermText(row.term_text);
      contentGlossaryTermByNormalized.set(matchedNormalized, row);
    }
  }

  const contentGlossaryTermIds = Array.from(
    new Set(updatedContentGlossaryTerms.map((row) => row.id)),
  );

  if (contentGlossaryTermIds.length > 0) {
    for (const contentGlossaryTermIdChunk of chunkArray(contentGlossaryTermIds)) {
      const { error: deleteOccurrencesError } = await supabaseAdmin
        .from("glossary_occurrences")
        .delete()
        .in("content_glossary_term_id", contentGlossaryTermIdChunk);

      if (deleteOccurrencesError) {
        throw deleteOccurrencesError;
      }
    }
  }

  const occurrenceRows = normalizedTerms.flatMap((term) => {
    const normalized = term.normalizedTerm || normalizeGlossaryTermText(term.term);
    const contentGlossaryTerm = contentGlossaryTermByNormalized.get(normalized);

    if (!contentGlossaryTerm) {
      return [] as Database["public"]["Tables"]["glossary_occurrences"]["Insert"][];
    }

    return normalizeGlossaryOccurrences(term)
      .filter((occurrence) => occurrence.blockId)
      .map((occurrence) => ({
        content_glossary_term_id: contentGlossaryTerm.id,
        content_id: contentId,
        block_id: occurrence.blockId,
        start_offset: occurrence.startOffset ?? null,
        end_offset: occurrence.endOffset ?? null,
        matched_text: occurrence.matchedText || term.term,
      }));
  });

  if (occurrenceRows.length > 0) {
    const { error: insertOccurrencesError } = await supabaseAdmin
      .from("glossary_occurrences")
      .insert(occurrenceRows);

    if (insertOccurrencesError) {
      throw insertOccurrencesError;
    }
  }

  const explanationRows = normalizedTerms
    .map((term) => {
      const normalized = term.normalizedTerm || normalizeGlossaryTermText(term.term);
      const contentGlossaryTerm = contentGlossaryTermByNormalized.get(normalized);
      const explanation =
        sanitizeGlossaryExplanation(term.explanation) ??
        (term.definition || term.contextExample
          ? {
              definition: term.definition || "",
              whyItMatters: "",
              evidence: term.contextExample || "",
              aliases: term.aliases ?? [],
            }
          : null);

      if (!contentGlossaryTerm || !explanation) {
        return null;
      }

      return {
        content_glossary_term_id: contentGlossaryTerm.id,
        definition: explanation.definition,
        why_it_matters: explanation.whyItMatters,
        evidence: explanation.evidence,
        aliases: explanation.aliases as unknown as Json,
        provider: null,
        model: null,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (explanationRows.length > 0) {
    const existingExplanationsByContentGlossaryTermId = new Map(
      (existingExplanationsResult.data ?? []).map((row) => [row.content_glossary_term_id, row] as const),
    );

    for (const row of explanationRows) {
      const existingExplanation = existingExplanationsByContentGlossaryTermId.get(
        row.content_glossary_term_id,
      );

      if (existingExplanation) {
        const { error } = await supabaseAdmin
          .from("glossary_explanations")
          .update(row)
          .eq("content_glossary_term_id", row.content_glossary_term_id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabaseAdmin
          .from("glossary_explanations")
          .insert(row);

        if (error) {
          throw error;
        }
      }
    }
  }

  const feedbackRows = normalizedTerms
    .map((term) => {
      const normalized = term.normalizedTerm || normalizeGlossaryTermText(term.term);
      const contentGlossaryTerm = contentGlossaryTermByNormalized.get(normalized);

      if (!contentGlossaryTerm || (!term.userFeedback && !term.isStarred)) {
        return null;
      }

      return {
        user_id: LOCAL_GLOSSARY_FEEDBACK_USER_ID,
        content_id: contentId,
        glossary_term_id: contentGlossaryTerm.glossary_term_id,
        content_glossary_term_id: contentGlossaryTerm.id,
        feedback_type: term.isStarred ? "starred" : term.userFeedback || "none",
        user_note: null,
        updated_at: new Date().toISOString(),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (feedbackRows.length > 0) {
    const existingFeedbackByContentGlossaryTermId = new Map(
      (existingFeedbackResult.data ?? []).map((row) => [row.content_glossary_term_id, row] as const),
    );

    for (const row of feedbackRows) {
      const existingFeedback = existingFeedbackByContentGlossaryTermId.get(
        row.content_glossary_term_id,
      );

      if (existingFeedback) {
        const { error } = await supabaseAdmin
          .from("user_glossary_feedback")
          .update({
            feedback_type: row.feedback_type,
            user_note: row.user_note,
            updated_at: row.updated_at,
          })
          .eq("id", existingFeedback.id);

        if (error) {
          throw error;
        }
      } else {
        const { error } = await supabaseAdmin
          .from("user_glossary_feedback")
          .insert(row);

        if (error) {
          throw error;
        }
      }
    }
  }

  if (options.writeCompatibilityPayload !== false) {
    await updateCompatibilityGlossaryPayload(content, normalizedTerms);
  }

  return {
    glossaryTerms: await getGlossaryTermsForContent(content),
    wroteToDatabase: true,
    preview,
  };
}

export async function previewGlossaryPersistenceForContent(
  contentId: string,
  glossaryTerms: GlossaryTerm[],
) {
  return persistGlossaryTermsForContent(contentId, glossaryTerms, {
    dryRun: true,
    writeCompatibilityPayload: false,
  });
}

function normalizeOccurrenceKey(occurrence: GlossaryOccurrence) {
  return [
    occurrence.blockId || "",
    occurrence.startOffset ?? "",
    occurrence.endOffset ?? "",
    occurrence.matchedText || "",
  ].join("::");
}

function hasContentGlossaryTermDiff(
  existingRow: ContentGlossaryTermRow,
  term: GlossaryTerm,
) {
  const nextFirstEvidenceBlockId =
    term.firstEvidenceBlockId || term.blockId || term.evidenceBlockIds[0] || null;

  return (
    existingRow.term_text !== term.term ||
    existingRow.source !== (term.source || "auto") ||
    existingRow.confidence !== (term.confidence || null) ||
    existingRow.evidence_snippet !== (term.evidenceSnippet || null) ||
    existingRow.first_evidence_block_id !== nextFirstEvidenceBlockId ||
    existingRow.occurrence_count !== term.occurrenceCount ||
    existingRow.explanation_status !== (term.explanationStatus || "pending") ||
    existingRow.highlight_enabled !== (term.highlightEnabled === true) ||
    existingRow.display_status !== (term.displayStatus || "inventory_only") ||
    existingRow.display_reason !== (term.displayReason || null) ||
    existingRow.hidden_reason !== (term.hiddenReason || null)
  );
}

export async function previewLegacyGlossaryBackfill(
  contentId: string,
): Promise<GlossaryBackfillPreview> {
  const content = await getContentRowById(contentId);

  if (!content) {
    throw new Error("内容不存在。");
  }

  const legacyGlossaryTerms = getNormalizedGlossaryTermsFromPayload(
    content.content_payload,
    content.id,
  );
  const normalizedTerms = mergeGlossaryTermsByNormalizedTerm(
    legacyGlossaryTerms,
    contentId,
  );
  const rows = await loadGlossaryRowsForContent(content.id);
  const normalizedKeys = Array.from(
    new Set(
      normalizedTerms.map((term) => term.normalizedTerm || normalizeGlossaryTermText(term.term)),
    ),
  );

  const existingGlobalTerms: GlossaryTermRow[] = [];
  for (const normalizedChunk of chunkArray(normalizedKeys)) {
    const result = await supabaseAdmin
      .from("glossary_terms")
      .select("*")
      .in("normalized_term", normalizedChunk);

    if (result.error) {
      throw result.error;
    }

    existingGlobalTerms.push(...(result.data ?? []));
  }

  const existingGlobalByNormalized = new Map(
    existingGlobalTerms.map((row) => [row.normalized_term, row] as const),
  );
  const existingContentByGlossaryTermId = new Map(
    rows.contentGlossaryTerms.map((row) => [row.glossary_term_id, row] as const),
  );
  const existingOccurrencesByContentGlossaryTermId = new Map<string, Set<string>>();
  const existingExplanationsByContentGlossaryTermId = new Map(
    rows.explanations.map((row) => [row.content_glossary_term_id, row] as const),
  );

  for (const occurrence of rows.occurrences) {
    const key = normalizeOccurrenceKey({
      blockId: occurrence.block_id,
      startOffset: occurrence.start_offset,
      endOffset: occurrence.end_offset,
      matchedText: occurrence.matched_text || "",
    });
    const existing =
      existingOccurrencesByContentGlossaryTermId.get(occurrence.content_glossary_term_id) ??
      new Set<string>();
    existing.add(key);
    existingOccurrencesByContentGlossaryTermId.set(
      occurrence.content_glossary_term_id,
      existing,
    );
  }

  let wouldInsertTerms = 0;
  let wouldInsertContentTerms = 0;
  let wouldInsertOccurrences = 0;
  let wouldInsertExplanations = 0;
  let wouldUpdateContentTerms = 0;
  let skippedDuplicates = 0;

  for (const term of normalizedTerms) {
    const normalized = term.normalizedTerm || normalizeGlossaryTermText(term.term);
    const existingGlobal = existingGlobalByNormalized.get(normalized);

    if (!existingGlobal) {
      wouldInsertTerms += 1;
    }

    const existingContentTerm = existingGlobal
      ? existingContentByGlossaryTermId.get(existingGlobal.id)
      : null;

    if (!existingContentTerm) {
      wouldInsertContentTerms += 1;
      wouldInsertOccurrences += normalizeGlossaryOccurrences(term).filter(
        (occurrence) => occurrence.blockId,
      ).length;
    } else {
      if (hasContentGlossaryTermDiff(existingContentTerm, term)) {
        wouldUpdateContentTerms += 1;
      } else {
        skippedDuplicates += 1;
      }

      const existingOccurrenceKeys =
        existingOccurrencesByContentGlossaryTermId.get(existingContentTerm.id) ?? new Set<string>();

      for (const occurrence of normalizeGlossaryOccurrences(term)) {
        if (!occurrence.blockId) {
          continue;
        }

        const occurrenceKey = normalizeOccurrenceKey(occurrence);
        if (existingOccurrenceKeys.has(occurrenceKey)) {
          skippedDuplicates += 1;
        } else {
          wouldInsertOccurrences += 1;
        }
      }
    }

    const explanation =
      sanitizeGlossaryExplanation(term.explanation) ??
      (term.definition || term.contextExample
        ? {
            definition: term.definition || "",
            whyItMatters: "",
            evidence: term.contextExample || "",
            aliases: term.aliases ?? [],
          }
        : null);

    if (!explanation) {
      continue;
    }

    if (!existingContentTerm) {
      wouldInsertExplanations += 1;
      continue;
    }

    if (!existingExplanationsByContentGlossaryTermId.has(existingContentTerm.id)) {
      wouldInsertExplanations += 1;
    } else {
      skippedDuplicates += 1;
    }
  }

  return {
    contentId,
    legacyPayloadCount: legacyGlossaryTerms.length,
    existingTableCount: rows.contentGlossaryTerms.length,
    wouldInsertTerms,
    wouldInsertContentTerms,
    wouldInsertOccurrences,
    wouldInsertExplanations,
    wouldUpdateContentTerms,
    wouldSkip: skippedDuplicates,
    skippedDuplicates,
  };
}

export async function backfillLegacyGlossaryTermsForContent({
  contentId,
}: {
  contentId: string;
}) {
  const preview = await previewLegacyGlossaryBackfill(contentId);
  const hasWork =
    preview.wouldInsertTerms > 0 ||
    preview.wouldInsertContentTerms > 0 ||
    preview.wouldInsertOccurrences > 0 ||
    preview.wouldInsertExplanations > 0 ||
    preview.wouldUpdateContentTerms > 0;

  if (!hasWork) {
    return {
      glossaryTerms: [] as GlossaryTerm[],
      wroteToDatabase: false,
      preview: {
        glossaryTermInserts: 0,
        glossaryTermUpdates: 0,
        contentGlossaryTermInserts: 0,
        contentGlossaryTermUpdates: 0,
        occurrenceInserts: 0,
        explanationInserts: 0,
        explanationUpdates: 0,
        feedbackUpserts: 0,
      },
    };
  }

  const content = await getContentRowById(contentId);

  if (!content) {
    throw new Error("内容不存在。");
  }

  const legacyGlossaryTerms = getNormalizedGlossaryTermsFromPayload(
    content.content_payload,
    content.id,
  );

  return persistGlossaryTermsForContent(contentId, legacyGlossaryTerms, {
    dryRun: false,
    writeCompatibilityPayload: false,
  });
}

export async function updateGlossaryTermsForContent(
  contentId: string,
  glossaryTerms: GlossaryTerm[],
) {
  return persistGlossaryTermsForContent(contentId, glossaryTerms, {
    dryRun: false,
    writeCompatibilityPayload: true,
  });
}

export async function upsertGlossaryTermForContent({
  contentId,
  term,
  merge,
}: {
  contentId: string;
  term: GlossaryTerm;
  merge?: boolean;
}) {
  const content = await getContentRowById(contentId);

  if (!content) {
    throw new Error("内容不存在。");
  }

  const existingTerms = await getGlossaryTermsForContent(content);
  const normalizedTerm = term.normalizedTerm || normalizeGlossaryTermText(term.term);
  const matchIndex = merge
    ? existingTerms.findIndex((item) => item.normalizedTerm === normalizedTerm)
    : -1;
  const nextTerms = [...existingTerms];

  if (matchIndex >= 0) {
    const existing = nextTerms[matchIndex];
    nextTerms[matchIndex] = normalizeGlossaryTermRecord(
      {
        ...existing,
        ...term,
        contentGlossaryTermId: existing.contentGlossaryTermId || existing.id,
        evidenceBlockIds: Array.from(
          new Set([...(existing.evidenceBlockIds ?? []), ...(term.evidenceBlockIds ?? [])]),
        ),
        occurrences: [
          ...(existing.occurrences ?? []),
          ...(term.occurrences ?? []),
        ],
        occurrenceCount: Math.max(existing.occurrenceCount, term.occurrenceCount),
        updatedAt: new Date().toISOString(),
      },
      contentId,
    );
  } else {
    nextTerms.push(normalizeGlossaryTermRecord(term, contentId));
  }

  const persisted = await updateGlossaryTermsForContent(contentId, nextTerms);
  return persisted.glossaryTerms;
}
