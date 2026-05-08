import type {
  LibraryDisplayContentItem,
} from "./library-view-model";
import type {
  Keyword,
  KnowledgeItem,
  LibraryCategory,
  LibraryContentItem,
  LibraryTopic,
  RecentTopic,
} from "./mock-data";
import type { Database, Json } from "./supabase/types";
import { normalizeGlossaryTermsArray } from "./glossary-terms";
import {
  buildSectionsFromTimestampDirectory,
  postProcessTranscriptBlocks,
} from "./source-adapters/xiaoyuzhou";

type ContentRow = Database["public"]["Tables"]["contents"]["Row"];
type CategoryRow = Database["public"]["Tables"]["library_categories"]["Row"];
type TopicRow = Database["public"]["Tables"]["library_topics"]["Row"];
type AssignmentRow =
  Database["public"]["Tables"]["content_topic_assignments"]["Row"];

type ContentPayload = {
  generatedSummary?: string;
  keywords?: KnowledgeItem["keywords"];
  sections?: KnowledgeItem["sections"];
  chapters?: KnowledgeItem["chapters"];
  glossaryTerms?: KnowledgeItem["glossaryTerms"];
  transcriptBlocks?: KnowledgeItem["transcriptBlocks"];
  generationMetadata?: {
    llmProvider?: string;
    llmModel?: string;
    generatedAt?: string;
    stages?: {
      summaryKeywords?: {
        status?: "pending" | "running" | "succeeded" | "failed";
        startedAt?: string;
        completedAt?: string;
        updatedAt?: string;
        errorType?: string;
        errorMessage?: string;
        inputBlockCount?: number;
        inputCharCount?: number;
      };
      sections?: {
        status?: "pending" | "running" | "succeeded" | "failed";
      };
      glossary?: {
        status?: "pending" | "running" | "succeeded" | "failed";
      };
    };
  };
  sourceMetadata?: {
    audioUrl?: string;
    coverUrl?: string;
    transcriptSource?: "demo" | "existing_transcript" | "asr" | "asr_pending";
    asrProvider?: "dashscope-funasr";
  };
};

type LibraryRows = {
  categories: CategoryRow[];
  topics: TopicRow[];
  assignments: AssignmentRow[];
  contents: ContentRow[];
};

