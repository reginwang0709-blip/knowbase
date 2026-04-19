import {
  getKnowledgeItemById as getMockKnowledgeItemById,
  libraryCategories,
  recentContents,
  recentTopics,
} from "./mock-data";

export function getLibraryData() {
  return {
    libraryCategories,
    recentTopics,
    recentContents,
  };
}

export function getKnowledgeItemById(id: string) {
  return getMockKnowledgeItemById(id);
}
