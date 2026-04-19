export type TranscriptBlock = {
  id: string;
  time: string;
  speaker: string;
  text: string;
};

export type Keyword = {
  term: string;
  explanation: string;
  context: string;
  evidenceBlockId: string;
};

export type SemanticChapter = {
  title: string;
  summary: string;
};

export type Section = {
  id: string;
  title: string;
  summary: string;
  order: number;
  startBlockId: string;
  endBlockId?: string;
  startTimestamp?: string;
  endTimestamp?: string;
  evidenceBlockIds?: string[];
};

export type GlossaryTerm = {
  id: string;
  term: string;
  aliases?: string[];
  definition: string;
  contextExample: string;
  category?:
    | "concept"
    | "person"
    | "organization"
    | "abbreviation"
    | "method"
    | "product";
  occurrenceCount: number;
  evidenceBlockIds: string[];
};

export type KnowledgeItem = {
  id: string;
  title: string;
  sourcePlatform: string;
  sourceUrl: string;
  author: string;
  publishedAt: string;
  parsedAt: string;
  summary: string;
  keywords: Keyword[];
  sections: Section[];
  chapters: SemanticChapter[];
  glossaryTerms: GlossaryTerm[];
  transcriptBlocks: TranscriptBlock[];
};

export type LibraryContentItem = {
  id: string;
  title: string;
  platform: string;
  author: string;
  summary: string;
  categoryPath: string;
  topKeywords: string[];
  parsedAt: string;
};

export type LibraryTopic = {
  id: string;
  name: string;
  contentCount: number;
  topKeywords: string[];
  contents: LibraryContentItem[];
};

export type LibraryCategory = {
  id: string;
  name: string;
  description: string;
  generatedReason: string;
  sourceContentCount: number;
  confidence: number;
  lastAdjustedAt: string;
  contentCount: number;
  topicCount: number;
  topKeywords: string[];
  updatedAt: string;
  topics: LibraryTopic[];
};

export type RecentTopic = {
  id: string;
  name: string;
  contentCount: number;
  relatedContentIds: string[];
};

