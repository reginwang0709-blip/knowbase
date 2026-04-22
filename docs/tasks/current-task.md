# Current Task

## 任务名称

Phase 3G-1：基于真实 transcriptBlocks 用 MiniMax 生成轻量知识包摘要和关键词。

## 本阶段目标

输入已有 contentId，读取已有真实 transcriptBlocks，只调用 MiniMax 生成：

* generatedSummary，150-250 字
* keywords，最多 5 个

本阶段不生成 sections，不生成 glossaryTerms。
sections 仍优先使用 shownotes 时间戳目录。
glossaryTerms 留到后续单独阶段。

## Step 2 Sections 优先级

Step 2 默认不调用 LLM。

优先级规则：

1. 如果小宇宙 `shownotes / description / summary` 中能解析出时间戳目录：

   * 直接使用规则解析出的 sections
   * 不调用 LLM
   * 不进入 Step 2 LLM

2. 只有在以下情况才考虑后续 Step 2 LLM：

   * 没有 shownotes 时间戳目录
   * 或规则解析出的 sections 为空
   * 或 sections 明显质量过低

本阶段只需要明确这个优先级，不实现 Step 2 LLM。

## 设计原因

原一次性生成 summary + sections + keywords + glossaryTerms 的请求过重，容易触发 MiniMax Starter 的拥挤/限流/输出不稳定问题。因此先拆分任务，降低输入和输出负载。

## 边界

* 不调用 Fun-ASR
* 不触发新的小宇宙解析
* 不接主流程
* 不批量处理 library
* dryRun 默认不写库

## MiniMax 环境变量

* `MINIMAX_API_KEY`
* `MINIMAX_BASE_URL`，默认 `https://api.minimaxi.com/v1`
* `MINIMAX_MODEL`，默认 `MiniMax-M2.7`

不要打印 key。

## 实现要求

先通过 debug API 验证单条 content：

`POST /api/debug/llm/knowledge-pack`

body：

```json
{
  "contentId": "已有真实小宇宙 contentId",
  "stage": "summary_keywords",
  "dryRun": true
}
```

输出只包含：

```ts
{
  generatedSummary: string;
  keywords: Array<{
    term: string;
    explanation: string;
    context: string;
    evidenceBlockId: string;
  }>;
}
```

## Keywords 定义

本阶段的 keywords 不是泛主题词，而是：

“在本文中出现频率较高、能够代表内容主题、且具有具体信息量的专有名词 / 核心概念 / 工具 / 方法 / 产品名 / 技术名词。”

关键词优先选择：

* 产品名
* 工具名
* 方法名
* 技术框架
* 业务概念
* 平台名
* 重要组织 / 人名
* 本文反复讨论的核心术语

关键词应避免：

* 泛词：用户、系统、内容、功能、项目、东西、问题
* 纯动词：使用、实现、完成、进行
* 口语词：然后、就是、这个、那个、嗯、呃
* 过短且无具体含义的词
* 只出现一次且不重要的词

## Keyword Candidates 预处理

在进入 MiniMax prompt 前，先做本地候选词提取：

* 从 transcriptBlocks 中提取英文/数字/符号组合候选，如 `API`、`OpenClaw`、`Spring Boot`
* 提取 2-8 字中文名词短语候选
* 优先保留包含“平台 / 系统 / 框架 / 模型 / 接口 / 工具 / 产品 / 方法 / 协议 / API”等关键词的短语
* 统计出现次数
* 记录首次出现 block id
* 去掉停用词和泛词
* 按出现次数和具体性排序
* 最多取前 20 个 candidates 提供给 MiniMax

本阶段仍然只做 `summary_keywords`，不生成 sections，不生成 glossaryTerms。

## 写库策略

dryRun=true：不写数据库。
dryRun=false：只写入：

* `content_payload.generatedSummary`
* `content_payload.keywords`
* `content_payload.generationMetadata.stages.summaryKeywords`

保留：

* transcriptBlocks
* sourceMetadata
* sections
* glossaryTerms

## LLM 请求负载控制

1. 输入 transcriptBlocks 控制在 20-40 个 block。
2. 总 transcript 输入控制在 5000 字符以内。
3. prompt 不要求生成 sections。
4. prompt 不要求生成 glossaryTerms。
5. keywords 最多 5 个。
6. evidenceBlockId 必须来自输入 block id。
7. prompt 中应优先使用本地 `keywordCandidates` 选择关键词。
8. 输出严格 JSON，但结构要比原来更简单。

## 错误处理

* 529 / overloaded：返回服务拥挤，请稍后重试
* 429 / rate limit：返回限流，请稍后重试
* 401：返回鉴权失败，请检查 key/endpoint
* token 过长：进一步减少 transcript 输入后重试一次
* dryRun=true 时永远不写库
