# KnowBase Data Contracts

## 1. 设计原则

数据结构应尽量接近未来真实 API 和数据库结构。

页面不要写死业务内容，应从数据结构中读取。

## 2. KnowledgePack

export type KnowledgePack = {
  id: string
  title: string
  platform: string
  sourceUrl: string
  author: string
  publishedAt: string
  parsedAt: string
  duration?: string
  language?: string
  summary: string
  categoryPath: string
  topKeywords: Keyword[]
  sections: Section[]
  transcriptBlocks: TranscriptBlock[]
}

## 3. Keyword

export type Keyword = {
  id: string
  term: string
  definition: string
  contextExample: string
  evidenceBlockIds: string[]
}

## 4. Section

export type Section = {
  id: string
  title: string
  summary: string
  order: number
  startBlockId: string
  endBlockId?: string
  startTimestamp?: string
  endTimestamp?: string
  evidenceBlockIds?: string[]
}

## 5. TranscriptBlock

export type TranscriptBlock = {
  id: string
  timestamp: string
  speaker: string
  text: string
}

## 6. LibraryCategory

export type LibraryCategory = {
  id: string
  name: string
  description: string
  generatedReason: string
  sourceContentCount: number
  confidence: number
  lastAdjustedAt: string
  contentCount: number
  topicCount: number
  topKeywords: string[]
  updatedAt: string
  topics: LibraryTopic[]
}

## 7. LibraryTopic

export type LibraryTopic = {
  id: string
  name: string
  contentCount: number
  topKeywords: string[]
  contents: LibraryContentItem[]
}

## 8. LibraryContentItem

export type LibraryContentItem = {
  id: string
  title: string
  platform: string
  author: string
  summary: string
  categoryPath: string
  topKeywords: string[]
  parsedAt: string
}

## 9. RecentTopic

export type RecentTopic = {
  id: string
  name: string
  contentCount: number
  relatedContentIds: string[]
}

## 10. TaskStatus

export type TaskStatus =
  | "submitted"
  | "detecting_source"
  | "extracting_content"
  | "generating_transcript"
  | "generating_knowledge_pack"
  | "completed"
  | "failed"

## 11. ParseTask

export type ParseTask = {
  id: string
  url: string
  platform: string
  title?: string
  status: TaskStatus
  progress: number
  submittedAt: string
  completedAt?: string
  contentId?: string
  errorMessage?: string
}

## 12. 数据一致性要求

- Keyword.evidenceBlockIds 必须能对应到 KnowledgePack.transcriptBlocks 中存在的 id。
- KnowledgePack.sections 同时用于渲染知识包页目录和语义章节内容。
- Section.order 用于确定目录展示顺序。
- Section.startBlockId 必须能对应到 transcript block id。
- Section.startBlockId 必须能对应到 transcript block id，用于点击目录后跳转定位。
- Section.startTimestamp 可用于展示目录中的章节起始时间。
- 目录不应在页面中硬编码，应由 KnowledgePack.sections 生成。
- LibraryContentItem.id 应能对应到某个 KnowledgePack id。
- RecentTopic.relatedContentIds 应能对应到内容 id。
- 页面跳转路径应使用内容 id，例如 /content/demo-001。
- LibraryCategory.generatedReason 用于解释该分类为什么被系统聚合生成。
- LibraryCategory.sourceContentCount 表示参与形成该分类的内容数量。
- LibraryCategory.confidence 表示系统对该分类结构合理性的置信度。
- LibraryCategory.lastAdjustedAt 表示该分类结构最近一次调整时间。