export const mockKnowledgeItems: KnowledgeItem[] = [
  {
    id: "demo-001",
    title: "从个人知识库到行动系统：如何让信息真正复用",
    sourcePlatform: "小宇宙",
    sourceUrl: "https://www.xiaoyuzhoufm.com/episode/demo-001",
    author: "KnowBase 编辑部",
    publishedAt: "2026-04-05",
    parsedAt: "2026-04-19 10:24",
    summary:
      "本期讨论如何把播客、文章和会议记录沉淀成可检索、可回看、可行动的个人知识库。核心观点是：知识管理的价值不在于收藏更多内容，而在于建立稳定的复用路径。",
    sections: [
      {
        id: "section-001",
        title: "为什么收藏不等于知识管理",
        summary:
          "收藏只是入口，真正的知识管理需要让信息进入后续的检索、联想和行动链路。",
        order: 1,
        startBlockId: "t-001",
        endBlockId: "t-004",
        startTimestamp: "00:00",
        endTimestamp: "09:10",
        evidenceBlockIds: ["t-002", "t-003"],
      },
      {
        id: "section-002",
        title: "从逐字稿到语义章节",
        summary:
          "章节化可以把长内容拆成可理解的语义单元，帮助用户快速判断哪一段值得深入阅读。",
        order: 2,
        startBlockId: "t-005",
        endBlockId: "t-006",
        startTimestamp: "13:27",
        endTimestamp: "18:03",
        evidenceBlockIds: ["t-005", "t-006"],
      },
      {
        id: "section-003",
        title: "关键词如何成为检索锚点",
        summary:
          "关键词不是简单标签，而是带有解释、语境和原文证据的高密度索引。",
        order: 3,
        startBlockId: "t-007",
        endBlockId: "t-008",
        startTimestamp: "23:51",
        endTimestamp: "29:36",
        evidenceBlockIds: ["t-007", "t-008"],
      },
      {
        id: "section-004",
        title: "把知识包接入日常工作流",
        summary:
          "只有当知识包能回到写作、决策和项目复盘中，信息沉淀才会产生长期收益。",
        order: 4,
        startBlockId: "t-009",
        endBlockId: "t-011",
        startTimestamp: "34:20",
        endTimestamp: "45:16",
        evidenceBlockIds: ["t-009", "t-010", "t-011"],
      },
    ],
    chapters: [
      {
        title: "为什么收藏不等于知识管理",
        summary:
          "嘉宾指出，收藏只是入口，真正的知识管理需要让信息进入后续的检索、联想和行动链路。",
      },
      {
        title: "从逐字稿到语义章节",
        summary:
          "章节化可以把长内容拆成可理解的语义单元，帮助用户快速判断哪一段值得深入阅读。",
      },
      {
        title: "关键词如何成为检索锚点",
        summary:
          "关键词不是简单标签，而是带有解释、语境和原文证据的高密度索引。",
      },
      {
        title: "把知识包接入日常工作流",
        summary:
          "只有当知识包能回到写作、决策和项目复盘中，信息沉淀才会产生长期收益。",
      },
    ],
    keywords: [
      {
        term: "复用路径",
        explanation: "信息从收藏进入检索、回看、写作和决策的固定流转方式。",
        context: "嘉宾用它描述知识库从静态仓库变成行动工具的关键。",
        evidenceBlockId: "t-003",
      },
      {
        term: "语义章节",
        explanation: "按照观点和主题切分内容，而不是仅按时间或段落切分。",
        context: "用于快速理解长音频结构，减少从头听完的成本。",
        evidenceBlockId: "t-005",
      },
      {
        term: "原文证据",
        explanation: "每个摘要或关键词都能回到对应逐字稿片段，方便校验上下文。",
        context: "这是避免 AI 总结失真的重要产品机制。",
        evidenceBlockId: "t-007",
      },
      {
        term: "轻量工作流",
        explanation: "不强迫用户改变工具栈，只把知识包放进已有习惯中。",
        context: "适合从播客学习、选题研究到项目复盘等场景。",
        evidenceBlockId: "t-009",
      },
      {
        term: "高频主题",
        explanation: "一段时间内反复出现的概念集合，可反映用户近期关注方向。",
        context: "知识库首页可以用它帮助用户重新发现内容之间的联系。",
        evidenceBlockId: "t-011",
      },
    ],
    glossaryTerms: [
      {
        id: "glossary-knowledge-management",
        term: "知识管理",
        aliases: ["个人知识管理"],
        definition: "把分散信息整理成可回看、可检索、可复用结构的方法。",
        contextExample:
          "嘉宾把知识管理理解为一条能连接写作、决策和复盘的复用路径。",
        category: "concept",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-001", "t-003", "t-011"],
      },
      {
        id: "glossary-personal-knowledge-base",
        term: "个人知识库",
        aliases: ["结构化知识库"],
        definition: "围绕个人目标沉淀内容、观点和证据的长期知识空间。",
        contextExample:
          "节目把个人知识库描述为能帮助用户再次找到、理解和使用信息的结构。",
        category: "concept",
        occurrenceCount: 4,
        evidenceBlockIds: ["t-001", "t-003", "t-004", "t-011"],
      },
      {
        id: "glossary-semantic-sections",
        term: "语义章节",
        aliases: ["章节化"],
        definition: "按照观点变化和主题边界切分长内容，而不是按固定时间切段。",
        contextExample:
          "语义章节让用户先理解长音频结构，再决定哪一段值得回听。",
        category: "concept",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-005", "t-006", "t-007"],
      },
      {
        id: "glossary-semantic-splitting",
        term: "语义切分",
        definition: "识别内容中的主题转折和观点边界，并据此拆分段落。",
        contextExample:
          "嘉宾强调语义切分要看观点转换，而不是机械按五分钟切一段。",
        category: "method",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-005", "t-006", "t-007"],
      },
      {
        id: "glossary-source-evidence",
        term: "原文证据",
        aliases: ["证据锚点"],
        definition: "摘要、关键词或结论可以回到的原始文本片段。",
        contextExample:
          "关键词和摘要都应该保留原文证据，方便用户检查上下文。",
        category: "concept",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-007", "t-008", "t-010"],
      },
      {
        id: "glossary-retrieval-anchor",
        term: "检索锚点",
        aliases: ["搜索锚点"],
        definition: "帮助用户从关键词快速回到相关原文位置的索引点。",
        contextExample:
          "节目把关键词视为检索锚点，而不是普通标签。",
        category: "concept",
        occurrenceCount: 4,
        evidenceBlockIds: ["t-003", "t-007", "t-008", "t-011"],
      },
      {
        id: "glossary-reuse-path",
        term: "复用路径",
        definition: "信息从收藏进入写作、决策和项目复盘的固定流转方式。",
        contextExample:
          "嘉宾认为复用路径决定了知识库能否从静态仓库变成行动工具。",
        category: "method",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-003", "t-004", "t-009"],
      },
      {
        id: "glossary-zettelkasten",
        term: "卡片笔记",
        aliases: ["卡片笔记法"],
        definition: "把想法拆成小颗粒知识卡片，并通过关联形成长期积累的方法。",
        contextExample:
          "节目提到卡片笔记可以帮助用户抵抗信息过载，而不是只停留在收藏。",
        category: "method",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-001", "t-002", "t-010"],
      },
      {
        id: "glossary-active-recall",
        term: "主动回忆",
        definition: "不看答案主动提取记忆的学习方法，常用于提升长期记忆。",
        contextExample:
          "主持人把主动回忆和回听播客片段联系起来，强调知识需要被重新提取。",
        category: "method",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-001", "t-006", "t-010"],
      },
      {
        id: "glossary-knowledge-graph",
        term: "知识图谱",
        definition: "用节点和关系呈现概念、内容和主题之间连接的结构。",
        contextExample:
          "嘉宾把知识图谱作为长期发现内容关联的方式，而不是单篇列表。",
        category: "concept",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-004", "t-010", "t-011"],
      },
      {
        id: "glossary-lightweight-workflow",
        term: "轻量工作流",
        definition: "不强迫用户迁移工具，而是把知识结果放进已有习惯中的流程。",
        contextExample:
          "轻量工作流让知识包进入写选题、准备访谈和项目复盘等已有流程。",
        category: "method",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-009", "t-010", "t-011"],
      },
      {
        id: "glossary-information-overload",
        term: "信息过载",
        definition: "输入内容过多、难以筛选和再次使用时产生的认知负担。",
        contextExample:
          "节目把信息过载视为收藏很多却无法复用的重要原因。",
        category: "concept",
        occurrenceCount: 3,
        evidenceBlockIds: ["t-001", "t-002", "t-004"],
      },
    ],
    transcriptBlocks: [
      {
        id: "t-001",
        time: "00:00",
        speaker: "主持人",
        text: "今天我们聊一个很常见的问题：信息过载以后，为什么我们收藏了很多内容，却很少真的再次使用它们。很多人会从个人知识库、知识管理、卡片笔记和主动回忆开始寻找答案。",
      },
      {
        id: "t-002",
        time: "02:18",
        speaker: "嘉宾",
        text: "收藏本身没有问题，但它只解决了保存的问题，没有解决理解和再次使用的问题。信息过载时，卡片笔记能帮助我们把材料拆小，但它也需要后续整理。",
      },
      {
        id: "t-003",
        time: "05:42",
        speaker: "嘉宾",
        text: "我会把知识管理看成一条复用路径：内容进入个人知识库之后，要能通过检索锚点，在写作、决策和复盘时被重新调出来。",
      },
      {
        id: "t-004",
        time: "09:10",
        speaker: "主持人",
        text: "所以最小可行的个人知识库，不一定要很复杂，但必须让用户知道下一次可以在哪里找到它。复用路径越清楚，信息过载越容易被缓解，后面再发展成知识图谱也更自然。",
      },
      {
        id: "t-005",
        time: "13:27",
        speaker: "嘉宾",
        text: "语义章节的价值在于，它不是机械按五分钟切一段，而是按观点转换和主题边界来切。这个过程更接近语义切分。",
      },
      {
        id: "t-006",
        time: "18:03",
        speaker: "主持人",
        text: "这对播客尤其重要，因为音频内容很长，用户通常需要先判断哪一段值得回听。语义章节和语义切分能帮助用户快速定位，也方便后续做主动回忆。",
      },
      {
        id: "t-007",
        time: "23:51",
        speaker: "嘉宾",
        text: "任何关键词和摘要都应该有原文证据。用户点一下就能看到原文，这会让系统更可信。这里的关键词其实是检索锚点，而语义章节和语义切分负责提供上下文。",
      },
      {
        id: "t-008",
        time: "29:36",
        speaker: "主持人",
        text: "也就是说，知识包不是替代原文，而是帮助用户更快地回到原文里的重点位置。原文证据和检索锚点一起，让用户知道这个结论从哪里来。",
      },
      {
        id: "t-009",
        time: "34:20",
        speaker: "嘉宾",
        text: "我更喜欢轻量工作流：不要让用户迁移到一个全新的复杂系统，而是让知识包进入他们已经在用的流程。这样复用路径不会变成额外负担。",
      },
      {
        id: "t-010",
        time: "39:44",
        speaker: "主持人",
        text: "比如写选题、准备访谈、做项目复盘，都可以从已有知识包里抽取观点。轻量工作流里，卡片笔记、主动回忆、原文证据和知识图谱可以各自承担不同角色。",
      },
      {
        id: "t-011",
        time: "45:16",
        speaker: "嘉宾",
        text: "当相近主题浮现出来，用户会发现自己最近一直在关注什么。轻量工作流会把这些主题沉淀进知识管理和个人知识库，并通过知识图谱和检索锚点看到内容之间的联系。",
      },
    ],
  },
  {
    id: "demo-002",
    title: "长期主义的内容整理：从灵感捕捉到专题研究",
    sourcePlatform: "小宇宙",
    sourceUrl: "https://www.xiaoyuzhoufm.com/episode/demo-002",
    author: "声波研究所",
    publishedAt: "2026-03-28",
    parsedAt: "2026-04-18 21:10",
    summary:
      "这期内容强调把零散灵感整理成专题研究，建议用固定模板沉淀问题、证据和下一步行动。",
    sections: [],
    chapters: [],
    glossaryTerms: [],
    keywords: [
      {
        term: "专题研究",
        explanation: "围绕一个长期问题持续积累内容和证据。",
        context: "适合把碎片灵感转成可推进的研究线索。",
        evidenceBlockId: "demo-002-t-001",
      },
      {
        term: "问题模板",
        explanation: "用固定字段记录问题、证据、反例和行动。",
        context: "降低每次整理内容时的决策成本。",
        evidenceBlockId: "demo-002-t-001",
      },
      {
        term: "灵感捕捉",
        explanation: "在想法刚出现时先快速记录，不急于分类。",
        context: "避免因为整理压力导致内容丢失。",
        evidenceBlockId: "demo-002-t-001",
      },
    ],
    transcriptBlocks: [
      {
        id: "demo-002-t-001",
        time: "00:00",
        speaker: "主持人",
        text: "专题研究不追求一次整理完美，而是让问题、证据和下一步行动持续变清楚。",
      },
    ],
  },
  {
    id: "demo-003",
    title: "AI 时代的阅读笔记：摘要、证据与个人判断",
    sourcePlatform: "小宇宙",
    sourceUrl: "https://www.xiaoyuzhoufm.com/episode/demo-003",
    author: "未来读书会",
    publishedAt: "2026-02-12",
    parsedAt: "2026-04-17 08:42",
    summary:
      "节目讨论如何在 AI 摘要的帮助下保留个人判断，尤其强调每条结论都应能追溯到原文证据。",
    sections: [],
    chapters: [],
    glossaryTerms: [],
    keywords: [
      {
        term: "个人判断",
        explanation: "用户基于经验和目标对材料做出的主动取舍。",
        context: "AI 可以压缩信息，但不能替代判断。",
        evidenceBlockId: "demo-003-t-001",
      },
      {
        term: "证据链",
        explanation: "从结论回到原文出处的可追溯路径。",
        context: "用于检查摘要是否偏离上下文。",
        evidenceBlockId: "demo-003-t-001",
      },
      {
        term: "摘要边界",
        explanation: "明确摘要覆盖了什么，也承认没有覆盖什么。",
        context: "帮助用户避免把摘要当成完整原文。",
        evidenceBlockId: "demo-003-t-001",
      },
    ],
    transcriptBlocks: [
      {
        id: "demo-003-t-001",
        time: "00:00",
        speaker: "嘉宾",
        text: "好的摘要应该带着证据链，让用户能够保留自己的个人判断，而不是被动接受结论。",
      },
    ],
  },
];

