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
2. 总 transcript 输入控制在 5000-7000 字符以内。
3. prompt 不要求生成 sections。
4. prompt 不要求生成 glossaryTerms。
5. keywords 最多 5 个。
6. evidenceBlockId 必须来自输入 block id。
7. 输出严格 JSON，但结构要比原来更简单。

## 错误处理

* 529 / overloaded：返回服务拥挤，请稍后重试
* 429 / rate limit：返回限流，请稍后重试
* 401：返回鉴权失败，请检查 key/endpoint
* token 过长：进一步减少 transcript 输入后重试一次
* dryRun=true 时永远不写库
