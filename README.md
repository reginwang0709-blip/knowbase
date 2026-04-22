# KnowBase 项目说明

## 中文版

KnowBase 是一个面向重度内容输入者的 AI 个人知识库产品，目标是把播客、文章、视频等长内容从“看过/收藏过”转化为可检索、可回看、可复用的知识资产。用户在首页粘贴内容链接后，系统会创建解析任务，并在解析完成后生成一份结构化知识包；用户可以在知识包页查看内容摘要、语义章节、关键词、术语解释和逐字稿，也可以在知识库页查看所有内容的动态归档结果。

目前产品已经形成三段核心用户旅程：

1. **首页：提交链接并创建解析任务**  
   用户粘贴链接后，系统会识别内容来源，创建解析任务，并展示真实任务状态。任务卡片会根据后端状态显示标题、来源平台、链接、解析进度和错误信息。对于正在解析或已经解析过的链接，系统会进行拦截，避免重复解析和重复消耗转写成本。

2. **知识包页：查看单篇内容的结构化结果**  
   每条内容会生成独立知识包，展示标题、来源、作者、发布时间、摘要、智能目录、语义章节、关键词、术语解释和逐字稿。对于小宇宙播客内容，系统已经可以提取真实节目信息和音频地址，并通过 Fun-ASR 转写生成真实逐字稿。知识包页还会对逐字稿进行轻量清洗和合并，减少“嗯、呃”等口语填充词和过碎分段，让内容更适合阅读和复用。

3. **知识库页：管理和浏览沉淀内容**  
   解析后的内容会进入知识库，并以一级知识领域、二级主题和内容卡片的形式展示。知识库支持卡片视图、表格视图和思维导图视图，便于用户从不同维度管理内容。当前也支持同链接去重、正在解析任务拦截、已解析内容复用和单篇内容删除。

在技术实现上，KnowBase 已经从纯前端 mock demo 推进到具备后端持久化能力的 MVP。项目使用 Next.js 构建前端与 API Routes，使用 Supabase PostgreSQL 保存解析任务、内容数据、知识库分类、主题和内容归档关系。小宇宙解析链路已经接入真实页面信息提取和异步 ASR 任务流：系统可以解析小宇宙 episode URL，获取标题、主播、发布时间、简介、封面和音频地址，并通过 `parse_tasks.processing_payload` 保存 ASR 中间状态，由前端轮询真实任务状态，最终将真实逐字稿写入内容数据。

当前版本的真实能力包括：链接基础信息识别、小宇宙音频地址获取、异步 ASR 转写、真实任务状态轮询、逐字稿清洗合并、基于 shownotes 时间戳的章节解析、知识库动态展示、内容去重和删除。

当前仍存在一些限制：LLM 还没有正式接入主流程，因此摘要、关键词、术语解释和深层语义结构仍未完全由模型基于真实逐字稿生成；知识库页的一级领域和二级主题虽然已经具备动态展示结构，但还没有接入 LLM 做真正的智能归档和主题生成；ASR 目前依赖外部服务额度，后续需要进一步控制转写成本和失败重试策略。

下一步计划是接入 LLM：先基于已有真实 transcriptBlocks 生成单篇知识包的 summary、sections、keywords 和 glossaryTerms；再进一步接入知识库层面的智能归档能力，让系统能够根据内容自动判断一级领域、二级主题、归档理由和关键词。

---

## English Version

KnowBase is an AI-powered personal knowledge base designed for users who consume large amounts of long-form content, such as podcasts, articles, and videos. Its goal is to turn “saved” or “watched” content into searchable, reviewable, and reusable knowledge assets. Users paste a content link on the homepage, the system creates a parsing task, and once the task is completed, a structured knowledge pack is generated. Users can then review the content on the knowledge pack page or manage all saved content through the knowledge library.

The product currently supports three core user flows:

1. **Homepage: submit a link and create a parsing task**  
   Users paste a link and start a parsing task. The task card displays real backend task status, including the content title, source platform, submitted URL, progress, and error messages. The system also prevents duplicate parsing by detecting links that are already being processed or have already been parsed.

2. **Knowledge Pack Page: review structured content**  
   Each parsed item generates a dedicated knowledge pack, including title, source, author, publish time, summary, semantic sections, keywords, glossary terms, and transcript blocks. For Xiaoyuzhou podcast links, the system can already extract real episode metadata and audio URLs, then generate real transcripts through Fun-ASR. The transcript is also lightly cleaned and merged to reduce filler words such as “嗯” and “呃” and avoid overly fragmented transcript blocks.

3. **Knowledge Library Page: browse and manage accumulated knowledge**  
   Parsed content is stored in the knowledge library and organized into first-level knowledge domains, second-level topics, and content cards. The library supports card view, table view, and mind-map view. It also supports URL deduplication, in-progress task blocking, reuse of already parsed content, and single-content deletion.

From a technical perspective, KnowBase has moved beyond a static frontend mock demo into a backend-persistent MVP. The project uses Next.js for the frontend and API Routes, and Supabase PostgreSQL for storing parsing tasks, content records, knowledge categories, topics, and content-topic assignments. The Xiaoyuzhou parsing workflow has been partially integrated with real metadata extraction and an asynchronous ASR task flow. The system can parse Xiaoyuzhou episode URLs, extract title, host, publish time, description, cover image, and audio URL, store ASR intermediate states in `parse_tasks.processing_payload`, and let the frontend poll real task status until the transcript is written into the content payload.

The current real capabilities include link metadata extraction, Xiaoyuzhou audio URL extraction, asynchronous ASR transcription, real task status polling, transcript cleanup and merging, shownotes-based timestamp section extraction, dynamic library display, URL deduplication, and content deletion.

There are still important limitations. LLM generation has not yet been connected to the main workflow, so summaries, keywords, glossary terms, and deeper semantic structures are not yet fully generated from the real transcript. The library page already has a dynamic structure for knowledge domains and topics, but it has not yet connected LLM-based categorization and topic generation. ASR also depends on external API quota, so future work needs to improve cost control, retry handling, and provider stability.

The next step is to connect LLM generation. The first LLM phase will use existing real `transcriptBlocks` to generate a true summary, semantic sections, keywords, and glossary terms for a single knowledge pack. After that, the next phase will add LLM-based library categorization, allowing the system to automatically assign content to knowledge domains and topics with generated reasons and confidence scores.
