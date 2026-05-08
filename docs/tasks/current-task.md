# Current Task

## 任务名称

Phase 3G-3：基于真实 transcriptBlocks、generatedSummary、keywords 和 sections，用 MiniMax 生成 glossaryTerms。

## 背景

当前已经完成：

* 小宇宙真实 transcriptBlocks
* transcriptBlocks 清洗合并
* shownotes-first sections
* MiniMax summary_keywords 阶段
* `content_payload.generatedSummary`
* `content_payload.keywords`
* `generationMetadata.stages.summaryKeywords`
* Step 2 sections 决策树：有高质量 shownotes 时间线时，sections 使用 shownotes；LLM 只用于补 section summary 或在无可用 shownotes 时 fallback

当前要做：

* 单独生成 glossaryTerms
* 不重新生成 summary / keywords / sections

## 本阶段目标

输入已有 contentId，读取已有：

* title
* generatedSummary
* keywords
* sections
* transcriptBlocks 精选片段

调用 MiniMax 生成：

* glossaryTerms

每个 glossary term 应解释“这个词在本内容中的含义”，不是百科式定义。

## 边界

* 不调用 Fun-ASR
* 不触发新的小宇宙解析
* 不接主流程
* 不批量处理 library
* dryRun 默认不写库
* 不修改 summary / keywords / sections

## Debug API

继续使用：

`POST /api/debug/llm/knowledge-pack`

body：

```json
{
  "contentId": "已有真实小宇宙 contentId",
  "stage": "glossary_terms",
  "dryRun": true,
  "force": false
}
```

默认 stage 可以仍是 `summary_keywords`，但当 `stage = glossary_terms` 时，只执行术语解释生成。

另增只读诊断 stage：

```json
{
  "contentId": "已有真实小宇宙 contentId",
  "stage": "glossary_candidates",
  "dryRun": true
}
```

该 stage 只做全文 glossary candidates 抽取、归一化、去重、关键词去重、预期术语检查和 batch 规划，不调用 MiniMax，不写库。

## 输出结构

MiniMax 只需返回严格 JSON：

```ts
{
  "glossaryTerms": [
    {
      "id": "g-001",
      "term": "术语",
      "aliases": ["可选别名"],
      "definition": "这个词在本内容里的含义",
      "contextExample": "它在节目中出现的上下文",
      "category": "concept | person | organization | abbreviation | method | product",
      "occurrenceCount": 3,
      "evidenceBlockIds": ["t-001"]
    }
  ]
}
```

## glossaryTerms 新定义

glossaryTerms 用来解释：

“文中出现、用户可能需要解释才能理解或复用的专有名词、人名、产品名、组织名、缩写、技术名词和特定方法名。”

## glossaryTerms 选择标准

优先选择：

* 人名
* 公司 / 组织名
* 产品名
* 工具名
* 框架名
* 模型名
* 缩写
* 技术概念
* 特定方法名
* 具有上下文含义的行业术语

避免选择：

* keywords 中已经出现的 term
* 泛词：用户、系统、内容、问题、功能、项目、能力、模型、产品
* 口语词
* 纯动词
* 纯形容词
* 平台分发信息
* 链接 / 社群 / 运营信息
* 没有解释价值的普通词

## definition 要求

每个 definition 应说明：

* 这个词在本内容中指什么
* 为什么在本内容中重要
* 与本内容主题的关系

不要写成通用百科定义。
不要直接复制 transcript 原句。
不要只写“文中提到的某某”。

## 输入控制

1. glossary 候选词必须从完整 transcriptBlocks 抽取，不能只从 prompt 抽样片段抽取。
2. MiniMax 不直接自由挑词，而是只解释全文候选抽取后的 glossaryCandidates。
3. 不要把全部 transcriptBlocks 原文塞进 prompt。
4. 使用：

   * generatedSummary
   * keywords
   * section titles / summaries
   * glossaryCandidates（来自全文候选抽取）
5. glossaryTerms 不设置固定数量上限。
6. candidates 不允许固定 top-N 截断；如果候选很多，必须按 prompt 字符数分批。
7. evidenceBlockIds 必须来自 candidate 的真实证据 block。
8. 不要生成 summary / keywords / sections。

## glossary 与 keywords 去重

生成 glossaryTerms 时，必须显式传入已有 `keywords`，并要求：

* 不要输出和 existingKeywords 完全相同的 term
* 不要输出大小写不同但实质相同的重复项
* 不要输出全角半角差异导致的重复项
* 如果某个关键词本身需要解释，优先由 keyword explanation/context 承担，不进入 glossaryTerms

