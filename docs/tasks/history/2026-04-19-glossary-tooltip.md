# Historical Task — Glossary Tooltip

## 任务名称

为知识包页 `/content/[id]` 增加逐字稿术语标注与 Tooltip 解释。

## 任务背景

知识包页除了 Top 5 关键词，也需要在逐字稿正文中标注更多值得解释的术语、缩写词、方法名、产品名或概念。

用户阅读逐字稿时，可以直接悬浮术语查看解释，而不必回到关键词卡片区。

## 已实现重点

- 增加 `GlossaryTerm` mock 类型。
- 在内容数据中增加 `glossaryTerms`。
- 明确 `glossaryTerms` 不等于 `topKeywords`。
- Top 5 关键词继续用于知识包顶部关键词卡片。
- `glossaryTerms` 只用于逐字稿 / 文章正文中的术语高亮和 Tooltip。
- 逐字稿正文标注只读取 `glossaryTerm.term` 和 `glossaryTerm.aliases`。
- 不从 `topKeywords` 扫描或生成正文标注词。
- mock 术语模拟“原文出现次数 >= 3 且具有解释价值”的规则。
- 排除普通高频词、代词、虚词、泛化名词和口头填充词。
- 悬浮术语时展示 Tooltip，包含术语名称、解释、语境示例、分类和出现次数。
- 点击术语可定位到对应原文段落。

## 数据原则

- `glossaryTerms` 候选词来自原文正文，不来自 AI 摘要、章节标题、UI 文案或按钮文案。
- 同一概念的不同写法可以通过 `aliases` 归并。
- `occurrenceCount` 表示归并后的出现次数。
- `evidenceBlockIds` 指向术语出现过的 transcript block。

## 范围控制

未实现真实 AI 术语识别、外部资料查询、Wikipedia / Arxiv / 官网查询、延伸关键词推荐、词汇清单模式、复习功能或复杂批注系统。
