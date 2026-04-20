import {
  getKnowledgeItemById as getMockKnowledgeItemById,
  type KnowledgeItem,
  libraryCategories,
  type LibraryCategory,
  type LibraryContentItem,
  type RecentTopic,
  recentContents,
  recentTopics,
} from "./mock-data";

export type LibraryData = {
  libraryCategories: LibraryCategory[];
  recentTopics: RecentTopic[];
  recentContents: LibraryContentItem[];
};

export type CreateParseTaskResult = {
  task: unknown;
  contentId: string;
  duplicated?: boolean;
};

export type DeleteContentResult = {
  ok: boolean;
  deletedContentId: string;
};

export function getFallbackLibraryData(): LibraryData {
  return {
    libraryCategories,
    recentTopics,
    recentContents,
  };
}

export async function getLibraryData(): Promise<LibraryData> {
  try {
    const response = await fetch("/api/library", {
      cache: "no-store",
    });

    if (!response.ok) {
      return getFallbackLibraryData();
    }

    const data = (await response.json()) as LibraryData;

    if (
      data.libraryCategories.length === 0 &&
      data.recentTopics.length === 0 &&
      data.recentContents.length === 0
    ) {
      return getFallbackLibraryData();
    }

    return data;
  } catch {
    return getFallbackLibraryData();
  }
}

export async function createParseTask(
  url: string,
): Promise<CreateParseTaskResult> {
  const response = await fetch("/api/parse-tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("Parse task request failed.");
  }

  const data = (await response.json()) as Partial<CreateParseTaskResult>;

  if (!data.contentId) {
    throw new Error("Parse task response is missing contentId.");
  }

  return {
    task: data.task,
    contentId: data.contentId,
    duplicated: data.duplicated,
  };
}

export async function deleteContentById(
  id: string,
): Promise<DeleteContentResult> {
  const response = await fetch(`/api/contents/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Delete content request failed.");
  }

  return (await response.json()) as DeleteContentResult;
}

export async function getKnowledgeItemById(
  id: string,
  baseUrl?: string,
): Promise<KnowledgeItem | undefined> {
  const fallbackItem =
    getMockKnowledgeItemById(id) ?? getMockKnowledgeItemById("demo-001");

  if (id === "demo-001") {
    return fallbackItem;
  }

  try {
    const apiUrl = baseUrl
      ? new URL(`/api/contents/${id}`, baseUrl).toString()
      : `/api/contents/${id}`;
    const response = await fetch(apiUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      return fallbackItem;
    }

    return (await response.json()) as KnowledgeItem;
  } catch {
    return fallbackItem;
  }
}