export const mockTopicTags = [
  "知识管理",
  "原文证据",
  "语义章节",
  "专题研究",
  "AI 摘要",
  "轻量工作流",
];

export const recentTopics: RecentTopic[] = [
  {
    id: "topic-ai-agent",
    name: "AI Agent",
    contentCount: 3,
    relatedContentIds: [
      "why-agent-not-chatbot",
      "enterprise-agent-path",
      "agentic-workflow",
    ],
  },
  {
    id: "topic-rag",
    name: "RAG",
    contentCount: 2,
    relatedContentIds: ["rag-enterprise-km", "vector-db-retrieval"],
  },
  {
    id: "topic-knowledge-management",
    name: "知识管理",
    contentCount: 4,
    relatedContentIds: [
      "fragment-input-knowledge-base",
      "collection-to-reuse",
      "zettelkasten-learning",
      "obsidian-graph-limits",
    ],
  },
  {
    id: "topic-cognitive-dissonance",
    name: "认知失调",
    contentCount: 1,
    relatedContentIds: ["cognitive-dissonance-self-explanation"],
  },
  {
    id: "topic-consumer-psychology",
    name: "消费心理",
    contentCount: 1,
    relatedContentIds: ["anti-consumerism-psychology"],
  },
];

export const libraryCategories: LibraryCategory[] = [
  {
    id: "category-ai-workflow-practice",
    name: "AI 与工作流实践",
    description:
      "围绕 AI Agent、RAG、工具调用和自动化工作流等内容自动聚合出的知识领域。",
    generatedReason:
      "系统检测到多条内容反复讨论 AI Agent、RAG、工作流和工具调用，因此将其聚合为“AI 与工作流实践”。",
    sourceContentCount: 5,
    confidence: 0.91,
    lastAdjustedAt: "2026-04-19",
    contentCount: 5,
    topicCount: 3,
    topKeywords: ["AI Agent", "RAG", "Tool Use", "自动化工作流"],
    updatedAt: "2026-04-19",
    topics: [
      {
        id: "topic-ai-agent-product",
        name: "AI Agent 产品",
        contentCount: 2,
        topKeywords: ["AI Agent", "Chatbot", "Tool Use"],
        contents: [
          {
            id: "why-agent-not-chatbot",
            title: "为什么 Agent 不是 Chatbot",
            platform: "小宇宙",
            author: "智能产品观察",
            summary:
              "讨论 Agent 与 Chatbot 的核心差异，重点在目标拆解、工具调用和多步执行能力。",
            categoryPath: "AI 与工作流实践 / AI Agent 产品",
            topKeywords: ["AI Agent", "Chatbot", "Tool Use"],
            parsedAt: "2026-04-19 10:24",
          },
          {
            id: "enterprise-agent-path",
            title: "企业 Agent 的落地路径",
            platform: "网页文章",
            author: "企业智能化周报",
            summary:
              "分析企业场景中 Agent 从辅助工具到流程自动化的落地方式。",
            categoryPath: "AI 与工作流实践 / AI Agent 产品",
            topKeywords: ["企业 AI", "Agent 落地", "工作流"],
            parsedAt: "2026-04-18 16:35",
          },
        ],
      },
      {
        id: "topic-rag-enterprise-km",
        name: "RAG 与企业知识库",
        contentCount: 2,
        topKeywords: ["RAG", "企业知识库", "向量检索"],
        contents: [
          {
            id: "rag-enterprise-km",
            title: "RAG 为什么适合企业知识管理",
            platform: "YouTube",
            author: "AI Infra Lab",
            summary:
              "解释 RAG 如何把大模型和企业文档连接起来，降低幻觉并提升知识检索能力。",
            categoryPath: "AI 与工作流实践 / RAG 与企业知识库",
            topKeywords: ["RAG", "企业知识库", "向量检索"],
            parsedAt: "2026-04-17 09:12",
          },
          {
            id: "vector-db-retrieval",
            title: "向量数据库与检索增强",
            platform: "网页文章",
            author: "语义检索笔记",
            summary:
              "介绍向量数据库在语义检索中的作用，以及它如何支撑 RAG 系统。",
            categoryPath: "AI 与工作流实践 / RAG 与企业知识库",
            topKeywords: ["向量数据库", "Embedding", "检索增强"],
            parsedAt: "2026-04-16 20:18",
          },
        ],
      },
      {
        id: "topic-automation-workflow",
        name: "自动化工作流",
        contentCount: 1,
        topKeywords: ["Workflow", "Agentic Workflow", "自动化"],
        contents: [
          {
            id: "agentic-workflow",
            title: "从 Workflow 到 Agentic Workflow",
            platform: "小宇宙",
            author: "自动化研究室",
            summary:
              "比较传统工作流和 Agentic Workflow 的差异，说明自动化系统如何从固定流程走向半自主执行。",
            categoryPath: "AI 与工作流实践 / 自动化工作流",
            topKeywords: ["Workflow", "Agentic Workflow", "自动化"],
            parsedAt: "2026-04-15 14:50",
          },
        ],
      },
    ],
  },
  {
    id: "category-knowledge-learning",
    name: "知识管理与学习方法",
    description:
      "围绕个人知识管理、卡片笔记、信息整理和长期学习方法自动聚合出的知识领域。",
    generatedReason:
      "系统检测到多条内容都在讨论如何把碎片输入转化为可复用知识，因此将其聚合为“知识管理与学习方法”。",
    sourceContentCount: 5,
    confidence: 0.88,
    lastAdjustedAt: "2026-04-18",
    contentCount: 5,
    topicCount: 3,
    topKeywords: ["个人知识库", "卡片笔记", "长期学习", "知识沉淀"],
    updatedAt: "2026-04-18",
    topics: [
      {
        id: "topic-personal-km",
        name: "个人知识管理",
        contentCount: 2,
        topKeywords: ["个人知识库", "碎片输入", "知识沉淀"],
        contents: [
          {
            id: "fragment-input-knowledge-base",
            title: "如何把碎片输入变成个人知识库",
            platform: "小宇宙",
            author: "长期主义笔记",
            summary:
              "讨论如何把播客、文章和视频中的碎片信息整理成长期可回看的知识结构。",
            categoryPath: "知识管理与学习方法 / 个人知识管理",
            topKeywords: ["个人知识库", "碎片输入", "知识沉淀"],
            parsedAt: "2026-04-14 21:10",
          },
          {
            id: "collection-to-reuse",
            title: "从收藏到复用：知识管理的关键断点",
            platform: "网页文章",
            author: "信息整理研究所",
            summary:
              "分析为什么收藏内容并不等于形成知识，关键在于归档、回看和复用机制。",
            categoryPath: "知识管理与学习方法 / 个人知识管理",
            topKeywords: ["收藏", "复用", "知识管理"],
            parsedAt: "2026-04-13 18:42",
          },
        ],
      },
      {
        id: "topic-structured-notes",
        name: "结构化笔记",
        contentCount: 2,
        topKeywords: ["卡片笔记", "知识卡片", "双链笔记"],
        contents: [
          {
            id: "zettelkasten-learning",
            title: "卡片笔记法为什么适合长期学习",
            platform: "YouTube",
            author: "Learning Lab",
            summary:
              "介绍卡片笔记法如何通过小颗粒度记录和关联，支持长期知识积累。",
            categoryPath: "知识管理与学习方法 / 结构化笔记",
            topKeywords: ["卡片笔记", "知识卡片", "长期学习"],
            parsedAt: "2026-04-12 15:28",
          },
          {
            id: "obsidian-graph-limits",
            title: "Obsidian 图谱的价值和局限",
            platform: "网页文章",
            author: "双链笔记观察",
            summary:
              "讨论 Obsidian 图谱如何帮助用户发现内容之间的关联，以及它在实际使用中的限制。",
            categoryPath: "知识管理与学习方法 / 结构化笔记",
            topKeywords: ["Obsidian", "知识图谱", "双链笔记"],
            parsedAt: "2026-04-11 11:05",
          },
        ],
      },
      {
        id: "topic-learning-strategy",
        name: "学习策略",
        contentCount: 1,
        topKeywords: ["主动回忆", "间隔复习", "学习策略"],
        contents: [
          {
            id: "active-recall-learning",
            title: "主动回忆比重复阅读更有效吗",
            platform: "小宇宙",
            author: "认知学习笔记",
            summary:
              "解释主动回忆和间隔复习为什么能提升长期记忆效果。",
            categoryPath: "知识管理与学习方法 / 学习策略",
            topKeywords: ["主动回忆", "间隔复习", "学习策略"],
            parsedAt: "2026-04-10 08:50",
          },
        ],
      },
    ],
  },
  {
    id: "category-psychology-decision",
    name: "心理认知与行为决策",
    description:
      "围绕认知偏差、情绪状态、消费心理和决策行为自动聚合出的知识领域。",
    generatedReason:
      "系统检测到多条内容都在解释人如何在情绪、偏见和自我解释中做决策，因此将其聚合为“心理认知与行为决策”。",
    sourceContentCount: 5,
    confidence: 0.84,
    lastAdjustedAt: "2026-04-17",
    contentCount: 5,
    topicCount: 3,
    topKeywords: ["认知偏差", "情绪决策", "消费心理", "行为决策"],
    updatedAt: "2026-04-17",
    topics: [
      {
        id: "topic-cognitive-bias",
        name: "认知偏差",
        contentCount: 2,
        topKeywords: ["认知失调", "确认偏误", "判断偏差"],
        contents: [
          {
            id: "cognitive-dissonance-self-explanation",
            title: "认知失调如何影响自我解释",
            platform: "小宇宙",
            author: "心理学通识",
            summary:
              "解释人们在行为和信念冲突时，如何通过改变解释来缓解心理不适。",
            categoryPath: "心理认知与行为决策 / 认知偏差",
            topKeywords: ["认知失调", "自我解释", "心理一致性"],
            parsedAt: "2026-04-09 20:35",
          },
          {
            id: "confirmation-bias-opinion",
            title: "确认偏误为什么会强化原有观点",
            platform: "网页文章",
            author: "判断与决策研究",
            summary:
              "分析人们为什么更容易接受支持自己观点的信息，而忽视相反证据。",
            categoryPath: "心理认知与行为决策 / 认知偏差",
            topKeywords: ["确认偏误", "信息选择", "判断偏差"],
            parsedAt: "2026-04-08 14:12",
          },
        ],
      },
      {
        id: "topic-emotion-decision",
        name: "情绪与决策",
        contentCount: 2,
        topKeywords: ["Empathy Gap", "冲动", "焦虑"],
        contents: [
          {
            id: "empathy-gap-impulse",
            title: "Empathy Gap 为什么会让人低估未来冲动",
            platform: "YouTube",
            author: "Behavior Lab",
            summary:
              "解释人在冷静状态下为什么常常低估自己在情绪或欲望状态下的行为变化。",
            categoryPath: "心理认知与行为决策 / 情绪与决策",
            topKeywords: ["Empathy Gap", "冲动", "情绪决策"],
            parsedAt: "2026-04-07 17:48",
          },
          {
            id: "anxiety-short-sighted-decision",
            title: "焦虑状态下的选择为什么更短视",
            platform: "网页文章",
            author: "情绪决策笔记",
            summary:
              "分析焦虑如何影响风险评估和时间偏好，使人更倾向于选择即时安全感。",
            categoryPath: "心理认知与行为决策 / 情绪与决策",
            topKeywords: ["焦虑", "风险评估", "短视决策"],
            parsedAt: "2026-04-06 10:26",
          },
        ],
      },
      {
        id: "topic-consumer-psychology",
        name: "消费心理",
        contentCount: 1,
        topKeywords: ["反消费主义", "身份焦虑", "消费心理"],
        contents: [
          {
            id: "anti-consumerism-psychology",
            title: "反消费主义背后的心理机制",
            platform: "小宇宙",
            author: "生活方式观察",
            summary:
              "讨论反消费主义如何回应身份焦虑、比较心理和过度消费带来的压力。",
            categoryPath: "心理认知与行为决策 / 消费心理",
            topKeywords: ["反消费主义", "身份焦虑", "消费心理"],
            parsedAt: "2026-04-05 19:04",
          },
        ],
      },
    ],
  },
];

