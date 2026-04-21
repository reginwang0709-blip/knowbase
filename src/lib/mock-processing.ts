import { buildContentPayloadFromMockItem } from "./api-mappers";
import {
  platformFromUrl,
  readableTitleFromUrl,
  type LinkMetadata,
} from "./link-metadata";
import { postProcessTranscriptBlocks } from "./source-adapters/xiaoyuzhou";
import {
  libraryCategories,
  mockKnowledgeItems,
  type TranscriptBlock,
} from "./mock-data";
import { supabaseAdmin } from "./supabase/admin";
import type { Database, Json } from "./supabase/types";

type CategoryInsert =
  Database["public"]["Tables"]["library_categories"]["Insert"];
type TopicInsert = Database["public"]["Tables"]["library_topics"]["Insert"];
type ParseTaskRow = Database["public"]["Tables"]["parse_tasks"]["Row"];
type ContentRow = Database["public"]["Tables"]["contents"]["Row"];

const targetCategoryName = "知识管理与学习方法";
const targetTopicName = "个人知识管理";

export type SourceMetadataPayload = {
  audioUrl?: string;
  coverUrl?: string;
  transcriptSource?: "demo" | "existing_transcript" | "asr" | "asr_pending";
  asrProvider?: "dashscope-funasr";
};

export type ContentBasics = {
  title: string;
  platform: string;
  source_url: string;
  author: string | null;
  published_at: string | null;
  summary: string;
};

export type ParseTaskProcessingPayload = {
  contentBasics?: ContentBasics;
  sourceMetadata?: SourceMetadataPayload;
  asr?: {
    provider?: "dashscope-funasr";
    taskId?: string;
    status?: string;
    submittedAt?: string;
    queryErrorCount?: number;
    lastError?: string;
    lastCheckedAt?: string;
    transcriptionUrl?: string;
    message?: string;
  };
};

function toIsoDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function findOrCreateCategory(category: (typeof libraryCategories)[number]) {
  const { data: existingCategories, error: findError } = await supabaseAdmin
    .from("library_categories")
    .select("*")
    .eq("name", category.name)
    .limit(1);

  if (findError) {
    throw findError;
  }

  const existingCategory = existingCategories?.[0];

  if (existingCategory) {
    return existingCategory;
  }

  const insertPayload: CategoryInsert = {
    name: category.name,
    description: category.description,
    generated_reason: category.generatedReason,
    source_content_count: category.sourceContentCount,
    confidence: category.confidence,
    last_adjusted_at: toIsoDate(category.lastAdjustedAt),
    top_keywords: category.topKeywords,
  };

  const { data: insertedCategory, error: insertError } = await supabaseAdmin
    .from("library_categories")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError) {
    throw insertError;
  }

  return insertedCategory;
}

async function findOrCreateTopic({
  categoryId,
  topic,
}: {
  categoryId: string;
  topic: (typeof libraryCategories)[number]["topics"][number];
}) {
  const { data: existingTopics, error: findError } = await supabaseAdmin
    .from("library_topics")
    .select("*")
    .eq("category_id", categoryId)
    .eq("name", topic.name)
    .limit(1);

  if (findError) {
    throw findError;
  }

  const existingTopic = existingTopics?.[0];

  if (existingTopic) {
    return existingTopic;
  }

  const insertPayload: TopicInsert = {
    category_id: categoryId,
    name: topic.name,
    description: null,
    top_keywords: topic.topKeywords,
  };

  const { data: insertedTopic, error: insertError } = await supabaseAdmin
    .from("library_topics")
    .insert(insertPayload)
    .select("*")
    .single();

  if (insertError) {
    throw insertError;
  }

  return insertedTopic;
}

