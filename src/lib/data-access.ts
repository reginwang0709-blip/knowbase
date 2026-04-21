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
  task: ParseTaskResult["task"];
  taskId?: string;
  contentId?: string;
  duplicated?: boolean;
  code?: string;
  message?: string;
};

export type ParseTaskResult = {
  task: {
    id: string;
    url: string;
    title: string | null;
    platform: string | null;
    status:
      | "submitted"
      | "detecting_source"
      | "extracting_content"
      | "generating_transcript"
      | "generating_knowledge_pack"
      | "completed"
      | "failed";
    progress: number;
    content_id: string | null;
    error_message?: string | null;
  };
  taskId?: string;
  contentId?: string;
  duplicated?: boolean;
  code?: string;
  message?: string;
};

export type DeleteContentResult = {
  ok: boolean;
  deletedContentId: string;
};

export class ContentFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ContentFetchError";
    this.status = status;
  }
}

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

  if (!response.ok && response.status !== 409) {
    let errorMessage = "Parse task request failed.";

    try {
      const data = (await response.json()) as { error?: unknown };

      if (typeof data.error === "string" && data.error.trim()) {
        errorMessage = data.error;
      }
    } catch {
      // Keep the default message when the error response is not JSON.
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as Partial<CreateParseTaskResult>;

  if (!data.task || typeof data.task.id !== "string") {
    throw new Error("Parse task response is missing task.");
  }

  return {
    task: data.task,
    taskId: data.taskId ?? data.task.id,
    contentId: data.contentId,
    duplicated: data.duplicated,
    code: data.code,
    message: data.message,
  };
}

export async function getParseTaskById(id: string): Promise<ParseTaskResult> {
  const response = await fetch(`/api/parse-tasks/${id}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Parse task status request failed.");
  }

  const data = (await response.json()) as Partial<ParseTaskResult>;

  if (!data.task || typeof data.task.id !== "string") {
    throw new Error("Parse task status response is missing task.");
  }

  return {
    task: data.task,
    taskId: data.taskId ?? data.task.id,
    contentId: data.contentId,
    duplicated: data.duplicated,
    code: data.code,
    message: data.message,
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
  if (id === "demo-001") {
    return getMockKnowledgeItemById("demo-001");
  }

  try {
    const apiUrl = baseUrl
      ? new URL(`/api/contents/${id}`, baseUrl).toString()
      : `/api/contents/${id}`;
    const response = await fetch(apiUrl, {
      cache: "no-store",
    });

    if (response.status === 404) {
      throw new ContentFetchError("内容不存在。", 404);
    }

    if (!response.ok) {
      throw new ContentFetchError("内容加载失败，请稍后重试。", response.status);
    }

    const item = (await response.json()) as Partial<KnowledgeItem>;

    if (
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.sourcePlatform !== "string" ||
      typeof item.sourceUrl !== "string" ||
      typeof item.summary !== "string" ||
      !Array.isArray(item.keywords) ||
      !Array.isArray(item.sections) ||
      !Array.isArray(item.chapters) ||
      !Array.isArray(item.glossaryTerms) ||
      !Array.isArray(item.transcriptBlocks)
    ) {
      throw new ContentFetchError("内容数据异常，暂时无法展示。", 500);
    }

    return item as KnowledgeItem;
  } catch (error) {
    if (error instanceof ContentFetchError) {
      throw error;
    }

    throw new ContentFetchError("内容加载失败，请稍后重试。", 500);
  }
}