写库前也要做一层本地过滤，去掉与 keywords 重复的 glossaryTerms。

## glossary candidates 与 batching

glossary 生成链路应是：

全文候选抽取 → 候选诊断可视化 → 候选分批送入 MiniMax → 合并结果 → post-validation → 写库

要求：

* 不能使用固定 top 32 / top 40 之类的机械截断。
* 如果候选很多，用 batching，而不是丢弃候选。
* 每个 batch 按 prompt 字符数控制，而不是按固定候选数量控制。
* glossaryTerms 最终不设固定数量上限。

## glossaryCandidates 质量要求

glossaryCandidates 需要分层：

* `high`
  只保留明确产品名、组织名、模型名/版本号、人名、会议/活动名、技术术语，或命中显式高价值白名单的候选。
* `medium`
  看起来像专名，但形式不够稳定，或上下文较弱，需要后续再判断。
* `low`
  长句残片、拼接噪音、泛词、角色描述、口语碎片。

高置信度候选中，不应保留以下类型：

* 英文标题残片
* 全大写长句片段
* ASR 拼接词
* `AI SOFTWARE ENGINEER`、`AI CODING AGENT`、`CEO JACK DORSEY` 这类角色描述型短语

## canonical term 规范

glossary candidate 的展示写法需要统一标准化：

* 保留关键缩写的大写，例如 `GDC大会`
* 品牌/组织名按标准写法输出，例如 `OpenAI`、`DeepSeek`、`GitHub Copilot`、`MiniMax`
* 中文 + 缩写组合按统一写法输出，例如 `GDC大会`
* 不要把普通词误美化成品牌名

当前 glossary candidate 主路径应满足：

* 不依赖具体 term 白名单
* 不依赖具体 term 兜底拉回
* 不依赖具体品牌/人名/会议名映射字典
* 只允许通用模式召回、通用去重、通用标准化和 keyword overlap 过滤

## dryRun 规则

`dryRun=true`：

* 不写数据库
* 不修改 generationMetadata
* 只返回 glossaryTerms 或错误

`dryRun=false`：

* 如果 `generationMetadata.stages.glossary.status === "running"`：

  * 返回 `LLM_GENERATION_IN_PROGRESS`
  * 不重复调用 MiniMax

* 如果已经 `succeeded` 且已有 glossaryTerms，且 `force !== true`：

  * 返回 `LLM_GENERATION_ALREADY_EXISTS`
  * 不重复调用 MiniMax

* 否则：

  * 写入 `running`
  * 调用 MiniMax
  * 成功后写入：

    * `content_payload.glossaryTerms`
    * `generationMetadata.stages.glossary.status = "succeeded"`
  * 失败后写入：

    * `generationMetadata.stages.glossary.status = "failed"`
    * `errorType`
    * `errorMessage`

## 写库保护

dryRun=false 写库时，不要覆盖：

* transcriptBlocks
* sourceMetadata
* generatedSummary
* keywords
* sections
* section title / timestamp / order

只更新：

* glossaryTerms
* generationMetadata.stages.glossary

## 错误处理

沿用 MiniMax 错误分类：

* 529 → overloaded_error
* 429 → rate_limited
* 401 → auth_error
* token limit → token_limit
* fetch failed → network_error / dns_error / tls_error / timeout / proxy_error

如果 token 过长：

* 缩短 transcript 输入后最多重试一次
* 不要无限重试

## 实现要求

请在已有 Phase 3G LLM 框架上扩展，不要重写。

允许修改：

* `src/lib/llm/knowledge-pack-generator.ts`
* `src/app/api/debug/llm/knowledge-pack/route.ts`
* `src/lib/api-mappers.ts`
* `docs/tasks/current-task.md`

如确有必要，可以少量修改：

* `src/lib/llm/minimax-client.ts`

不要修改：

* `/api/parse-tasks`
* 首页
* 知识库页
* 内容页 UI 大结构
* Supabase schema
* mock data
* Fun-ASR 代码
* `.env.local`

## 验证

优先代码级验证，不强求 MiniMax 调用成功。

运行：

```bash
npm run typecheck
npm run lint
npm run build
```

如果要调用 MiniMax，只允许对已有真实小宇宙 contentId 做一次 dryRun：

```json
{
  "contentId": "d2bbdb1f-cc3e-4c75-84cd-d328e8bb0ff1",
  "stage": "glossary_terms",
  "dryRun": true
}
```

如果 dryRun 成功，再由我确认是否 dryRun=false 写库。
