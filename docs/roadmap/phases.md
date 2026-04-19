# KnowBase Development Phases

## 总原则

KnowBase 的最终目标是完整知识提取与知识管理产品。

开发采用分阶段实现：

- 早期阶段可以使用 mock data。
- mock data 只是技术降级，不代表产品目标降级。
- 每个阶段都必须保持与最终产品信息架构兼容。
- 不允许为了快速实现，把产品做成一次性工具或普通内容列表。

## Phase 1 — Mock Frontend

目标：用本地 mock data 做出三页可点击产品壳。

包含：

- 首页 /
- 知识库页 /library
- 知识包页 /content/[id]

不接真实 API，不接数据库。

## Phase 1A — Library Redesign

目标：重构知识库页，让它从普通内容列表升级为动态知识结构页。

重点：

- 最近高频主题
- 动态生成的一级分类卡片
- 二级主题
- 最近解析内容
- 搜索
- 表达分类由内容自动聚合生成，而不是系统固定模板

## Phase 2 — Local State and Mock Task Flow

目标：完善任务状态和前端状态流转。

包含：

- 任务状态更完整
- 多个内容
- 失败任务样式
- 重试按钮样式

## Phase 3 — Supabase Persistence

目标：接入 Supabase，保存任务、内容、章节、关键词。

包含：

- parse_tasks
- contents
- content_sections
- keywords

## Phase 4 — Real Xiaoyuzhou Parsing

目标：接入真实小宇宙链接解析。

包含：

- 解析 episode URL
- 获取标题、作者、简介、音频地址
- 写入任务状态

## Phase 5 — ASR Transcription

目标：接入 ASR，将音频转写为逐字稿。

包含：

- 提交音频
- 轮询转写状态
- 保存 transcript blocks
- 处理失败和超时

## Phase 6 — LLM Knowledge Pack Generation

目标：接入 LLM，将逐字稿转化为结构化知识包。

包含：

- 内容摘要
- 语义章节
- 章节摘要
- Top 5 关键词
- 关键词解释
- 原文证据锚点

## Phase 7 — Dynamic Archive and Search

目标：实现真实动态归档和知识库检索。

包含：

- 新内容匹配已有二级主题
- 建议新建二级主题
- 必要时建议新建一级分类
- 用户确认合并、拆分、重命名
- 标题搜索
- 关键词搜索
- 全文搜索

## Phase 8 — Knowledge Graph and Advanced Features

目标：扩展知识图谱、批注、高亮和导出。

包含：

- 内容关联图谱
- 批注
- 高亮
- 导出分享
