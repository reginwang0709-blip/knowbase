# Current Task

## 任务名称

Phase 2A：为 KnowBase 增加数据库与 API 骨架，先用 mock processing 跑通持久化闭环。

## 任务目标

当前前端已经基本完成，但数据仍然主要来自 mock data。

下一步目标不是接真实 ASR / LLM，而是先完成最小持久化闭环：

用户提交链接
→ 创建解析任务
→ 后端保存任务
→ mock processing 生成知识包
→ 知识包写入数据库
→ 知识库从数据库读取
→ 知识包页从数据库读取

## 技术方向

优先使用：

* Supabase PostgreSQL 作为数据库
* Next.js App Router API Routes 作为轻后端接口
* 现有 `src/lib/data-access.ts` 作为前端数据访问层

## 重要原则

不要一次性实现完整复杂后端。

当前阶段只做最小可持久化闭环。

不要接：

* 真实小宇宙解析
* YouTube 解析
* 网页正文解析
* ASR
* LLM
* 动态归档算法
* 图谱 API
* 用户登录
* 批注
* 导出
* 后台队列系统

## 数据库方案

当前阶段采用混合式 schema。

先不要把 sections、transcriptBlocks、keywords、glossaryTerms 全部拆成独立表。

先用 `contents.content_payload jsonb` 保存完整知识包结构，降低前端适配成本。

需要设计这些表：

1. `parse_tasks`
2. `contents`
3. `library_categories`
4. `library_topics`
5. `content_topic_assignments`

## parse_tasks

用于首页任务流。

字段建议：

* id
* url
* platform
* title
* status
* progress
* content_id
* error_message
* created_at
* updated_at

status 包含：

* submitted
* detecting_source
* extracting_content
* generating_transcript
* generating_knowledge_pack
* completed
* failed

## contents

用于知识包主体。

字段建议：

* id
* task_id
* title
* platform
* source_url
* author
* published_at
* parsed_at
* summary
* content_payload jsonb
* created_at
* updated_at

`content_payload` 保存当前前端需要的完整结构，包括：

* keywords
* sections
* glossaryTerms
* transcriptBlocks

## library_categories

用于一级知识领域。

字段建议：

* id
* name
* description
* generated_reason
* source_content_count
* confidence
* last_adjusted_at
* created_at
* updated_at

## library_topics

用于二级主题。

字段建议：

* id
* category_id
* name
* description
* top_keywords
* created_at
* updated_at

## content_topic_assignments

用于内容和主题的归档关系。

字段建议：

* id
* content_id
* topic_id
* confidence
* assignment_reason
* created_at
* updated_at

## API 设计

当前阶段需要设计这些 API：

1. `POST /api/parse-tasks`

   * 提交链接
   * 创建 parse_task
   * mock 生成 content
   * 写入 contents 和归档关系
   * 返回 task

2. `GET /api/parse-tasks/:id`

   * 查询任务状态

3. `GET /api/library`

   * 返回当前 `/library` 需要的数据结构：

     * libraryCategories
     * recentTopics
     * recentContents

4. `GET /api/contents/:id`

   * 返回当前 `/content/[id]` 需要的数据结构

## 前端适配原则

尽量不改页面组件。

优先修改：

* `src/lib/data-access.ts`

让页面继续调用：

* `getLibraryData()`
* `getKnowledgeItemById(id)`

只是内部从 mock data 改为 API / 数据库。

## 当前任务要求

现在先不要写代码。

请先读取：

* `AGENTS.md`
* `docs/product/final-product-spec.md`
* `docs/product/information-architecture.md`
* `docs/product/dynamic-archive-principles.md`
* `docs/contracts/data-contracts.md`
* `src/lib/mock-data.ts`
* `src/lib/data-access.ts`
* `src/lib/library-view-model.ts`
* `src/app/page.tsx`
* `src/app/library/page.tsx`
* `src/app/content/[id]/page.tsx`
* `src/app/content/[id]/KnowledgePackClient.tsx`

然后输出方案评估：

1. 当前前端需要哪些核心数据结构
2. 这个混合式 schema 是否足够支撑当前页面
3. 是否需要补充字段
4. API response 应该如何对齐当前前端
5. `data-access.ts` 应该如何逐步替换
6. 哪些代码暂时不要改
7. 如果要开始实现，第一步应该创建哪些文件
8. 需要哪些 Supabase 环境变量
9. 风险点和回滚方案

在用户确认前，不要改业务代码。