export async function ensureMockLibraryStructure() {
  const categoryIdByMockId = new Map<string, string>();
  const topicIdByMockId = new Map<string, string>();

  for (const category of libraryCategories) {
    const dbCategory = await findOrCreateCategory(category);
    categoryIdByMockId.set(category.id, dbCategory.id);

    for (const topic of category.topics) {
      const dbTopic = await findOrCreateTopic({
        categoryId: dbCategory.id,
        topic,
      });

      topicIdByMockId.set(topic.id, dbTopic.id);
    }
  }

  const targetCategory =
    libraryCategories.find((category) => category.name === targetCategoryName) ??
    libraryCategories[0];
  const targetTopic =
    targetCategory?.topics.find((topic) => topic.name === targetTopicName) ??
    targetCategory?.topics[0];
  const targetTopicId = targetTopic
    ? topicIdByMockId.get(targetTopic.id)
    : undefined;

  if (!targetTopicId) {
    throw new Error("No mock library topic is available for assignment.");
  }

  return {
    categoryIdByMockId,
    topicIdByMockId,
    targetTopicId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toContentPayload(
  value: Database["public"]["Tables"]["contents"]["Row"]["content_payload"],
) {
  if (!isRecord(value)) {
    return {} as Record<string, Json | undefined>;
  }

  return value as Record<string, Json | undefined>;
}

function hasTranscriptBlocks(value: unknown): value is TranscriptBlock[] {
  return (
    Array.isArray(value) &&
    value.some(
      (block) =>
        isRecord(block) &&
        typeof block.id === "string" &&
        typeof block.text === "string",
    )
  );
}

function buildPayloadWithTranscript({
  demoItem,
  transcriptBlocks,
  sourceMetadata,
}: {
  demoItem: (typeof mockKnowledgeItems)[number];
  transcriptBlocks?: TranscriptBlock[];
  sourceMetadata: SourceMetadataPayload;
}) {
  const basePayload = buildContentPayloadFromMockItem(demoItem) as Record<
    string,
    Json | undefined
  >;

  return {
    ...basePayload,
    transcriptBlocks: transcriptBlocks
      ? postProcessTranscriptBlocks(transcriptBlocks)
      : demoItem.transcriptBlocks,
    sourceMetadata,
  } as Json;
}

export async function findFirstContentBySourceUrl(sourceUrl: string) {
  const { data, error } = await supabaseAdmin
    .from("contents")
    .select("*")
    .eq("source_url", sourceUrl)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw error;
  }

  const contents = data ?? [];
  const resolvedContent = contents.find((content) =>
    contentHasResolvedTranscript(content),
  );

  return resolvedContent ?? contents[0] ?? null;
}

export async function createContentFromContentBasics({
  taskId,
  contentBasics,
  transcriptBlocks,
  sourceMetadata,
}: {
  taskId: string;
  contentBasics: ContentBasics;
  transcriptBlocks?: TranscriptBlock[];
  sourceMetadata: SourceMetadataPayload;
}) {
  const demoItem = mockKnowledgeItems[0];

  if (!demoItem) {
    throw new Error("No demo knowledge item is available.");
  }

  const contentPayload = buildPayloadWithTranscript({
    demoItem,
    transcriptBlocks,
    sourceMetadata,
  });

  const { data: content, error: contentError } = await supabaseAdmin
    .from("contents")
    .insert({
      task_id: taskId,
      ...contentBasics,
      parsed_at: new Date().toISOString(),
      content_payload: contentPayload,
    })
    .select("*")
    .single();

  if (contentError) {
    throw contentError;
  }

  await attachContentToMockLibrary(content.id);

  return content;
}

export async function attachContentToMockLibrary(contentId: string) {
  const { targetTopicId } = await ensureMockLibraryStructure();

  const { data: existingAssignments, error: findAssignmentError } =
    await supabaseAdmin
      .from("content_topic_assignments")
      .select("id")
      .eq("content_id", contentId)
      .eq("topic_id", targetTopicId)
      .limit(1);

  if (findAssignmentError) {
    throw findAssignmentError;
  }

  if (!existingAssignments?.[0]) {
    const { error: assignmentError } = await supabaseAdmin
      .from("content_topic_assignments")
      .insert({
        content_id: contentId,
        topic_id: targetTopicId,
        confidence: 0.9,
        assignment_reason: "Phase 2A mock processing 自动归档",
      });

    if (assignmentError) {
      throw assignmentError;
    }
  }
}

export function contentHasResolvedTranscript(content: ContentRow) {
  const payload = toContentPayload(content.content_payload);
  const sourceMetadata = isRecord(payload.sourceMetadata)
    ? (payload.sourceMetadata as SourceMetadataPayload)
    : undefined;
  const transcriptBlocks = hasTranscriptBlocks(payload.transcriptBlocks)
    ? payload.transcriptBlocks
    : [];

  return Boolean(
    transcriptBlocks.length > 0 &&
      (sourceMetadata?.transcriptSource === "asr" ||
        sourceMetadata?.transcriptSource === "existing_transcript"),
  );
}

export async function updateExistingContentWithResolvedTranscript({
  content,
  contentBasics,
  transcriptBlocks,
  sourceMetadata,
}: {
  content: ContentRow;
  contentBasics: ContentBasics;
  transcriptBlocks: TranscriptBlock[];
  sourceMetadata: SourceMetadataPayload;
}) {
  const demoItem = mockKnowledgeItems[0];

  if (!demoItem) {
    throw new Error("No demo knowledge item is available.");
  }

  const existingPayload = toContentPayload(content.content_payload);
  const payload = {
    ...existingPayload,
    keywords:
      existingPayload.keywords ??
      ((buildContentPayloadFromMockItem(demoItem) as Record<string, Json>)
        .keywords as Json),
    sections:
      existingPayload.sections ??
      ((buildContentPayloadFromMockItem(demoItem) as Record<string, Json>)
        .sections as Json),
    chapters:
      existingPayload.chapters ??
      ((buildContentPayloadFromMockItem(demoItem) as Record<string, Json>)
        .chapters as Json),
    glossaryTerms:
      existingPayload.glossaryTerms ??
      ((buildContentPayloadFromMockItem(demoItem) as Record<string, Json>)
        .glossaryTerms as Json),
    transcriptBlocks,
    sourceMetadata,
  } as Json;

  const { data: updatedContent, error } = await supabaseAdmin
    .from("contents")
    .update({
      ...contentBasics,
      parsed_at: new Date().toISOString(),
      content_payload: payload,
    })
    .eq("id", content.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  await attachContentToMockLibrary(updatedContent.id);

  return updatedContent;
}

export async function saveResolvedTranscriptContent({
  taskId,
  contentBasics,
  transcriptBlocks,
  sourceMetadata,
}: {
  taskId: string;
  contentBasics: ContentBasics;
  transcriptBlocks: TranscriptBlock[];
  sourceMetadata: SourceMetadataPayload;
}) {
  const existingContent = await findFirstContentBySourceUrl(
    contentBasics.source_url,
  );

  if (existingContent) {
    const updatedContent = await updateExistingContentWithResolvedTranscript({
      content: existingContent,
      contentBasics,
      transcriptBlocks,
      sourceMetadata,
    });

    return {
      content: updatedContent,
      duplicated: true,
    };
  }

  const content = await createContentFromContentBasics({
    taskId,
    contentBasics,
    transcriptBlocks,
    sourceMetadata,
  });

  return {
    content,
    duplicated: false,
  };
}

export async function runMockProcessingForTask({
  metadata,
  taskId,
  transcriptBlocks,
  sourceMetadata,
}: {
  metadata: LinkMetadata;
  taskId: string;
  transcriptBlocks?: TranscriptBlock[];
  sourceMetadata?: SourceMetadataPayload;
}) {
  const demoItem = mockKnowledgeItems[0];
  const sourceUrl = metadata.canonicalUrl || metadata.url;
  const title =
    metadata.title || readableTitleFromUrl(sourceUrl) || "未命名内容";
  const platform =
    metadata.siteName ||
    metadata.platform ||
    platformFromUrl(sourceUrl) ||
    "未知来源";
  const summary = metadata.description || "暂未提取到网页摘要。";

  if (!demoItem) {
    throw new Error("No demo knowledge item is available.");
  }

  const contentPayload = buildPayloadWithTranscript({
    demoItem,
    transcriptBlocks,
    sourceMetadata: sourceMetadata ?? {
      audioUrl: metadata.audioUrl,
      coverUrl: metadata.coverUrl,
      transcriptSource: transcriptBlocks ? "existing_transcript" : "demo",
    },
  });

  const content = await createContentFromContentBasics({
    taskId,
    contentBasics: {
      title,
      platform,
      source_url: sourceUrl,
      author: metadata.author || null,
      published_at: metadata.publishedAt ?? null,
      summary,
    },
    transcriptBlocks:
      (contentPayload as Record<string, Json | undefined>)
        .transcriptBlocks as TranscriptBlock[] | undefined,
    sourceMetadata: sourceMetadata ?? {
      audioUrl: metadata.audioUrl,
      coverUrl: metadata.coverUrl,
      transcriptSource: transcriptBlocks ? "existing_transcript" : "demo",
    },
  });

  const { data: task, error: taskError } = await supabaseAdmin
    .from("parse_tasks")
    .update({
      status: "completed",
      progress: 100,
      content_id: content.id,
      title: content.title,
      platform: content.platform,
    })
    .eq("id", taskId)
    .select("*")
    .single();

  if (taskError) {
    throw taskError;
  }

  return {
    task: task as ParseTaskRow,
    content,
  };
}
