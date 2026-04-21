import type {
  Keyword,
  KnowledgeItem,
  LibraryCategory,
  LibraryContentItem,
  LibraryTopic,
  RecentTopic,
} from "./mock-data";
import type { Database, Json } from "./supabase/types";
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
  keywords?: KnowledgeItem["keywords"];
  sections?: KnowledgeItem["sections"];
  chapters?: KnowledgeItem["chapters"];
  glossaryTerms?: KnowledgeItem["glossaryTerms"];
  transcriptBlocks?: KnowledgeItem["transcriptBlocks"];
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
    glossaryTerms: item.glossaryTerms,
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

export function mapContentRowToKnowledgeItem(row: ContentRow): KnowledgeItem {
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
    summary: row.summary,
    keywords: payload.keywords ?? [],
    sections,
    chapters: payload.chapters ?? [],
    glossaryTerms: payload.glossaryTerms ?? [],
    transcriptBlocks,
  };
}

function toLibraryContentItem({
  content,
  category,
  topic,
}: {
  content: ContentRow;
  category?: CategoryRow;
  topic?: TopicRow;
}): LibraryContentItem {
  const fallbackKeywords = topic?.top_keywords ?? category?.top_keywords ?? [];

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
} {
  const visibleContents = contents.filter((content) => !shouldHideFromLibrary(content));

  if (visibleContents.length === 0) {
    return {
      libraryCategories: [],
      recentTopics: [],
      recentContents: [],
    };
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const contentById = new Map(visibleContents.map((content) => [content.id, content]));
  const assignmentsByTopicId = new Map<string, AssignmentRow[]>();
  const firstAssignmentByContentId = new Map<string, AssignmentRow>();

  for (const assignment of assignments) {
    const existing = assignmentsByTopicId.get(assignment.topic_id) ?? [];
    existing.push(assignment);
    assignmentsByTopicId.set(assignment.topic_id, existing);

    if (!firstAssignmentByContentId.has(assignment.content_id)) {
      firstAssignmentByContentId.set(assignment.content_id, assignment);
    }
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
            .map((assignment) => contentById.get(assignment.content_id))
            .filter((content): content is ContentRow => Boolean(content))
            .map((content) =>
              toLibraryContentItem({
                content,
                category,
                topic,
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
      const assignment = firstAssignmentByContentId.get(content.id);
      const topic = assignment ? topicById.get(assignment.topic_id) : undefined;
      const category = topic ? categoryById.get(topic.category_id) : undefined;

      return toLibraryContentItem({
        content,
        category,
        topic,
      });
    });

  return {
    libraryCategories,
    recentTopics,
    recentContents,
  };
}
