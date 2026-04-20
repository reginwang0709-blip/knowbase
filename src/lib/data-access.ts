import {
  getKnowledgeItemById as getMockKnowledgeItemById,
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

    return (await response.json()) as LibraryData;
  } catch {
    return getFallbackLibraryData();
  }
}

export function getKnowledgeItemById(id: string) {
  return getMockKnowledgeItemById(id);
}