export const recentContents: LibraryContentItem[] = [
  {
    id: "why-agent-not-chatbot",
    title: "为什么 Agent 不是 Chatbot",
    platform: "小宇宙",
    author: "智能产品观察",
    summary:
      "讨论 Agent 与 Chatbot 的核心差异，重点在目标拆解、工具调用和多步执行能力。",
    categoryPath: "AI 与工作流实践 / AI Agent 产品",
    topKeywords: ["AI Agent", "Chatbot", "Tool Use"],
    parsedAt: "2026-04-19 10:24",
  },
  {
    id: "rag-enterprise-km",
    title: "RAG 为什么适合企业知识管理",
    platform: "YouTube",
    author: "AI Infra Lab",
    summary:
      "解释 RAG 如何把大模型和企业文档连接起来，降低幻觉并提升知识检索能力。",
    categoryPath: "AI 与工作流实践 / RAG 与企业知识库",
    topKeywords: ["RAG", "企业知识库", "向量检索"],
    parsedAt: "2026-04-17 09:12",
  },
  {
    id: "fragment-input-knowledge-base",
    title: "如何把碎片输入变成个人知识库",
    platform: "小宇宙",
    author: "长期主义笔记",
    summary:
      "讨论如何把播客、文章和视频中的碎片信息整理成长期可回看的知识结构。",
    categoryPath: "知识管理与学习方法 / 个人知识管理",
    topKeywords: ["个人知识库", "碎片输入", "知识沉淀"],
    parsedAt: "2026-04-14 21:10",
  },
  {
    id: "cognitive-dissonance-self-explanation",
    title: "认知失调如何影响自我解释",
    platform: "小宇宙",
    author: "心理学通识",
    summary:
      "解释人们在行为和信念冲突时，如何通过改变解释来缓解心理不适。",
    categoryPath: "心理认知与行为决策 / 认知偏差",
    topKeywords: ["认知失调", "自我解释", "心理一致性"],
    parsedAt: "2026-04-09 20:35",
  },
  {
    id: "anti-consumerism-psychology",
    title: "反消费主义背后的心理机制",
    platform: "小宇宙",
    author: "生活方式观察",
    summary:
      "讨论反消费主义如何回应身份焦虑、比较心理和过度消费带来的压力。",
    categoryPath: "心理认知与行为决策 / 消费心理",
    topKeywords: ["反消费主义", "身份焦虑", "消费心理"],
    parsedAt: "2026-04-05 19:04",
  },
];

export const getKnowledgeItemById = (id: string) =>
  mockKnowledgeItems.find((item) => item.id === id);
