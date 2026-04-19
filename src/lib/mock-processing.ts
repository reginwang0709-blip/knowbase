import { buildContentPayloadFromMockItem } from "./api-mappers";
import { libraryCategories, mockKnowledgeItems } from "./mock-data";
import { supabaseAdmin } from "./supabase/admin";
import type { Database } from "./supabase/types";

type CategoryInsert =
  Database["public"]["Tables"]["library_categories"]["Insert"];
type TopicInsert = Database["public"]["Tables"]["library_topics"]["Insert"];
type ParseTaskRow = Database["public"]["Tables"]["parse_tasks"]["Row"];

const targetCategoryName = "知识管理与学习方法";
const targetTopicName = "个人知识管理";

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

export async function runMockProcessingForTask({
  taskId,
  url,
}: {
  taskId: string;
  url: string;
}) {
  const demoItem = mockKnowledgeItems[0];

  if (!demoItem) {
    throw new Error("No demo knowledge item is available.");
  }

  const { data: content, error: contentError } = await supabaseAdmin
    .from("contents")
    .insert({
      task_id: taskId,
      title: demoItem.title,
      platform: demoItem.sourcePlatform,
      source_url: url || demoItem.sourceUrl,
      author: demoItem.author,
      published_at: toIsoDate(demoItem.publishedAt),
      parsed_at: new Date().toISOString(),
      summary: demoItem.summary,
      content_payload: buildContentPayloadFromMockItem(demoItem),
    })
    .select("*")
    .single();

  if (contentError) {
    throw contentError;
  }

  const { targetTopicId } = await ensureMockLibraryStructure();

  const { data: existingAssignments, error: findAssignmentError } =
    await supabaseAdmin
      .from("content_topic_assignments")
      .select("id")
      .eq("content_id", content.id)
      .eq("topic_id", targetTopicId)
      .limit(1);

  if (findAssignmentError) {
    throw findAssignmentError;
  }

  if (!existingAssignments?.[0]) {
    const { error: assignmentError } = await supabaseAdmin
      .from("content_topic_assignments")
      .insert({
        content_id: content.id,
        topic_id: targetTopicId,
        confidence: 0.9,
        assignment_reason: "Phase 2A mock processing 自动归档",
      });

    if (assignmentError) {
      throw assignmentError;
    }
  }

  const { data: task, error: taskError } = await supabaseAdmin
    .from("parse_tasks")
    .update({
      status: "completed",
      progress: 100,
      content_id: content.id,
      title: demoItem.title,
      platform: demoItem.sourcePlatform,
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
