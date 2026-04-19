import type {
  LibraryCategory,
  LibraryContentItem,
  LibraryTopic,
} from "./mock-data";

export type { LibraryCategory, LibraryContentItem, LibraryTopic };

export type TableViewRow = {
  id: string;
  title: string;
  platform: string;
  author: string;
  categoryName: string;
  topicName: string;
  topKeywords: string[];
  parsedAt: string;
};

export type MindMapNode = {
  id: string;
  label: string;
  type: "root" | "category" | "topic" | "content";
  topicCount?: number;
  contentCount?: number;
  children?: MindMapNode[];
};

function includesText(value: string, query: string) {
  return value.toLowerCase().includes(query);
}

function matchesAnyText(values: string[], query: string) {
  return values.some((value) => includesText(value, query));
}

function contentIsAllowedByTopic(
  content: LibraryContentItem,
  activeContentIds: Set<string> | null,
) {
  return !activeContentIds || activeContentIds.has(content.id);
}

function contentMatchesQuery(
  content: LibraryContentItem,
  normalizedQuery: string,
  categoryName: string,
  topicName: string,
) {
  if (!normalizedQuery) {
    return true;
  }

  return matchesAnyText(
    [
      content.title,
      content.platform,
      content.author,
      content.summary,
      content.categoryPath,
      categoryName,
      topicName,
      ...content.topKeywords,
    ],
    normalizedQuery,
  );
}

export function contentMatches(
  content: LibraryContentItem,
  normalizedQuery: string,
  activeContentIds: Set<string> | null,
) {
  const matchesTopic =
    !activeContentIds || activeContentIds.has(content.id);

  if (!matchesTopic) {
    return false;
  }

  if (!normalizedQuery) {
    return true;
  }

  return (
    includesText(content.title, normalizedQuery) ||
    includesText(content.categoryPath, normalizedQuery) ||
    includesText(content.platform, normalizedQuery) ||
    includesText(content.author, normalizedQuery) ||
    includesText(content.summary, normalizedQuery) ||
    content.topKeywords.some((keyword) => includesText(keyword, normalizedQuery))
  );
}

export function filterLibraryCategories(
  categories: LibraryCategory[],
  normalizedQuery: string,
  activeContentIds: Set<string> | null,
) {
  return categories
    .map((category) => {
      const categoryMatchesQuery =
        !normalizedQuery ||
        matchesAnyText(
          [
            category.name,
            category.description,
            category.generatedReason,
            ...category.topKeywords,
          ],
          normalizedQuery,
        );

      const topics = category.topics
        .map((topic) => {
          const topicMatchesQuery =
            !normalizedQuery ||
            matchesAnyText([topic.name, ...topic.topKeywords], normalizedQuery);
          const contentsAllowedByTopic = topic.contents.filter((content) =>
            contentIsAllowedByTopic(content, activeContentIds),
          );
          const contents = contentsAllowedByTopic.filter(
            (content) =>
              categoryMatchesQuery ||
              topicMatchesQuery ||
              contentMatchesQuery(
                content,
                normalizedQuery,
                category.name,
                topic.name,
              ),
          );

          if (contents.length === 0) {
            return null;
          }

          return {
            ...topic,
            contents,
          };
        })
        .filter((topic): topic is LibraryTopic => Boolean(topic));

      if (topics.length === 0) {
        return null;
      }

      return {
        ...category,
        topics,
      };
    })
    .filter((category): category is LibraryCategory => Boolean(category));
}

export function buildTableRows(categories: LibraryCategory[]): TableViewRow[] {
  return categories.flatMap((category) =>
    category.topics.flatMap((topic) =>
      topic.contents.map((content) => ({
        id: content.id,
        title: content.title,
        platform: content.platform,
        author: content.author,
        categoryName: category.name,
        topicName: topic.name,
        topKeywords: content.topKeywords,
        parsedAt: content.parsedAt,
      })),
    ),
  );
}

export function buildMindMapTree(categories: LibraryCategory[]): MindMapNode {
  return {
    id: "root",
    label: "我的知识库",
    type: "root",
    children: categories.map((category) => ({
      id: category.id,
      label: category.name,
      type: "category",
      topicCount: category.topics.length,
      contentCount: category.topics.reduce(
        (total, topic) => total + topic.contents.length,
        0,
      ),
      children: category.topics.map((topic) => ({
        id: topic.id,
        label: topic.name,
        type: "topic",
        contentCount: topic.contents.length,
        children: topic.contents.map((content) => ({
          id: content.id,
          label: content.title,
          type: "content",
        })),
      })),
    })),
  };
}
