import "server-only";

import type { GlossaryTerm, Keyword, Section } from "@/lib/mock-data";
import { getContentGlossaryContext, getContentRowById } from "@/lib/glossary-store";
import {
  createMiniMaxChatCompletion,
  getMiniMaxModel,
  hasMiniMaxApiKey,
} from "./minimax-client";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/types";

type CategoryRow = Database["public"]["Tables"]["library_categories"]["Row"];
type TopicRow = Database["public"]["Tables"]["library_topics"]["Row"];
type ContentTopicAssignmentRow =
  Database["public"]["Tables"]["content_topic_assignments"]["Row"];

function getOptionalStringField(row: object, key: string) {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalBooleanField(row: object, key: string) {
  return (row as Record<string, unknown>)[key] === true;
}

function getOptionalNumberField(row: object, key: string) {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type ArchiveDecision = {
  type: "existing" | "new";
  categoryId?: string | null;
  topicId?: string | null;
  name: string;
  reason: string;
  confidence: number;
};

type ArchiveAssignment = {
  reason: string;
  confidence: number;
  relatedKeywords: string[];
  relatedGlossaryTerms: string[];
};

export type ArchiveSuggestion = {
  categoryDecision: {
    type: "existing" | "new";
    categoryId: string | null;
    name: string;
    reason: string;
    confidence: number;
  };
  topicDecision: {
    type: "existing" | "new";
    topicId: string | null;
    name: string;
    reason: string;
    confidence: number;
  };
  assignment: ArchiveAssignment;
};

export type ArchiveSuggestionDiagnostics = {
  contentTitle: string;
  categoryCount: number;
  topicCount: number;
  titleSource: string;
  summarySource: string;
  keywordsSource: string;
  sectionsSource: string;
  rawSectionsCount: number;
  usedSectionsCount: number;
  usedSectionsPreview: string[];
  rawKeywordsCount: number;
  usedKeywords: string[];
  usedSectionSignals: string[];
  keywordThemeSignals: string[];
  glossaryAuxiliarySignals: string[];
  archiveDecisionMainSignals: string[];
  rawGlossaryTermsCount: number;
  filteredGlossaryTermsCount: number;
  usedGlossaryTermsCount: number;
  droppedGlossaryTermsPreview: string[];
  usedGlossaryTermsPreview: string[];
  contentPayloadKeys: string[];
  whetherMockFallbackUsed: boolean;
  provider: "minimax";
  model: string;
  wroteToDatabase: false;
};

export type ArchiveCommitResult = {
  ok: true;
  dryRun: false;
  commit: true;
  wroteToDatabase: boolean;
  requiresReview?: boolean;
  reviewReason?: string;
  assignment?: {
    contentId: string;
    topicId: string;
    assignmentId: string;
    source: "llm";
    status: "accepted";
  };
  archiveSuggestion: ArchiveSuggestion;
  diagnostics: ArchiveSuggestionDiagnostics;
};

export class LibraryArchiveSuggestionError extends Error {
  diagnostics: ArchiveSuggestionDiagnostics;

  constructor(message: string, diagnostics: ArchiveSuggestionDiagnostics) {
    super(message);
    this.name = "LibraryArchiveSuggestionError";
    this.diagnostics = diagnostics;
  }
}

export class LibraryArchiveRequiresReviewError extends Error {
  diagnostics: ArchiveSuggestionDiagnostics;
  archiveSuggestion: ArchiveSuggestion;
  reviewReason: string;

  constructor({
    reviewReason,
    diagnostics,
    archiveSuggestion,
  }: {
    reviewReason: string;
    diagnostics: ArchiveSuggestionDiagnostics;
    archiveSuggestion: ArchiveSuggestion;
  }) {
    super(reviewReason);
    this.name = "LibraryArchiveRequiresReviewError";
    this.reviewReason = reviewReason;
    this.diagnostics = diagnostics;
    this.archiveSuggestion = archiveSuggestion;
  }
}

function clampConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, Number(value)));
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toContentPayload(value: Json | null | undefined) {
  if (!isRecord(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => cleanText(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeMatchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function keywordAppearsInText(keyword: string, text: string) {
  const normalizedKeyword = normalizeMatchText(keyword);
  const normalizedText = normalizeMatchText(text);

  return Boolean(normalizedKeyword) && normalizedText.includes(normalizedKeyword);
}

function glossaryAlignsWithMainSignals(term: GlossaryTerm, mainTexts: string[], keywords: Keyword[]) {
  const displayTerm = cleanText(term.term);

  if (!displayTerm) {
    return false;
  }

  if (keywords.some((keyword) => keywordAppearsInText(displayTerm, keyword.term))) {
    return true;
  }

  return mainTexts.some((text) => keywordAppearsInText(displayTerm, text));
}

function looksLikeAllCapsEnglishWord(value: string) {
  return /^[A-Z]{5,}$/.test(value.trim());
}

function normalizeArchiveGlossaryDisplayName(value: string) {
  const trimmed = value.trim();

  if (looksLikeAllCapsEnglishWord(trimmed)) {
    return `${trimmed.slice(0, 1)}${trimmed.slice(1).toLowerCase()}`;
  }

  return trimmed;
}

function isChineseText(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function hasFragmentBoundary(value: string) {
  return /^(的|了|和|在|个|化)/.test(value) || /(的|了|和|在|个|化)$/.test(value);
}

function hasSpokenFragment(value: string) {
  return /(然后|这个|那个|什么|就是)/.test(value);
}

function isLowQualityChineseFragment(value: string) {
  const trimmed = value.trim();

  if (!isChineseText(trimmed)) {
    return false;
  }

  if (trimmed.length <= 2) {
    return true;
  }

  if (trimmed.length <= 4 && hasFragmentBoundary(trimmed)) {
    return true;
  }

  if (hasFragmentBoundary(trimmed) || hasSpokenFragment(trimmed)) {
    return true;
  }

  return false;
}

function getArchiveGlossaryDropReason(
  term: GlossaryTerm,
  mainTexts: string[],
  keywords: Keyword[],
) {
  const displayTerm = cleanText(term.term);

  if (!displayTerm) {
    return "empty_term";
  }

  if (term.displayStatus === "hidden") {
    return "hidden_display_status";
  }

  if (
    term.userFeedback === "hidden" ||
    term.userFeedback === "incorrect" ||
    term.userFeedback === "not_needed"
  ) {
    return "negative_user_feedback";
  }

  if (
    term.highlightEnabled === false &&
    term.source !== "user_added" &&
    term.isStarred !== true
  ) {
    return "not_highlighted";
  }

  if (
    term.confidence === "low" &&
    term.explanationStatus !== "ready" &&
    term.isStarred !== true &&
    term.source !== "user_added"
  ) {
    return "low_confidence_without_support";
  }

  if (isLowQualityChineseFragment(displayTerm)) {
    return "low_quality_fragment";
  }

  if (
    term.source === "user_added" &&
    term.isStarred !== true &&
    !glossaryAlignsWithMainSignals(term, mainTexts, keywords)
  ) {
    return "user_added_not_theme_aligned";
  }

  return null;
}

function getArchiveGlossaryPriorityScore(term: GlossaryTerm) {
  return (
    (term.isStarred ? 100 : 0) +
    (term.source === "user_added" ? 40 : 0) +
    (term.explanationStatus === "ready" ? 20 : 0) +
    (term.highlightEnabled === true || term.displayStatus === "highlighted" ? 10 : 0) +
    Math.min(term.occurrenceCount, 10)
  );
}

function pickArchiveGlossaryTerms(
  glossaryTerms: GlossaryTerm[],
  mainTexts: string[],
  keywords: Keyword[],
) {
  const droppedGlossaryTermsPreview: string[] = [];
  const filteredTerms = glossaryTerms.filter((term) => {
    const dropReason = getArchiveGlossaryDropReason(term, mainTexts, keywords);

    if (!dropReason) {
      return true;
    }

    if (droppedGlossaryTermsPreview.length < 8) {
      droppedGlossaryTermsPreview.push(`${cleanText(term.term) || "(empty)"} [${dropReason}]`);
    }

    return false;
  });

  const prioritized = [...filteredTerms]
    .sort((first, second) => getArchiveGlossaryPriorityScore(second) - getArchiveGlossaryPriorityScore(first))
    .slice(0, 12);

  return {
    rawGlossaryTermsCount: glossaryTerms.length,
    filteredGlossaryTermsCount: filteredTerms.length,
    droppedGlossaryTermsPreview,
    prioritizedTerms: prioritized,
    usedGlossaryTermsPreview: prioritized
      .map((term) => normalizeArchiveGlossaryDisplayName(term.term))
      .filter(Boolean)
      .slice(0, 8),
  };
}

function buildUsedSectionSignals(sections: Section[]) {
  return sections
    .slice(0, 6)
    .map((section) => `${section.title} | ${section.summary}`.trim())
    .filter(Boolean);
}

function toChapterSections(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Section[];
  }

  return value
    .filter((chapter): chapter is Record<string, unknown> => isRecord(chapter))
    .map((chapter, index) => {
      const title = cleanText(chapter.title);
      const summary = cleanText(chapter.summary);

      if (!title && !summary) {
        return null;
      }

      return {
        id: `chapter-${index + 1}`,
        title: title || `章节 ${index + 1}`,
        summary,
        order: index,
        startBlockId: "",
      } satisfies Section;
    })
    .filter((section): section is Section => Boolean(section));
}

function getKeywordAlignmentScore(text: string, keywords: Keyword[]) {
  if (!text.trim() || keywords.length === 0) {
    return 0;
  }

  return keywords.reduce((count, keyword) => {
    return keywordAppearsInText(keyword.term, text) ? count + 1 : count;
  }, 0);
}

function pickArchiveSections({
  payloadSections,
  payloadChapters,
  title,
  summary,
  keywords,
}: {
  payloadSections: Section[];
  payloadChapters: Section[];
  title: string;
  summary: string;
  keywords: Keyword[];
}) {
  const primaryTexts = [title, summary].filter(Boolean);

  const evaluateSections = (sections: Section[]) => {
    const alignmentSignals = sections.map((section) => {
      const sectionText = `${section.title} ${section.summary}`.trim();
      return getKeywordAlignmentScore(sectionText, keywords);
    });
    const alignedCount = alignmentSignals.filter((score) => score > 0).length;
    const primaryTextHit = sections.some((section) =>
      primaryTexts.some(
        (text) =>
          keywordAppearsInText(section.title, text) ||
          keywordAppearsInText(section.summary, text),
      ),
    );

    return {
      alignedCount,
      primaryTextHit,
    };
  };

  if (payloadSections.length > 0) {
    const evaluation = evaluateSections(payloadSections);

    if (evaluation.alignedCount > 0 || evaluation.primaryTextHit) {
      return {
        sections: payloadSections,
        sectionsSource: "payload.sections",
        whetherMockFallbackUsed: false,
      };
    }
  }

  if (payloadChapters.length > 0) {
    const evaluation = evaluateSections(payloadChapters);

    if (evaluation.alignedCount > 0 || evaluation.primaryTextHit) {
      return {
        sections: payloadChapters,
        sectionsSource: "payload.chapters",
        whetherMockFallbackUsed: false,
      };
    }
  }

  const hadCandidateSections = payloadSections.length > 0 || payloadChapters.length > 0;

  return {
    sections: [] as Section[],
    sectionsSource: hadCandidateSections
      ? "missing_unrelated_payload_sections"
      : "missing",
    whetherMockFallbackUsed: hadCandidateSections,
  };
}

function buildKeywordThemeSignals({
  title,
  generatedSummary,
  sections,
  keywords,
}: {
  title: string;
  generatedSummary: string;
  sections: Section[];
  keywords: Keyword[];
}) {
  return keywords
    .map((keyword) => {
      const signals: string[] = [];
      if (keywordAppearsInText(keyword.term, title)) {
        signals.push("title");
      }
      if (keywordAppearsInText(keyword.term, generatedSummary)) {
        signals.push("summary");
      }

      const sectionHitCount = sections.filter(
        (section) =>
          keywordAppearsInText(keyword.term, section.title) ||
          keywordAppearsInText(keyword.term, section.summary),
      ).length;

      if (sectionHitCount > 0) {
        signals.push(sectionHitCount > 1 ? `sections:${sectionHitCount}` : "section");
      }

      if (signals.length === 0) {
        signals.push("keyword");
      }

      return `${keyword.term} [${signals.join(", ")}]`;
    })
    .slice(0, 8);
}

function buildArchiveDecisionMainSignals({
  title,
  generatedSummary,
  keywords,
  sections,
}: {
  title: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
}) {
  const signals = [
    `title: ${title}`,
    generatedSummary ? `summary: ${generatedSummary.slice(0, 140)}` : "",
    keywords.length > 0
      ? `keywords: ${keywords.map((keyword) => keyword.term).slice(0, 5).join(" / ")}`
      : "",
    sections.length > 0
      ? `sections: ${sections.map((section) => section.title).slice(0, 4).join(" / ")}`
      : "",
  ].filter(Boolean);

  return signals.slice(0, 6);
}

function buildCategoryContext(categories: CategoryRow[]) {
  if (categories.length === 0) {
    return "无现有一级分类。";
  }

  return categories
    .map(
      (category, index) =>
        `${index + 1}. id=${category.id} | name=${category.name} | description=${category.description || "无"} | generatedReason=${category.generated_reason || "无"} | confidence=${category.confidence ?? 0} | topKeywords=${(category.top_keywords ?? []).join(" / ") || "无"} | source=${getOptionalStringField(category, "source") || "unknown"} | userAdjusted=${getOptionalBooleanField(category, "user_adjusted") ? "true" : "false"}`,
    )
    .join("\n");
}

function buildTopicContext({
  topics,
  categoriesById,
}: {
  topics: TopicRow[];
  categoriesById: Map<string, CategoryRow>;
}) {
  if (topics.length === 0) {
    return "无现有二级主题。";
  }

  return topics
    .map((topic, index) => {
      const category = categoriesById.get(topic.category_id);

      return `${index + 1}. id=${topic.id} | categoryId=${topic.category_id} | categoryName=${category?.name || "未知"} | name=${topic.name} | description=${topic.description || "无"} | generatedReason=${getOptionalStringField(topic, "generated_reason") || "无"} | confidence=${getOptionalNumberField(topic, "confidence") ?? 0} | topKeywords=${(topic.top_keywords ?? []).join(" / ") || "无"} | source=${getOptionalStringField(topic, "source") || "unknown"} | userAdjusted=${getOptionalBooleanField(topic, "user_adjusted") ? "true" : "false"}`;
    })
    .join("\n");
}

function buildSectionContext(sections: Section[]) {
  if (sections.length === 0) {
    return "无语义章节。";
  }

  return sections
    .slice(0, 8)
    .map(
      (section, index) =>
        `${index + 1}. ${section.title} | ${section.summary}`,
    )
    .join("\n");
}

function buildKeywordContext(keywords: Keyword[]) {
  if (keywords.length === 0) {
    return "无 keywords。";
  }

  return keywords.map((keyword) => keyword.term).filter(Boolean).slice(0, 8).join(" / ");
}

function buildGlossaryContext(glossaryTerms: GlossaryTerm[]) {
  if (glossaryTerms.length === 0) {
    return "无优先 glossary terms。";
  }

  return glossaryTerms
    .map(
      (term, index) =>
        `${index + 1}. ${term.term} | source=${term.source || "auto"} | starred=${term.isStarred === true ? "true" : "false"} | status=${term.explanationStatus || "pending"} | highlighted=${term.highlightEnabled === true || term.displayStatus === "highlighted" ? "true" : "false"}`,
        
    )
    .join("\n");
}

function buildArchiveSystemPrompt() {
  return [
    "你是 KnowBase 的知识库归档建议助手。",
    "你的任务是判断一条内容应该归档到哪个一级分类(category)和二级主题(topic)。",
    "必须先基于 title、generatedSummary、section titles、section summaries、keywords 判断主主题。",
    "glossaryTerms 只能作为辅助信号，用来补充具体实体、产品、模型、公司或技术概念。",
    "不要因为某个 glossary term 出现，就把它当作 category/topic 的主依据。",
    "如果 glossaryTerms 与 summary 或 keywords 冲突，以 summary 和 keywords 为准。",
    "优先复用已有 category/topic，不要轻易建议新建。",
    "只有当现有结构明显不匹配时，才建议 new category 或 new topic。",
    "只输出严格 JSON，不要输出 markdown，不要输出额外解释。",
    "confidence 必须是 0 到 1 之间的小数。",
    "relatedKeywords 必须优先来自给定 keywords。",
    "relatedGlossaryTerms 只作为辅助补充，不要返回无主题代表性的术语。",
  ].join(" ");
}

function buildArchiveUserPrompt({
  title,
  generatedSummary,
  keywords,
  sections,
  glossaryTerms,
  keywordThemeSignals,
  archiveDecisionMainSignals,
  categories,
  topics,
}: {
  title: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
  glossaryTerms: GlossaryTerm[];
  keywordThemeSignals: string[];
  archiveDecisionMainSignals: string[];
  categories: CategoryRow[];
  topics: TopicRow[];
}) {
  const categoriesById = new Map(categories.map((category) => [category.id, category] as const));

  return `
请根据内容信息，给出一个知识库归档建议。

输出 JSON schema 必须严格为：
{
  "categoryDecision": {
    "type": "existing" | "new",
    "categoryId": "string | null",
    "name": "string",
    "reason": "string",
    "confidence": 0.0
  },
  "topicDecision": {
    "type": "existing" | "new",
    "topicId": "string | null",
    "name": "string",
    "reason": "string",
    "confidence": 0.0
  },
  "assignment": {
    "reason": "string",
    "confidence": 0.0,
    "relatedKeywords": ["string"],
    "relatedGlossaryTerms": ["string"]
  }
}

规则：
0. 先基于 title / summary / sections / keywords 判断主主题，再参考 glossaryTerms。
1. 优先选择现有 category/topic。
2. 只有当现有结构明显不合适时，才返回 type="new"。
3. 如果 categoryDecision.type="existing"，categoryId 必须来自现有一级分类列表。
4. 如果 topicDecision.type="existing"，topicId 必须来自现有二级主题列表。
5. 如果 topicDecision.type="existing"，它应尽量属于选中的 category。
6. reason 要简洁解释为什么适合。
7. relatedKeywords 和 relatedGlossaryTerms 只返回最相关的少量项，最多 5 个。
8. relatedKeywords 优先从原始 keywords 中选。
9. glossaryTerms 只能辅助解释 topic 细分，不要覆盖主归档判断。

内容标题：
${title}

内容摘要：
${generatedSummary || "无"}

keywords：
${buildKeywordContext(keywords)}

关键词主题信号：
${keywordThemeSignals.join("\n") || "无"}

语义章节：
${buildSectionContext(sections)}

主判断信号摘要：
${archiveDecisionMainSignals.join("\n") || "无"}

辅助 glossary terms：
${buildGlossaryContext(glossaryTerms)}

现有一级分类：
${buildCategoryContext(categories)}

现有二级主题：
${buildTopicContext({ topics, categoriesById })}
`.trim();
}

function parseArchiveSuggestion(raw: string): ArchiveSuggestion {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  const parsed = JSON.parse(candidate) as Record<string, unknown>;
  const categoryDecision = parsed.categoryDecision as Record<string, unknown> | undefined;
  const topicDecision = parsed.topicDecision as Record<string, unknown> | undefined;
  const assignment = parsed.assignment as Record<string, unknown> | undefined;

  if (!categoryDecision || !topicDecision || !assignment) {
    throw new Error("LLM 返回缺少 categoryDecision/topicDecision/assignment。");
  }

  const normalizedCategoryType =
    categoryDecision.type === "new" ? "new" : "existing";
  const normalizedTopicType = topicDecision.type === "new" ? "new" : "existing";

  return {
    categoryDecision: {
      type: normalizedCategoryType,
      categoryId:
        normalizedCategoryType === "existing"
          ? cleanText(categoryDecision.categoryId) || null
          : null,
      name: cleanText(categoryDecision.name),
      reason: cleanText(categoryDecision.reason),
      confidence: clampConfidence(categoryDecision.confidence),
    },
    topicDecision: {
      type: normalizedTopicType,
      topicId:
        normalizedTopicType === "existing"
          ? cleanText(topicDecision.topicId) || null
          : null,
      name: cleanText(topicDecision.name),
      reason: cleanText(topicDecision.reason),
      confidence: clampConfidence(topicDecision.confidence),
    },
    assignment: {
      reason: cleanText(assignment.reason),
      confidence: clampConfidence(assignment.confidence),
      relatedKeywords: normalizeStringArray(assignment.relatedKeywords, 5),
      relatedGlossaryTerms: normalizeStringArray(assignment.relatedGlossaryTerms, 5).map(
        normalizeArchiveGlossaryDisplayName,
      ),
    },
  };
}

function validateSuggestionAgainstExisting({
  suggestion,
  categories,
  topics,
  prioritizedGlossaryTerms,
  keywords,
  contentKeywords,
}: {
  suggestion: ArchiveSuggestion;
  categories: CategoryRow[];
  topics: TopicRow[];
  prioritizedGlossaryTerms: GlossaryTerm[];
  keywords: Keyword[];
  contentKeywords: string[];
}) {
  const categoryById = new Map(categories.map((category) => [category.id, category] as const));
  const topicById = new Map(topics.map((topic) => [topic.id, topic] as const));

  if (suggestion.categoryDecision.type === "existing") {
    if (!suggestion.categoryDecision.categoryId || !categoryById.has(suggestion.categoryDecision.categoryId)) {
      throw new Error("LLM 返回的 existing categoryId 无效。");
    }
  }

  if (suggestion.topicDecision.type === "existing") {
    if (!suggestion.topicDecision.topicId || !topicById.has(suggestion.topicDecision.topicId)) {
      throw new Error("LLM 返回的 existing topicId 无效。");
    }
  }

  if (!suggestion.categoryDecision.name) {
    throw new Error("LLM 返回缺少可用 category name。");
  }

  if (!suggestion.topicDecision.name) {
    throw new Error("LLM 返回缺少可用 topic name。");
  }

  if (suggestion.assignment.relatedKeywords.length === 0) {
    suggestion.assignment.relatedKeywords = contentKeywords.slice(0, 3);
  }

  const allowedKeywords = new Set(contentKeywords.map((keyword) => normalizeArchiveGlossaryDisplayName(keyword)));
  suggestion.assignment.relatedKeywords = suggestion.assignment.relatedKeywords
    .filter((keyword) => allowedKeywords.has(normalizeArchiveGlossaryDisplayName(keyword)))
    .slice(0, 5);

  if (suggestion.assignment.relatedKeywords.length === 0) {
    suggestion.assignment.relatedKeywords = contentKeywords.slice(0, 3);
  }

  if (suggestion.assignment.relatedGlossaryTerms.length === 0) {
    suggestion.assignment.relatedGlossaryTerms = prioritizedGlossaryTerms
      .map((term) => normalizeArchiveGlossaryDisplayName(term.term))
      .filter(Boolean)
      .slice(0, 3);
  }

  const allowedGlossaryTerms = new Set(
    prioritizedGlossaryTerms
      .map((term) => normalizeArchiveGlossaryDisplayName(term.term))
      .filter(Boolean),
  );

  suggestion.assignment.relatedGlossaryTerms = suggestion.assignment.relatedGlossaryTerms
    .filter((term) => allowedGlossaryTerms.has(normalizeArchiveGlossaryDisplayName(term)))
    .map((term) => normalizeArchiveGlossaryDisplayName(term))
    .slice(0, 5);

  if (suggestion.assignment.relatedGlossaryTerms.length === 0) {
    suggestion.assignment.relatedGlossaryTerms = prioritizedGlossaryTerms
      .map((term) => normalizeArchiveGlossaryDisplayName(term.term))
      .filter(Boolean)
      .slice(0, 3);
  }

  return suggestion;
}

function buildEmptyArchiveDiagnostics(model: string): ArchiveSuggestionDiagnostics {
  return {
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
    provider: "minimax",
    model,
    wroteToDatabase: false,
  };
}

function buildReviewReason({
  archiveSuggestion,
  categoryById,
  topicById,
}: {
  archiveSuggestion: ArchiveSuggestion;
  categoryById: Map<string, CategoryRow>;
  topicById: Map<string, TopicRow>;
}) {
  if (archiveSuggestion.categoryDecision.type !== "existing") {
    return "categoryDecision.type 为 new，第一版不自动创建 category。";
  }

  if (!archiveSuggestion.categoryDecision.categoryId) {
    return "categoryDecision.categoryId 缺失。";
  }

  if (!categoryById.has(archiveSuggestion.categoryDecision.categoryId)) {
    return "categoryDecision.categoryId 不存在于现有 library_categories。";
  }

  if (archiveSuggestion.topicDecision.type !== "existing") {
    return "topicDecision.type 为 new，第一版不自动创建 topic。";
  }

  if (!archiveSuggestion.topicDecision.topicId) {
    return "topicDecision.topicId 缺失。";
  }

  const topic = topicById.get(archiveSuggestion.topicDecision.topicId);

  if (!topic) {
    return "topicDecision.topicId 不存在于现有 library_topics。";
  }

  if (topic.category_id !== archiveSuggestion.categoryDecision.categoryId) {
    return "topic 所属 category 与 categoryDecision.categoryId 不一致。";
  }

  if (archiveSuggestion.assignment.confidence < 0.6) {
    return `assignment.confidence 过低（${archiveSuggestion.assignment.confidence.toFixed(2)} < 0.6）。`;
  }

  return "";
}

export async function generateLibraryArchiveSuggestion(contentId: string) {
  const model = getMiniMaxModel();
  const content = await getContentRowById(contentId);

  if (!content) {
    throw new LibraryArchiveSuggestionError("内容不存在。", buildEmptyArchiveDiagnostics(model));
  }

  const context = await getContentGlossaryContext(content);
  const payload = toContentPayload(content.content_payload);
  const payloadSections = Array.isArray(payload.sections) ? (payload.sections as Section[]) : ([] as Section[]);
  const payloadChapters = toChapterSections(payload.chapters);
  const rawKeywords = Array.isArray(payload.keywords) ? (payload.keywords as Keyword[]) : ([] as Keyword[]);
  const summarySource =
    typeof payload.generatedSummary === "string" && payload.generatedSummary.trim()
      ? "payload.generatedSummary"
      : typeof content.summary === "string" && content.summary.trim()
        ? "contents.summary"
        : "missing";
  const keywordsSource =
    rawKeywords.length > 0
      ? "payload.keywords"
      : context.keywords.length > 0
        ? "context.keywords"
        : "missing";
  const sectionSelection = pickArchiveSections({
    payloadSections,
    payloadChapters,
    title: content.title,
    summary: context.generatedSummary || "",
    keywords: context.keywords,
  });
  const archiveSections = sectionSelection.sections;
  const [categoriesResult, topicsResult] = await Promise.all([
    supabaseAdmin.from("library_categories").select("*").order("updated_at", { ascending: false }),
    supabaseAdmin.from("library_topics").select("*").order("created_at", { ascending: true }),
  ]);

  if (categoriesResult.error) {
    throw new LibraryArchiveSuggestionError(categoriesResult.error.message, {
      ...buildEmptyArchiveDiagnostics(model),
      contentTitle: context.title,
      titleSource: "contents.title",
      summarySource,
      keywordsSource,
      sectionsSource: sectionSelection.sectionsSource,
      rawSectionsCount: Math.max(payloadSections.length, payloadChapters.length),
      usedSectionsCount: archiveSections.length,
      usedSectionsPreview: archiveSections.slice(0, 4).map((section) => `${section.title} | ${section.summary}`.trim()),
      rawKeywordsCount: rawKeywords.length,
      contentPayloadKeys: Object.keys(payload),
      whetherMockFallbackUsed: sectionSelection.whetherMockFallbackUsed,
    });
  }

  if (topicsResult.error) {
    throw new LibraryArchiveSuggestionError(topicsResult.error.message, {
      ...buildEmptyArchiveDiagnostics(model),
      contentTitle: context.title,
      categoryCount: categoriesResult.data?.length ?? 0,
      titleSource: "contents.title",
      summarySource,
      keywordsSource,
      sectionsSource: sectionSelection.sectionsSource,
      rawSectionsCount: Math.max(payloadSections.length, payloadChapters.length),
      usedSectionsCount: archiveSections.length,
      usedSectionsPreview: archiveSections.slice(0, 4).map((section) => `${section.title} | ${section.summary}`.trim()),
      rawKeywordsCount: rawKeywords.length,
      contentPayloadKeys: Object.keys(payload),
      whetherMockFallbackUsed: sectionSelection.whetherMockFallbackUsed,
    });
  }

  const categories = categoriesResult.data ?? [];
  const topics = topicsResult.data ?? [];
  const usedKeywords = context.keywords.map((keyword) => keyword.term).filter(Boolean).slice(0, 8);
  const usedSectionSignals = buildUsedSectionSignals(archiveSections);
  const keywordThemeSignals = buildKeywordThemeSignals({
    title: context.title,
    generatedSummary: context.generatedSummary || "",
    sections: archiveSections,
    keywords: context.keywords,
  });
  const archiveDecisionMainSignals = buildArchiveDecisionMainSignals({
    title: context.title,
    generatedSummary: context.generatedSummary || "",
    keywords: context.keywords,
    sections: archiveSections,
  });
  const mainTexts = [
    context.title,
    context.generatedSummary || "",
    ...archiveSections.flatMap((section) => [section.title, section.summary]),
    ...usedKeywords,
  ].filter(Boolean);
  const glossarySelection = pickArchiveGlossaryTerms(
    context.glossaryTerms,
    mainTexts,
    context.keywords,
  );
  const prioritizedGlossaryTerms = glossarySelection.prioritizedTerms;
  const diagnostics: ArchiveSuggestionDiagnostics = {
    contentTitle: context.title,
    categoryCount: categories.length,
    topicCount: topics.length,
    titleSource: "contents.title",
    summarySource,
    keywordsSource,
    sectionsSource: sectionSelection.sectionsSource,
    rawSectionsCount: Math.max(payloadSections.length, payloadChapters.length),
    usedSectionsCount: archiveSections.length,
    usedSectionsPreview: archiveSections
      .slice(0, 4)
      .map((section) => `${section.title} | ${section.summary}`.trim()),
    rawKeywordsCount: rawKeywords.length,
    usedKeywords,
    usedSectionSignals,
    keywordThemeSignals,
    glossaryAuxiliarySignals: glossarySelection.usedGlossaryTermsPreview,
    archiveDecisionMainSignals,
    rawGlossaryTermsCount: glossarySelection.rawGlossaryTermsCount,
    filteredGlossaryTermsCount: glossarySelection.filteredGlossaryTermsCount,
    usedGlossaryTermsCount: prioritizedGlossaryTerms.length,
    droppedGlossaryTermsPreview: glossarySelection.droppedGlossaryTermsPreview,
    usedGlossaryTermsPreview: glossarySelection.usedGlossaryTermsPreview,
    contentPayloadKeys: Object.keys(payload),
    whetherMockFallbackUsed: sectionSelection.whetherMockFallbackUsed,
    provider: "minimax",
    model,
    wroteToDatabase: false,
  };

  if (!hasMiniMaxApiKey()) {
    throw new LibraryArchiveSuggestionError(
      "缺少 MiniMax API Key，无法生成归档建议。",
      diagnostics,
    );
  }

  try {
    const completion = await createMiniMaxChatCompletion({
      messages: [
        {
          role: "system",
          content: buildArchiveSystemPrompt(),
        },
        {
          role: "user",
          content: buildArchiveUserPrompt({
            title: context.title,
            generatedSummary: context.generatedSummary || "",
            keywords: context.keywords,
            sections: archiveSections,
            glossaryTerms: prioritizedGlossaryTerms,
            keywordThemeSignals,
            archiveDecisionMainSignals,
            categories,
            topics,
          }),
        },
      ],
      temperature: 0.2,
      maxTokens: 1400,
      timeoutMs: 90000,
      reasoningSplit: true,
      requestJsonResponse: true,
    });

    const suggestion = validateSuggestionAgainstExisting({
      suggestion: parseArchiveSuggestion(completion.content),
      categories,
      topics,
      prioritizedGlossaryTerms,
      keywords: context.keywords,
      contentKeywords: usedKeywords,
    });

    return {
      archiveSuggestion: suggestion,
      diagnostics,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成归档建议失败。";
    throw new LibraryArchiveSuggestionError(message, diagnostics);
  }
}

export async function commitLibraryArchiveSuggestion(
  contentId: string,
): Promise<ArchiveCommitResult> {
  const { archiveSuggestion, diagnostics } = await generateLibraryArchiveSuggestion(contentId);
  const [categoriesResult, topicsResult] = await Promise.all([
    supabaseAdmin.from("library_categories").select("*"),
    supabaseAdmin.from("library_topics").select("*"),
  ]);

  if (categoriesResult.error) {
    throw new LibraryArchiveSuggestionError(categoriesResult.error.message, diagnostics);
  }

  if (topicsResult.error) {
    throw new LibraryArchiveSuggestionError(topicsResult.error.message, diagnostics);
  }

  const categories = categoriesResult.data ?? [];
  const topics = topicsResult.data ?? [];
  const categoryById = new Map(categories.map((category) => [category.id, category] as const));
  const topicById = new Map(topics.map((topic) => [topic.id, topic] as const));
  const reviewReason = buildReviewReason({
    archiveSuggestion,
    categoryById,
    topicById,
  });

  if (reviewReason) {
    return {
      ok: true,
      dryRun: false,
      commit: true,
      wroteToDatabase: false,
      requiresReview: true,
      reviewReason,
      archiveSuggestion,
      diagnostics,
    };
  }

  const topicId = archiveSuggestion.topicDecision.topicId as string;
  const now = new Date().toISOString();
  const model = getMiniMaxModel();
  const assignmentPayload: Record<string, unknown> = {
    content_id: contentId,
    topic_id: topicId,
    confidence: clampConfidence(archiveSuggestion.assignment.confidence),
    assignment_reason: cleanText(archiveSuggestion.assignment.reason) || null,
    source: "llm",
    user_adjusted: false,
    model,
    archived_at: now,
    status: "accepted",
    updated_at: now,
  };

  const existingExactResult = await supabaseAdmin
    .from("content_topic_assignments")
    .select("*")
    .eq("content_id", contentId)
    .eq("topic_id", topicId)
    .limit(1)
    .maybeSingle();

  if (existingExactResult.error) {
    throw new LibraryArchiveSuggestionError(existingExactResult.error.message, diagnostics);
  }

  let persisted: ContentTopicAssignmentRow | null = null;

  if (existingExactResult.data) {
    const { data, error } = await supabaseAdmin
      .from("content_topic_assignments")
      .update(assignmentPayload as never)
      .eq("id", existingExactResult.data.id)
      .select("*")
      .single();

    if (error) {
      throw new LibraryArchiveSuggestionError(error.message, diagnostics);
    }

    persisted = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("content_topic_assignments")
      .insert({
        ...assignmentPayload,
        created_at: now,
      } as never)
      .select("*")
      .single();

    if (error) {
      throw new LibraryArchiveSuggestionError(error.message, diagnostics);
    }

    persisted = data;
  }

  if (!persisted) {
    throw new LibraryArchiveSuggestionError("归档写入失败，未返回 assignment。", diagnostics);
  }

  return {
    ok: true,
    dryRun: false,
    commit: true,
    wroteToDatabase: true,
    assignment: {
      contentId,
      topicId,
      assignmentId: persisted.id,
      source: "llm",
      status: "accepted",
    },
    archiveSuggestion,
    diagnostics,
  };
}
