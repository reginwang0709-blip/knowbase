# KnowBase

> 一个把长播客、视频和文章转化为结构化知识包的 AI 个人知识库产品。

KnowBase 面向重度内容消费者。用户输入一条内容链接后，系统会自动完成内容解析、语音转写、语义章节生成、关键词识别、术语解释和知识库归档，把“看过 / 收藏过”的长内容转化为可以检索、回看和复用的知识资产。

## Demo（可交互

- Online Demo：**https://knowbase-gules.vercel.app/**


## Why KnowBase

长内容的核心价值往往不在“当下看完”，而在于之后能不能重新找到、理解和复用。

但真实使用中，播客、视频和文章经常停留在收藏夹里。用户记得“这里面好像有个观点”，却很难再次定位到具体片段，也很难把不同内容里的概念和主题串起来。

KnowBase 试图解决的是：

```text
内容被消费 → 内容被结构化 → 内容被沉淀 → 知识可复用
````
---

## Core Flow

```text
提交链接
  → 创建解析任务
  → 提取内容信息
  → ASR 转写逐字稿
  → 生成摘要、章节、关键词和术语
  → 在知识包页阅读和回看
  → 沉淀到个人知识库
```

---

## Features

### 1. Link Parsing

用户粘贴内容链接后，系统会识别来源并创建解析任务。

当前已支持：

* 链接提交
* 来源识别
* 任务状态展示
* 重复链接拦截
* 已解析内容复用
* 小宇宙播客元信息提取
* 小宇宙音频地址提取

### 2. Transcript Generation

系统通过 Fun-ASR 生成真实逐字稿，并对结果做轻量清洗。

当前已支持：

* 异步 ASR 转写
* 任务状态轮询
* transcript blocks 写入
* 口语填充词清洗
* 过碎分段合并
* 基于 shownotes 的章节解析

### 3. Knowledge Pack

每条内容会生成一个独立知识包。

知识包包括：

* 摘要
* 语义章节
* 关键词
* Glossary Terms
* 逐字稿
* 原文上下文

### 4. Glossary Terms

KnowBase 会识别内容中的公司、产品、模型、技术概念和行业术语，并在逐字稿中高亮解释。

为了避免大模型一次性生成大量术语解释导致慢、截断和结构化失败，当前采用：

```text
术语候选池
  → 核心术语预生成解释
  → 其余术语 pending
  → 用户 hover 时按需生成解释
```

用户也可以手动框选逐字稿中的文本，将其添加为术语并生成解释。

### 5. Knowledge Library

解析后的内容会进入知识库，并以领域、主题和内容卡片的方式组织。

当前支持：

* 卡片视图
* 表格视图
* 思维导图视图
* 内容删除
* 动态归档展示

---

## Architecture

```text
Frontend
  Next.js App Router
  React
  TypeScript
  Tailwind CSS

Backend
  Next.js API Routes

Database
  Supabase PostgreSQL

AI Services
  Fun-ASR：语音转写
  MiniMax：内容结构化与术语解释
```

---

## What is implemented

* 内容链接提交
* 解析任务创建
* 小宇宙播客信息提取
* 音频地址提取
* Fun-ASR 异步转写
* 真实逐字稿写入
* 逐字稿清洗与合并
* 知识包页面
* 知识库页面
* 链接去重
* 内容删除
* Supabase 数据持久化
* MiniMax 调用链路
* 术语识别与高亮
* Hover 按需生成术语解释
* 用户框选添加术语
* Debug dryRun API

---

## In progress

* 收敛术语高亮策略，减少误识别和重复高亮
* 优化 hover tooltip 的 pending / failed 状态
* 加强术语 alias 合并和去重
* 接入 LLM 自动知识归档
* 扩展更多内容来源

---