function getOptionalAssignmentStringField(row: object, key: string) {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalAssignmentBooleanField(row: object, key: string) {
  return (row as Record<string, unknown>)[key] === true;
}

function getOptionalAssignmentNumberField(row: object, key: string) {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assignmentSourcePriority(source: string) {
  switch (source) {
    case "user":
      return 4;
    case "llm":
      return 3;
    case "static_rule":
      return 2;
    case "mock_seed":
      return 1;
    default:
      return 0;
  }
}

function assignmentUpdatedAtTimestamp(assignment: AssignmentRow) {
  const archivedAt = getOptionalAssignmentStringField(assignment, "archived_at");
  const updatedAt = assignment.updated_at;
  const timestamp = archivedAt || updatedAt || assignment.created_at;
  const parsed = timestamp ? new Date(timestamp).getTime() : 0;

  return Number.isFinite(parsed) ? parsed : 0;
}

function comparePrimaryAssignments(first: AssignmentRow, second: AssignmentRow) {
  const firstSource = getOptionalAssignmentStringField(first, "source");
  const secondSource = getOptionalAssignmentStringField(second, "source");
  const firstIsUserSource = firstSource === "user";
  const secondIsUserSource = secondSource === "user";

  if (firstIsUserSource !== secondIsUserSource) {
    return Number(secondIsUserSource) - Number(firstIsUserSource);
  }

  const firstUserAdjusted = getOptionalAssignmentBooleanField(first, "user_adjusted");
  const secondUserAdjusted = getOptionalAssignmentBooleanField(second, "user_adjusted");

  if (firstUserAdjusted !== secondUserAdjusted) {
    return Number(secondUserAdjusted) - Number(firstUserAdjusted);
  }

  const firstSourcePriority = assignmentSourcePriority(firstSource);
  const secondSourcePriority = assignmentSourcePriority(secondSource);

  if (firstSourcePriority !== secondSourcePriority) {
    return secondSourcePriority - firstSourcePriority;
  }

  const firstConfidence = getOptionalAssignmentNumberField(first, "confidence") ?? 0;
  const secondConfidence = getOptionalAssignmentNumberField(second, "confidence") ?? 0;

  if (firstConfidence !== secondConfidence) {
    return secondConfidence - firstConfidence;
  }

  return assignmentUpdatedAtTimestamp(second) - assignmentUpdatedAtTimestamp(first);
}

function isRecord(value: Json): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPayload(value: Json): ContentPayload {
  if (!isRecord(value)) {
    return {};
  }

  return value as ContentPayload;
}

function isKeywordArray(value: unknown): value is Keyword[] {
  return Array.isArray(value);
}

function resolveContentSummary(payload: ContentPayload, row: ContentRow) {
  const generatedSummary =
    typeof payload.generatedSummary === "string"
      ? payload.generatedSummary.trim()
      : "";
  const rowSummary = row.summary?.trim() ?? "";

  return generatedSummary || rowSummary || "暂未提取到内容摘要。";
}

function resolveContentKeywords(payload: ContentPayload) {
  if (isKeywordArray(payload.keywords) && payload.keywords.length > 0) {
    return payload.keywords;
  }

  return [] as KnowledgeItem["keywords"];
}

function hasResolvedTranscript(row: ContentRow) {
  const payload = toPayload(row.content_payload);
  const transcriptBlocks = Array.isArray(payload.transcriptBlocks)
    ? payload.transcriptBlocks
    : [];

  return Boolean(
    transcriptBlocks.length > 0 &&
      (payload.sourceMetadata?.transcriptSource === "asr" ||
        payload.sourceMetadata?.transcriptSource === "existing_transcript"),
  );
}

function shouldHideFromLibrary(row: ContentRow) {
  const isXiaoyuzhouEpisode = row.source_url.includes("xiaoyuzhoufm.com/episode/");

  return isXiaoyuzhouEpisode && !hasResolvedTranscript(row);
}

export function buildContentPayloadFromMockItem(item: KnowledgeItem): Json {
  return {
    keywords: item.keywords,
    sections: item.sections,
    chapters: item.chapters,
    glossaryTerms: normalizeGlossaryTermsArray(item.glossaryTerms, item.id),
    transcriptBlocks: item.transcriptBlocks,
  } as Json;
}

export function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return value.slice(0, 10);
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.replace("T", " ").slice(0, 16);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function extractTopKeywords(
  contentPayload: Json,
  fallbackKeywords: string[] = [],
) {
  const payload = toPayload(contentPayload);

  if (isKeywordArray(payload.keywords) && payload.keywords.length > 0) {
    return payload.keywords
      .map((keyword) => keyword.term)
      .filter(Boolean)
      .slice(0, 5);
  }

  return fallbackKeywords.slice(0, 5);
}

export function mapContentRowToKnowledgeItem(
  row: ContentRow,
  options?: {
    glossaryTerms?: KnowledgeItem["glossaryTerms"];
  },
): KnowledgeItem {
  const payload = toPayload(row.content_payload);
  const transcriptBlocks = Array.isArray(payload.transcriptBlocks)
    ? postProcessTranscriptBlocks(payload.transcriptBlocks)
    : [];
  const shownoteSections = buildSectionsFromTimestampDirectory(
    row.summary,
    transcriptBlocks,
  );
  const sections =
    shownoteSections.length > 0 ? shownoteSections : (payload.sections ?? []);

  return {
    id: row.id,
    title: row.title,
    sourcePlatform: row.platform,
    sourceUrl: row.source_url,
    author: row.author ?? "",
    publishedAt: row.published_at ?? "",
    parsedAt: row.parsed_at,
    summary: resolveContentSummary(payload, row),
    keywords: resolveContentKeywords(payload),
    sections,
    chapters: payload.chapters ?? [],
    glossaryTerms:
      options?.glossaryTerms ??
      normalizeGlossaryTermsArray(payload.glossaryTerms, row.id),
    transcriptBlocks,
  };
}

function toLibraryContentItem({
  content,
  category,
  topic,
  assignment,
}: {
  content: ContentRow;
  category?: CategoryRow;
  topic?: TopicRow;
  assignment?: AssignmentRow;
}): LibraryDisplayContentItem {
  const fallbackKeywords = topic?.top_keywords ?? category?.top_keywords ?? [];
  const assignmentSource =
    assignment && getOptionalAssignmentStringField(assignment, "source");
  const assignmentReason =
    assignment &&
    getOptionalAssignmentStringField(assignment, "assignment_reason");
  const assignmentModel =
    assignment && getOptionalAssignmentStringField(assignment, "model");
  const assignmentArchivedAt =
    assignment && getOptionalAssignmentStringField(assignment, "archived_at");
  const assignmentStatus =
    assignment && getOptionalAssignmentStringField(assignment, "status");

  return {
    id: content.id,
    title: content.title,
    platform: content.platform,
    author: content.author ?? "未识别",
    summary: content.summary,
    categoryPath:
      category && topic ? `${category.name} / ${topic.name}` : "未归档",
    topKeywords: extractTopKeywords(content.content_payload, fallbackKeywords),
    parsedAt: formatDateTime(content.parsed_at),
    assignmentSource: assignmentSource || undefined,
    assignmentConfidence: assignment
      ? getOptionalAssignmentNumberField(assignment, "confidence")
      : null,
    assignmentReason: assignmentReason || undefined,
    assignmentModel: assignmentModel || undefined,
    assignmentArchivedAt: assignmentArchivedAt || undefined,
    assignmentStatus: assignmentStatus || undefined,
  };
}

export function mapLibraryRowsToResponse({
  categories,
  topics,
  assignments,
  contents,
}: LibraryRows): {
  libraryCategories: LibraryCategory[];
  recentTopics: RecentTopic[];
  recentContents: LibraryContentItem[];
  diagnostics: {
    totalAssignmentsCount: number;
    acceptedAssignmentsCount: number;
    dedupedContentCount: number;
    duplicateAssignmentContentCount: number;
    assignmentSourceBreakdown: Record<string, number>;
    primaryAssignmentRule: string;
    primaryAssignmentsPreview: Array<{
      contentId: string;
      topicId: string;
      source: string;
      status: string;
      confidence: number | null;
    }>;
  };
} {
  const visibleContents = contents.filter((content) => !shouldHideFromLibrary(content));
  const totalAssignmentsCount = assignments.length;
  const acceptedAssignments = assignments.filter(
    (assignment) => getOptionalAssignmentStringField(assignment, "status") === "accepted",
  );
  const acceptedAssignmentsCount = acceptedAssignments.length;

  if (visibleContents.length === 0) {
    return {
      libraryCategories: [],
      recentTopics: [],
      recentContents: [],
      diagnostics: {
        totalAssignmentsCount,
        acceptedAssignmentsCount,
        dedupedContentCount: 0,
        duplicateAssignmentContentCount: 0,
        assignmentSourceBreakdown: {},
        primaryAssignmentRule:
          "user > user_adjusted > llm > static_rule > mock_seed",
        primaryAssignmentsPreview: [],
      },
    };
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const contentById = new Map(visibleContents.map((content) => [content.id, content]));
  const assignmentsByTopicId = new Map<string, AssignmentRow[]>();
  const assignmentsByContentId = new Map<string, AssignmentRow[]>();

  for (const assignment of acceptedAssignments) {
    const existingByContent = assignmentsByContentId.get(assignment.content_id) ?? [];
    existingByContent.push(assignment);
    assignmentsByContentId.set(assignment.content_id, existingByContent);
  }

  const primaryAssignmentsByContentId = new Map<string, AssignmentRow>();
  const assignmentSourceBreakdown: Record<string, number> = {};
  let duplicateAssignmentContentCount = 0;

  for (const [contentId, contentAssignments] of assignmentsByContentId.entries()) {
    if (contentAssignments.length > 1) {
      duplicateAssignmentContentCount += 1;
    }

    const sortedAssignments = [...contentAssignments].sort(comparePrimaryAssignments);
    const primaryAssignment = sortedAssignments[0];

    if (!primaryAssignment) {
      continue;
    }

    primaryAssignmentsByContentId.set(contentId, primaryAssignment);
    const source = getOptionalAssignmentStringField(primaryAssignment, "source") || "unknown";
    assignmentSourceBreakdown[source] = (assignmentSourceBreakdown[source] ?? 0) + 1;

    const existingByTopic = assignmentsByTopicId.get(primaryAssignment.topic_id) ?? [];
    existingByTopic.push(primaryAssignment);
    assignmentsByTopicId.set(primaryAssignment.topic_id, existingByTopic);
  }

  const topicsByCategoryId = new Map<string, TopicRow[]>();

  for (const topic of topics) {
    const existing = topicsByCategoryId.get(topic.category_id) ?? [];
    existing.push(topic);
    topicsByCategoryId.set(topic.category_id, existing);
  }

  const libraryCategories = categories
    .map((category): LibraryCategory | null => {
      const categoryTopics = topicsByCategoryId.get(category.id) ?? [];
      const mappedTopics = categoryTopics
        .map((topic): LibraryTopic | null => {
          const topicAssignments = assignmentsByTopicId.get(topic.id) ?? [];
          const topicContents = topicAssignments
            .map((assignment) => ({
              assignment,
              content: contentById.get(assignment.content_id),
            }))
            .filter(
              (
                entry,
              ): entry is { assignment: AssignmentRow; content: ContentRow } =>
                Boolean(entry.content),
            )
            .map(({ assignment, content }) =>
              toLibraryContentItem({
                content,
                category,
                topic,
                assignment,
              }),
            );

          if (topicContents.length === 0) {
            return null;
          }

          return {
            id: topic.id,
            name: topic.name,
            contentCount: topicContents.length,
            topKeywords: topic.top_keywords,
            contents: topicContents,
          };
        })
        .filter((topic): topic is LibraryTopic => Boolean(topic));

      const categoryContentIds = new Set(
        mappedTopics.flatMap((topic) =>
          topic.contents.map((content) => content.id),
        ),
      );

      if (categoryContentIds.size === 0) {
        return null;
      }

      return {
        id: category.id,
        name: category.name,
        description: category.description,
        generatedReason: category.generated_reason,
        sourceContentCount: category.source_content_count,
        confidence: Number(category.confidence),
        lastAdjustedAt: formatDate(category.last_adjusted_at),
        contentCount: categoryContentIds.size,
        topicCount: mappedTopics.length,
        topKeywords: category.top_keywords,
        updatedAt: formatDate(category.updated_at),
        topics: mappedTopics,
      };
    })
    .filter((category): category is LibraryCategory => Boolean(category));

  const recentTopics = topics
    .map((topic): RecentTopic | null => {
      const relatedContentIds = (assignmentsByTopicId.get(topic.id) ?? [])
        .map((assignment) => assignment.content_id)
        .filter((contentId) => contentById.has(contentId));

      if (relatedContentIds.length === 0) {
        return null;
      }

      return {
        id: topic.id,
        name: topic.name,
        contentCount: relatedContentIds.length,
        relatedContentIds,
      };
    })
    .filter((topic): topic is RecentTopic => Boolean(topic))
    .sort((first, second) => second.contentCount - first.contentCount)
    .slice(0, 8);

  const recentContents = [...visibleContents]
    .sort(
      (first, second) =>
        new Date(second.parsed_at).getTime() - new Date(first.parsed_at).getTime(),
    )
    .slice(0, 8)
    .map((content) => {
      const assignment = primaryAssignmentsByContentId.get(content.id);
      const topic = assignment ? topicById.get(assignment.topic_id) : undefined;
      const category = topic ? categoryById.get(topic.category_id) : undefined;

      return toLibraryContentItem({
        content,
        category,
        topic,
        assignment,
      });
    });

  return {
    libraryCategories,
    recentTopics,
    recentContents,
    diagnostics: {
      totalAssignmentsCount,
      acceptedAssignmentsCount,
      dedupedContentCount: primaryAssignmentsByContentId.size,
      duplicateAssignmentContentCount,
      assignmentSourceBreakdown,
      primaryAssignmentRule:
        "user > user_adjusted > llm > static_rule > mock_seed",
      primaryAssignmentsPreview: Array.from(primaryAssignmentsByContentId.entries())
        .slice(0, 12)
        .map(([contentId, assignment]) => ({
          contentId,
          topicId: assignment.topic_id,
          source: getOptionalAssignmentStringField(assignment, "source") || "unknown",
          status: getOptionalAssignmentStringField(assignment, "status") || "unknown",
          confidence: getOptionalAssignmentNumberField(assignment, "confidence"),
        })),
    },
  };
}
