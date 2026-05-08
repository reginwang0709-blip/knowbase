import "server-only";

import type {
  GlossaryTerm,
  Keyword,
  Section,
  TranscriptBlock,
} from "@/lib/mock-data";
import {
  createMiniMaxChatCompletion,
  getMiniMaxModel,
  type MiniMaxFunctionTool,
  type MiniMaxRequestDiagnostics,
  type MiniMaxToolCall,
  type MiniMaxToolChoice,
} from "./minimax-client";

export type KnowledgePackGenerationStage =
  | "summary_keywords"
  | "glossary_candidates"
  | "glossary_terms";

type SummaryKeywordsResult = {
  generatedSummary: string;
  keywords: Array<{
    term: string;
    explanation: string;
    context: string;
    evidenceBlockId: string;
  }>;
};

type GlossaryTermsResult = {
  glossaryTerms: SelectedGlossaryTerm[];
};

type GlossaryLlmCategory =
  | "technical_concept"
  | "product_name"
  | "company_name"
  | "model_name"
  | "framework"
  | "event"
  | "industry_term"
  | "other";

export type GlossaryLlmTerm = {
  candidateId: string;
  term: string;
  normalizedTerm: string;
  category: GlossaryLlmCategory;
  definition: string;
  whyItMatters: string;
  evidence: string;
  aliases: string[];
};

export type LlmJsonParseDiagnostics = {
  directParseFailed: boolean;
  reasoningTagStripped: boolean;
  codeFenceCleanupAttempted: boolean;
  codeFenceParseFailed: boolean;
  balancedObjectExtractionAttempted: boolean;
  balancedObjectExtractionSucceeded: boolean;
  objectExtractionAttempted: boolean;
  objectExtractionParseFailed: boolean;
  extractedObjectPreview?: string;
  parseErrorMessage?: string;
  parseErrorPosition?: number;
  parseErrorContext?: string;
  rawResponseTailPreview?: string;
  likelyTruncated?: boolean;
  partialItemsPreview?: unknown[];
  rawResponseExcerpt: string;
  rawResponsePreview: string;
  repaired?: boolean;
  repairAttempted?: boolean;
  repairSucceeded?: boolean;
  repairRawResponsePreview?: string;
  repairErrorMessage?: string;
};

export type RawGlossaryResponseDiagnostics = {
  rawResponsePreview: string;
  rawResponseLength: number;
  finishReason?: string;
  containsThinkTag: boolean;
  containsGlossaryTermsKey: boolean;
  alternativeFieldNamesDetected: string[];
  requestFormat: "openai_compatible_chat_completions";
  reasoningSplitRequested: boolean;
  reasoningContentSeparated: boolean;
  reasoningContentPreview?: string;
  reasoningDetailsPresent: boolean;
  responseFormatRequested: boolean;
  responseFormatActuallyReliableForModel: false | "unknown";
  toolCallingSupportedForModel: boolean;
  toolChoiceRequested: boolean;
  requestedToolName?: string;
  toolCallsPresent: boolean;
  toolCallCount: number;
  toolCallNames: string[];
  usedToolCall: boolean;
  fallbackToContentParser: boolean;
  selectedToolName?: string;
  argumentsLength: number;
  argumentsPreview: string;
};

export class LlmJsonParseError extends Error {
  diagnostics: LlmJsonParseDiagnostics;

  constructor(message: string, diagnostics: LlmJsonParseDiagnostics) {
    super(message);
    this.name = "LlmJsonParseError";
    this.diagnostics = diagnostics;
  }
}

export type GlossaryValidationDiagnostics = {
  parsedOk: boolean;
  validationOk: boolean;
  rawItemCount: number;
  validItemCount: number;
  normalizedGlossaryTermsCount: number;
  selectedGlossaryCount: number;
  droppedInvalidItemCount: number;
  droppedByInvalidCandidateIdCount: number;
  droppedByValidationCount: number;
  droppedInvalidReasons: string[];
  droppedReasons: string[];
  glossaryTermsKeyPresent: boolean;
  glossaryTermsIsArray: boolean;
  firstRawItemsPreview: unknown[];
  firstValidItemsPreview: GlossaryLlmTerm[];
};

export type GlossaryGenerationFailureType =
  | "response_parse_failed"
  | "llm_output_truncated"
  | "missing_glossary_terms_key"
  | "glossary_terms_not_array"
  | "glossary_terms_empty"
  | "all_glossary_terms_dropped_by_validation"
  | "minimax_empty_response"
  | "minimax_schema_mismatch";

export class GlossaryGenerationError extends Error {
  errorType: GlossaryGenerationFailureType;
  rawResponseDiagnostics: RawGlossaryResponseDiagnostics;
  parseDiagnostics?: LlmJsonParseDiagnostics;
  validationDiagnostics?: GlossaryValidationDiagnostics;
  repaired?: boolean;

  constructor({
    message,
    errorType,
    rawResponseDiagnostics,
    parseDiagnostics,
    validationDiagnostics,
    repaired,
  }: {
    message: string;
    errorType: GlossaryGenerationFailureType;
    rawResponseDiagnostics: RawGlossaryResponseDiagnostics;
    parseDiagnostics?: LlmJsonParseDiagnostics;
    validationDiagnostics?: GlossaryValidationDiagnostics;
    repaired?: boolean;
  }) {
    super(message);
    this.name = "GlossaryGenerationError";
    this.errorType = errorType;
    this.rawResponseDiagnostics = rawResponseDiagnostics;
    this.parseDiagnostics = parseDiagnostics;
    this.validationDiagnostics = validationDiagnostics;
    this.repaired = repaired;
  }
}

export type LocalGlossaryTerm = GlossaryTerm & {
  firstEvidenceBlockId?: string;
  firstTimestamp?: string;
};

export type SelectedGlossaryTerm = GlossaryLlmTerm & {
  localCategory: GlossaryTerm["category"];
  occurrenceCount: number;
  evidenceBlockIds: string[];
  firstEvidenceBlockId?: string;
  firstTimestamp?: string;
};

export type KeywordCandidate = {
  term: string;
  count: number;
  firstEvidenceBlockId: string;
  sampleContext: string;
};

export type GlossaryCandidate = {
  candidateId?: string;
  term: string;
  canonicalTerm?: string;
  normalizedTerm: string;
  candidateSource?:
    | "englishProperNoun"
    | "acronym"
    | "modelVersion"
    | "chinesePerson"
    | "chineseDomainTerm"
    | "meetingOrEvent"
    | "mixedTerm"
    | "singleWordProperNoun";
  aliases: string[];
  categoryGuess?: GlossaryTerm["category"];
  confidence?: "high" | "medium" | "low";
  scoreBreakdown?: {
    shapeScore: number;
    contextScore: number;
    documentScore: number;
    coOccurrenceScore: number;
    termhoodScore: number;
    semanticScore: number;
    noisePenalty: number;
    totalScore: number;
    finalScore: number;
    matchedSignals?: string[];
  };
  matchedSignals?: string[];
  reason?: string;
  whyHigh?: {
    strongSignalCount: number;
    documentScore: number;
    contextScore: number;
    coOccurrenceScore: number;
    termhoodScore: number;
    noisePenalty: number;
  };
  mergedInto?: string;
  suppressedReason?: string;
  occurrenceCount: number;
  firstEvidenceBlockId: string;
  firstTimestamp?: string;
  firstContext: string;
  allEvidenceBlockIds: string[];
};

export type GlossaryCandidateExclusionReason =
  | "keyword_overlap"
  | "generic_term"
  | "duplicate"
  | "low_value"
  | "invalid_evidence"
  | "alias_conflict";

export type GlossaryExcludedCandidate = {
  term: string;
  reason: GlossaryCandidateExclusionReason;
  matchedKeyword?: string;
  duplicateOf?: string;
};

export type ExpectedTermCheckResult = {
  expected: string;
  transcriptMatched: boolean;
  rawCandidateMatched: boolean;
  filteredCandidateMatched: boolean;
  status:
    | "included"
    | "excluded"
    | "not_found_in_transcript"
    | "found_in_transcript_but_not_candidate";
  matchedCandidate?: string;
  matchedKeyword?: string;
  duplicateOf?: string;
  reason?: GlossaryCandidateExclusionReason | "not_detected";
};

export type GlossaryCandidateDiagnostics = {
  whetherHardcodedWhitelistUsed: false;
  whetherExpectedTermCheckAffectsScoring: false;
  totalTranscriptBlocks: number;
  rawCandidateCount: number;
  filteredCandidateCount: number;
  excludedCount: number;
  confidenceCounts: {
    high: number;
    medium: number;
    low: number;
  };
  candidates: Array<GlossaryCandidate & { score: number }>;
  excludedCandidates: GlossaryExcludedCandidate[];
  expectedTermCheck: ExpectedTermCheckResult[];
};

export type GlossaryCandidateBatch = {
  index: number;
  candidateCount: number;
  estimatedPromptChars: number;
  candidates: GlossaryCandidate[];
};

type GlossaryToolCandidate = {
  candidateId: string;
  term: string;
  normalizedTerm: string;
  candidateSource: string;
  categoryGuess: string;
  confidence: string;
  shortEvidence: string;
  matchedSignalsSummary: string;
};

export type GeneratedSummaryKeywords = SummaryKeywordsResult & {
  normalizedKeywords: Keyword[];
  model: string;
  sampledBlockIds: string[];
  sampledBlocksCount: number;
  sampledTranscriptChars: number;
};

export type GeneratedGlossaryTerms = GlossaryTermsResult & {
  normalizedGlossaryTerms: LocalGlossaryTerm[];
  llmGlossaryTerms: GlossaryLlmTerm[];
  rawResponseDiagnostics: RawGlossaryResponseDiagnostics;
  parseDiagnostics: LlmJsonParseDiagnostics;
  validationDiagnostics: GlossaryValidationDiagnostics;
  repaired: boolean;
  model: string;
  sampledBlockIds: string[];
  sampledBlocksCount: number;
  sampledTranscriptChars: number;
};

// Step 2 sections 未来如果接入 LLM，应优先复用 shownotes 解析出的
// section title / timestamps，只让模型在需要时补充信息型 section summary。
// 当前 Phase 3G-1/3 不会实际调用这套 prompt。
export const FUTURE_SECTION_SUMMARY_REQUIREMENTS = [
  "section summary 不是短标题改写。",
  "每条 summary 建议 120-180 字，信息复杂章节可放宽到 220 字。",
  "summary 必须包含具体对象、关键观点和 2-3 个信息点。",
  "如果原文存在因果、对比、趋势，应尽量保留。",
  "不要写成“本节主要讲了……”这类模板句。",
  "不要空泛概括，不要标签堆叠，不要编造 transcript 中没有的信息。",
  "不要输出 Markdown。",
].join(" ");

const MAX_BLOCKS = 40;
const MIN_BLOCKS = 20;
const GLOSSARY_TERMS_PRIMARY_TIMEOUT_MS = 120_000;
const GLOSSARY_TERMS_REPAIR_TIMEOUT_MS = 60_000;
// Output safety budget for glossary_terms LLM JSON.
// This is used to reduce truncation risk, not as a product/business display limit.
const GLOSSARY_LLM_OUTPUT_SAFETY = {
  maxGlossaryTermsForLlmOutput: 8,
  maxDefinitionChars: 60,
  maxWhyItMattersChars: 40,
  maxEvidenceChars: 40,
  maxAliasesPerTerm: 3,
} as const;
const MAX_SUMMARY_TRANSCRIPT_CHARS = 5000;
const RETRY_SUMMARY_TRANSCRIPT_CHARS = 4200;
const MAX_KEYWORD_CANDIDATES = 20;
const MAX_GLOSSARY_CANDIDATE_CONTEXT_CHARS = 100;
const MAX_GLOSSARY_CONTEXT_EXAMPLE_CHARS = 80;
const MAX_GLOSSARY_BATCH_PROMPT_CHARS = 3200;
const MAX_GLOSSARY_BATCH_CANDIDATE_CONTEXT_CHARS = 100;
const GENERIC_TERMS = new Set([
  "用户",
  "系统",
  "内容",
  "功能",
  "项目",
  "东西",
  "问题",
  "方法",
  "工具",
  "平台",
  "模型",
  "接口",
  "产品",
  "技术",
  "方案",
  "能力",
  "实现",
  "使用",
  "完成",
  "进行",
  "这个",
  "那个",
  "然后",
  "就是",
  "我们",
  "你们",
  "他们",
  "自己",
  "可以",
  "的话",
  "这里",
  "那里",
  "今天",
  "现在",
  "因为",
  "所以",
  "如果",
  "但是",
  "以及",
  "比如",
  "比如说",
  "嗯",
  "呃",
]);
const GENERIC_GLOSSARY_TERMS = new Set([
  "用户",
  "系统",
  "内容",
  "问题",
  "功能",
  "项目",
  "能力",
  "模型",
  "产品",
  "平台",
  "工具",
  "公司",
  "组织",
  "方法",
  "技术",
]);
const KEYWORD_HINT_PATTERN =
  /(平台|系统|框架|模型|接口|工具|产品|方法|协议|API|SDK|Agent|Copilot|Workflow|Studio|Suite)/i;
const GLOSSARY_HINT_PATTERN =
  /(api|sdk|agent|copilot|workflow|framework|model|suite|studio|code|research|labs|ai|ml|llm|gpt|graph|cloud|benchmark|router|drive|docs)/i;
const GLOSSARY_CATEGORY_SET = new Set<
  NonNullable<GlossaryTerm["category"]>
>([
  "concept",
  "person",
  "organization",
  "abbreviation",
  "method",
  "product",
]);
const GENERIC_ENGLISH_GLOSSARY_TERMS = new Set([
  "code",
  "cloud",
  "model",
  "product",
  "user",
  "system",
  "content",
  "project",
  "function",
  "issue",
  "problem",
  "tool",
  "platform",
]);
const LOW_VALUE_CHINESE_GLOSSARY_TERMS = new Set([
  "相当于",
  "有什么",
  "有意思",
  "方面的",
  "有这个",
  "相关的",
  "能大家",
  "成一个",
  "成这个",
  "那我觉",
  "厉害的",
  "关注的",
  "有的时",
  "能就是",
  "能不能",
  "尤其是",
  "有那么",
  "能也是",
  "能会更",
  "有发",
  "有发的",
  "相结合",
  "那如果",
  "明显的",
  "包括",
  "应用",
  "文档",
  "有效",
  "计划",
  "融资",
  "曲线",
  "安全",
  "关系",
]);
const LOW_VALUE_ENGLISH_GLOSSARY_TERMS = new Set([
  "clock code",
  "cloud co work",
  "gpt two",
  "what",
  "coser",
  "mini max",
]);
const HIGH_CONFIDENCE_ROLE_DESCRIPTION_PATTERN =
  /^(?:AI\s+(?:SOFTWARE ENGINEER|CODING AGENT)|(?:CEO|CTO|CFO|COO|FOUNDER|创始人|联合创始人)\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})$/i;
const ENGLISH_STOPWORDS = new Set([
  "is",
  "the",
  "of",
  "and",
  "to",
  "for",
  "with",
  "in",
  "on",
  "by",
  "from",
  "that",
  "this",
  "these",
  "those",
]);
const ENGLISH_GENERIC_ACTION_OR_COMMON_WORDS = new Set([
  "open",
  "token",
  "coding",
  "cloud",
  "code",
  "model",
  "product",
  "user",
  "system",
  "agent",
  "train",
  "memory",
  "package",
  "video",
  "computer",
  "researcher",
  "capital",
  "million",
]);
const ENGLISH_GENERIC_ACTION_OR_UI_WORDS = new Set([
  "continue",
  "start",
  "stop",
  "click",
  "open",
  "close",
  "save",
  "cancel",
  "submit",
  "login",
  "logout",
  "retry",
  "skip",
  "download",
  "upload",
  "search",
  "install",
  "delete",
  "create",
  "update",
]);
const GENERIC_BUSINESS_OR_TECHNICAL_TERMS = new Set([
  "revenue",
  "sales",
  "market",
  "growth",
  "product",
  "model",
  "token",
  "coding",
  "platform",
  "data",
  "user",
  "cost",
  "performance",
  "open",
  "cloud",
  "code",
  "system",
  "agent",
]);
const PERSON_CONTEXT_HINT_PATTERN =
  /(嘉宾|创始人|联合创始人|CEO|作者|负责人|分享|提到|主持人|说|认为|表示|采访|老师|朋友)/;
const MEETING_OR_EVENT_PATTERN = /(?:[A-Z]{2,}\s*大会|[A-Z]{2,}\s*峰会|[A-Z]{2,}\s*Conference|峰会|大会)$/i;
const EXPLANATORY_CONTEXT_HINT_PATTERN =
  /(是什么|为什么|如何|用于|通过|提升|降低|实现|影响|对比|区别|原理|机制|能力|成本|性能|风险|价值)/;
const LOW_VALUE_CHINESE_FRAGMENT_PATTERN =
  /^(?:有|能|会|这|那|就|又|还|也|都|把|被|给|让|从|在|对|和|跟|于|向|往|把|将|为|是|像|比|更|最|太|很|较|挺|可|该|要|会|能|想|说){1,3}[\u4e00-\u9fa5]{0,3}$/;
const LOW_VALUE_CHINESE_SUFFIX_PATTERN = /(?:的|了|呢|啊|吗|呀|吧|就|又|还|也)$/;
const GENERIC_ABSTRACT_CHINESE_PATTERN =
  /^(?:能力|产品|模型|内容|系统|项目|平台|工具|问题|方向|东西|情况|阶段|方面|公司|组织|方法)$/;
const TECHNICAL_CONTEXT_HINT_PATTERN =
  /(模型|训练|推理|学习|方法|架构|框架|协议|系统|工具|产品|发布|公司|团队|大会|会议|论文|开发者|上下文)/;
const ENGLISH_ENTITY_CONTEXT_HINT_PATTERN =
  /(product|startup|company|founder|ceo|model|launch|tool|benchmark|compare|release|platform|team|lab|labs|paper|conference)/i;
const CHINESE_TECHNICAL_TERM_PATTERN =
  /^(?:[\u4e00-\u9fa5]{2,8}(?:学习|模型|推理|对齐|扩散|上下文|微调|训练|部署|参数|算力|预训练|后训练|多模态|架构|机制|原理|性能|成本|能力|方法|策略|流程))$/;
const CHINESE_PERSON_EXCLUSION_PATTERN =
  /^(?:公司|产品|模型|能力|方向|问题|内容|系统|工具|平台|项目|团队|方法|学习|上下文)$/;
const CHINESE_SHORT_DOMAIN_STOPWORDS = new Set([
  "问题",
  "能力",
  "方向",
  "内容",
  "用户",
  "产品",
  "公司",
  "工具",
  "事情",
  "东西",
  "方式",
  "结果",
  "感觉",
  "时间",
  "部分",
  "方面",
  "情况",
  "逻辑",
  "模型",
  "系统",
  "平台",
  "团队",
  "项目",
]);
const CHINESE_SURNAME_PATTERN =
  /(?:赵|钱|孙|李|周|吴|郑|王|冯|陈|褚|卫|蒋|沈|韩|杨|朱|秦|尤|许|何|吕|施|张|孔|曹|严|华|金|魏|陶|姜|戚|谢|邹|喻|柏|水|窦|章|云|苏|潘|葛|奚|范|彭|郎|鲁|韦|昌|马|苗|凤|花|方|俞|任|袁|柳|酆|鲍|史|唐|费|廉|岑|薛|雷|贺|倪|汤|滕|殷|罗|毕|郝|邬|安|常|乐|于|时|傅|皮|卞|齐|康|伍|余|元|卜|顾|孟|平|黄|和|穆|萧|尹|姚|邵|湛|汪|祁|毛|禹|狄|米|贝|明|臧|计|成|戴|宋|庞|熊|纪|舒|屈|项|祝|董|梁|杜|阮|蓝|闵|席|季|麻|强|贾|路|娄|危|江|童|颜|郭|梅|盛|林|刁|钟|徐|邱|骆|高|夏|蔡|田|樊|胡|凌|霍|虞|万|支|柯|昝|管|卢|莫|经|房|裘|缪|干|解|应|宗|丁|宣|贲|邓|郁|单|杭|洪|包|诸|左|石|崔|吉|钮|龚|程|嵇|邢|滑|裴|陆|荣|翁|荀|羊|於|惠|甄|曲|家|封|芮|羿|储|靳|汲|邴|糜|松|井|段|富|巫|乌|焦|巴|弓|牧|隗|山|谷|车|侯|宓|蓬|全|郗|班|仰|秋|仲|伊|宫|宁|仇|栾|暴|甘|斜|厉|戎|祖|武|符|刘|景|詹|束|龙|叶|幸|司|韶|郜|黎|蓟|薄|印|宿|白|怀|蒲|台|从|鄂|索|咸|籍|赖|卓|蔺|屠|蒙|池|乔|阴|郁|胥|能|苍|双|闻|莘|党|翟|谭|贡|劳|逄|姬|申|扶|堵|冉|宰|郦|雍|郤|璩|桑|桂|濮|牛|寿|通|边|扈|燕|冀|郏|浦|尚|农|温|别|庄|晏|柴|瞿|阎|连|茹|习|宦|艾|鱼|容|向|古|易|慎|戈|廖|庾|终|暨|居|衡|步|都|耿|满|弘|匡|国|文|寇|广|禄|阙|东|欧|殳|沃|利|蔚|越|夔|隆|师|巩|厍|聂|晁|勾|敖|融|冷|訾|辛|阚|那|简|饶|曾|沙|养|鞠|须|丰|巢|关|蒯|相|查|后|荆|红|游|竺|权|逯|盖|益|桓|公|晋|楚|闫|法|汝|鄢|涂|钦|岳|帅|缑|亢|况|郈|有|琴|归|海|墨|哈|谯|笪|年|爱|阳|佟|第五|言|福)[\u4e00-\u9fa5]{1,2}/g;
const CHINESE_SURNAME_TEST_PATTERN =
  /(?:赵|钱|孙|李|周|吴|郑|王|冯|陈|褚|卫|蒋|沈|韩|杨|朱|秦|尤|许|何|吕|施|张|孔|曹|严|华|金|魏|陶|姜|戚|谢|邹|喻|柏|水|窦|章|云|苏|潘|葛|奚|范|彭|郎|鲁|韦|昌|马|苗|凤|花|方|俞|任|袁|柳|酆|鲍|史|唐|费|廉|岑|薛|雷|贺|倪|汤|滕|殷|罗|毕|郝|邬|安|常|乐|于|时|傅|皮|卞|齐|康|伍|余|元|卜|顾|孟|平|黄|和|穆|萧|尹|姚|邵|湛|汪|祁|毛|禹|狄|米|贝|明|臧|计|成|戴|宋|庞|熊|纪|舒|屈|项|祝|董|梁|杜|阮|蓝|闵|席|季|麻|强|贾|路|娄|危|江|童|颜|郭|梅|盛|林|刁|钟|徐|邱|骆|高|夏|蔡|田|樊|胡|凌|霍|虞|万|支|柯|昝|管|卢|莫|经|房|裘|缪|干|解|应|宗|丁|宣|贲|邓|郁|单|杭|洪|包|诸|左|石|崔|吉|钮|龚|程|嵇|邢|滑|裴|陆|荣|翁|荀|羊|於|惠|甄|曲|家|封|芮|羿|储|靳|汲|邴|糜|松|井|段|富|巫|乌|焦|巴|弓|牧|隗|山|谷|车|侯|宓|蓬|全|郗|班|仰|秋|仲|伊|宫|宁|仇|栾|暴|甘|斜|厉|戎|祖|武|符|刘|景|詹|束|龙|叶|幸|司|韶|郜|黎|蓟|薄|印|宿|白|怀|蒲|台|从|鄂|索|咸|籍|赖|卓|蔺|屠|蒙|池|乔|阴|郁|胥|能|苍|双|闻|莘|党|翟|谭|贡|劳|逄|姬|申|扶|堵|冉|宰|郦|雍|郤|璩|桑|桂|濮|牛|寿|通|边|扈|燕|冀|郏|浦|尚|农|温|别|庄|晏|柴|瞿|阎|连|茹|习|宦|艾|鱼|容|向|古|易|慎|戈|廖|庾|终|暨|居|衡|步|都|耿|满|弘|匡|国|文|寇|广|禄|阙|东|欧|殳|沃|利|蔚|越|夔|隆|师|巩|厍|聂|晁|勾|敖|融|冷|訾|辛|阚|那|简|饶|曾|沙|养|鞠|须|丰|巢|关|蒯|相|查|后|荆|红|游|竺|权|逯|盖|益|桓|公|晋|楚|闫|法|汝|鄢|涂|钦|岳|帅|缑|亢|况|郈|有|琴|归|海|墨|哈|谯|笪|年|爱|阳|佟|第五|言|福)[\u4e00-\u9fa5]{1,2}/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function extractJsonObjectWithFallback(text: string) {
  const direct = extractJsonObject(text);

  if (direct.startsWith("{") && direct.endsWith("}")) {
    return direct;
  }

  const start = text.indexOf("{");

  if (start === -1) {
    return direct;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }

  return direct;
}

function inspectRawGlossaryResponse({
  raw,
  finishReason,
  reasoningContent,
  reasoningDetails,
  toolCalls,
  selectedToolCall,
  fallbackToContentParser,
  requestDiagnostics,
}: {
  raw: string;
  finishReason?: string;
  reasoningContent?: string;
  reasoningDetails?: unknown;
  toolCalls?: MiniMaxToolCall[];
  selectedToolCall?: MiniMaxToolCall;
  fallbackToContentParser: boolean;
  requestDiagnostics: MiniMaxRequestDiagnostics;
}): RawGlossaryResponseDiagnostics {
  const selectedArguments = cleanText(selectedToolCall?.function?.arguments);
  const toolCallNames = Array.isArray(toolCalls)
    ? toolCalls
        .map((toolCall) => cleanText(toolCall.function?.name))
        .filter(Boolean)
    : [];

  return {
    rawResponsePreview: raw.slice(0, 2000),
    rawResponseLength: raw.length,
    finishReason,
    containsThinkTag: /<think\b|<\/think>|<analysis\b|<\/analysis>/i.test(raw),
    containsGlossaryTermsKey: /"glossaryTerms"\s*:/i.test(raw),
    alternativeFieldNamesDetected: ["terms", "glossary", "items"].filter((field) =>
      new RegExp(`"${field}"\\s*:`, "i").test(raw),
    ),
    requestFormat: requestDiagnostics.requestFormat,
    reasoningSplitRequested: requestDiagnostics.reasoningSplitRequested,
    reasoningContentSeparated: Boolean(reasoningContent) || Boolean(reasoningDetails),
    reasoningContentPreview: reasoningContent?.slice(0, 1000),
    reasoningDetailsPresent: reasoningDetails !== undefined,
    responseFormatRequested: requestDiagnostics.responseFormatRequested,
    responseFormatActuallyReliableForModel:
      requestDiagnostics.responseFormatActuallyReliableForModel,
    toolCallingSupportedForModel: requestDiagnostics.toolCallingSupportedForModel,
    toolChoiceRequested: requestDiagnostics.toolChoiceRequested,
    requestedToolName: requestDiagnostics.requestedToolName,
    toolCallsPresent: Array.isArray(toolCalls) && toolCalls.length > 0,
    toolCallCount: Array.isArray(toolCalls) ? toolCalls.length : 0,
    toolCallNames,
    usedToolCall: Boolean(selectedToolCall),
    fallbackToContentParser,
    selectedToolName: cleanText(selectedToolCall?.function?.name),
    argumentsLength: selectedArguments.length,
    argumentsPreview: selectedArguments.slice(0, 2000),
  };
}

function stripReasoningTags(text: string) {
  let stripped = text;
  let changed = false;

  const stripPatterns = [
    /<think\b[^>]*>[\s\S]*?<\/think>/gi,
    /<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi,
  ];

  for (const pattern of stripPatterns) {
    if (pattern.test(stripped)) {
      changed = true;
      stripped = stripped.replace(pattern, "");
    }
  }

  return {
    text: stripped.trim(),
    changed,
  };
}

function extractFirstBalancedJsonObject(text: string) {
  const start = text.indexOf("{");

  if (start === -1) {
    return {
      extracted: "",
      succeeded: false,
    };
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return {
          extracted: text.slice(start, index + 1).trim(),
          succeeded: true,
        };
      }
    }
  }

  return {
    extracted: text.slice(start).trim(),
    succeeded: false,
  };
}

function buildParseErrorContext(source: string, position: number) {
  const start = Math.max(0, position - 500);
  const end = Math.min(source.length, position + 500);
  return source.slice(start, end);
}

function buildTailPreview(source: string, maxChars = 500) {
  return source.slice(Math.max(0, source.length - maxChars));
}

function looksLikeTruncatedJson(message: string, source: string) {
  const normalized = message.toLowerCase();
  const trimmed = source.trim();

  return (
    normalized.includes("unterminated string") ||
    normalized.includes("unexpected end of json input") ||
    (!/[}\]]\s*$/.test(trimmed) &&
      (normalized.includes("unexpected end") ||
        normalized.includes("unterminated") ||
        normalized.includes("position")))
  );
}

function extractPartialGlossaryItemsPreview(source: string, limit = 5) {
  const match = source.match(/"glossaryTerms"\s*:\s*\[/i);

  if (!match) {
    return [];
  }

  const itemsText = source.slice(match.index! + match[0].length);
  const previews: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let itemStart = -1;

  for (let index = 0; index < itemsText.length && previews.length < limit; index += 1) {
    const char = itemsText[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        itemStart = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0 && itemStart !== -1) {
        const itemText = itemsText.slice(itemStart, index + 1);
        try {
          const parsed = JSON.parse(itemText) as Record<string, unknown>;
          previews.push({
            term: cleanText(parsed.term),
            normalizedTerm: cleanText(parsed.normalizedTerm),
            category: cleanText(parsed.category),
            definition: cleanText(parsed.definition).slice(0, 120),
          });
        } catch {
          break;
        }
        itemStart = -1;
      }
    }
  }

  return previews;
}

function parseErrorPosition(message: string) {
  const match = message.match(/position\s+(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

async function safeParseLlmJson({
  raw,
  allowRepair = false,
  repairJson,
}: {
  raw: string;
  allowRepair?: boolean;
  repairJson?: (malformed: string) => Promise<string>;
}): Promise<{ parsed: unknown; diagnostics: LlmJsonParseDiagnostics }> {
  const rawResponsePreview = raw.slice(0, 2000);
  const diagnostics: LlmJsonParseDiagnostics = {
    directParseFailed: false,
    reasoningTagStripped: false,
    codeFenceCleanupAttempted: false,
    codeFenceParseFailed: false,
    balancedObjectExtractionAttempted: false,
    balancedObjectExtractionSucceeded: false,
    objectExtractionAttempted: false,
    objectExtractionParseFailed: false,
    rawResponseExcerpt: raw.slice(0, 500),
    rawResponsePreview,
    rawResponseTailPreview: buildTailPreview(raw),
  };

  try {
    return {
      parsed: JSON.parse(raw) as unknown,
      diagnostics,
    };
  } catch (error) {
    diagnostics.directParseFailed = true;
    diagnostics.parseErrorMessage =
      error instanceof Error ? error.message : "Unknown JSON parse error";
  }

  const withoutReasoning = stripReasoningTags(raw);
  diagnostics.reasoningTagStripped = withoutReasoning.changed;

  const withoutFence = withoutReasoning.text
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  diagnostics.codeFenceCleanupAttempted = true;

  try {
    return {
      parsed: JSON.parse(withoutFence) as unknown,
      diagnostics,
    };
  } catch (error) {
    diagnostics.codeFenceParseFailed = true;
    diagnostics.parseErrorMessage =
      error instanceof Error ? error.message : diagnostics.parseErrorMessage;
  }

  const balancedExtraction = extractFirstBalancedJsonObject(withoutFence);
  diagnostics.balancedObjectExtractionAttempted = true;
  diagnostics.balancedObjectExtractionSucceeded = balancedExtraction.succeeded;
  diagnostics.extractedObjectPreview = balancedExtraction.extracted.slice(0, 2000);

  const extractedObject = balancedExtraction.extracted || extractJsonObjectWithFallback(withoutFence);
  diagnostics.objectExtractionAttempted = true;

  try {
    return {
      parsed: JSON.parse(extractedObject) as unknown,
      diagnostics,
    };
  } catch (error) {
    diagnostics.objectExtractionParseFailed = true;
    const message =
      error instanceof Error ? error.message : "Unknown JSON parse error";
    const position = parseErrorPosition(message);

    diagnostics.parseErrorMessage = message;
    diagnostics.parseErrorPosition = position;
    diagnostics.rawResponseExcerpt = extractedObject.slice(0, 2000);
    diagnostics.rawResponseTailPreview = buildTailPreview(extractedObject);
    diagnostics.parseErrorContext =
      typeof position === "number"
        ? buildParseErrorContext(extractedObject, position)
        : extractedObject.slice(0, 1000);
    diagnostics.likelyTruncated = looksLikeTruncatedJson(message, extractedObject);
    diagnostics.partialItemsPreview = diagnostics.likelyTruncated
      ? extractPartialGlossaryItemsPreview(extractedObject)
      : [];

    if (diagnostics.likelyTruncated || !allowRepair || !repairJson) {
      throw new LlmJsonParseError(message, diagnostics);
    }

    diagnostics.repairAttempted = true;

    try {
      const repairedRaw = await repairJson(raw);
      diagnostics.repairRawResponsePreview = repairedRaw.slice(0, 2000);

      const repairedResult: {
        parsed: unknown;
        diagnostics: LlmJsonParseDiagnostics;
      } = await safeParseLlmJson({
        raw: repairedRaw,
        allowRepair: false,
      });

      return {
        parsed: repairedResult.parsed,
        diagnostics: {
          ...repairedResult.diagnostics,
          directParseFailed: diagnostics.directParseFailed,
          reasoningTagStripped:
            diagnostics.reasoningTagStripped ||
            repairedResult.diagnostics.reasoningTagStripped,
          codeFenceCleanupAttempted:
            diagnostics.codeFenceCleanupAttempted ||
            repairedResult.diagnostics.codeFenceCleanupAttempted,
          codeFenceParseFailed:
            diagnostics.codeFenceParseFailed ||
            repairedResult.diagnostics.codeFenceParseFailed,
          balancedObjectExtractionAttempted:
            diagnostics.balancedObjectExtractionAttempted ||
            repairedResult.diagnostics.balancedObjectExtractionAttempted,
          balancedObjectExtractionSucceeded:
            diagnostics.balancedObjectExtractionSucceeded ||
            repairedResult.diagnostics.balancedObjectExtractionSucceeded,
          objectExtractionAttempted:
            diagnostics.objectExtractionAttempted ||
            repairedResult.diagnostics.objectExtractionAttempted,
          objectExtractionParseFailed:
            diagnostics.objectExtractionParseFailed ||
            repairedResult.diagnostics.objectExtractionParseFailed,
          extractedObjectPreview:
            diagnostics.extractedObjectPreview ||
            repairedResult.diagnostics.extractedObjectPreview,
          parseErrorMessage:
            repairedResult.diagnostics.parseErrorMessage ||
            diagnostics.parseErrorMessage,
          parseErrorPosition:
            repairedResult.diagnostics.parseErrorPosition ??
            diagnostics.parseErrorPosition,
          parseErrorContext:
            repairedResult.diagnostics.parseErrorContext ||
            diagnostics.parseErrorContext,
          rawResponseExcerpt: diagnostics.rawResponseExcerpt,
          rawResponsePreview: diagnostics.rawResponsePreview,
          repaired: true,
          repairAttempted: true,
          repairSucceeded: true,
          repairRawResponsePreview: diagnostics.repairRawResponsePreview,
        },
      };
    } catch (repairError) {
      diagnostics.repairSucceeded = false;
      diagnostics.repairErrorMessage =
        repairError instanceof Error ? repairError.message : "Unknown repair error";

      throw new LlmJsonParseError(message, diagnostics);
    }
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function previewUnknownItems(value: unknown, limit = 5) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, limit).map((item) => {
    if (!isRecord(item)) {
      return item;
    }

    return {
      term: cleanText(item.term),
      normalizedTerm: cleanText(item.normalizedTerm),
      category: cleanText(item.category),
      definition: cleanText(item.definition).slice(0, 160),
      whyItMatters: cleanText(item.whyItMatters).slice(0, 120),
      evidence: cleanText(item.evidence).slice(0, 120),
      aliases: Array.isArray(item.aliases)
        ? item.aliases
            .map((alias) => cleanText(alias))
            .filter(Boolean)
            .slice(0, 5)
        : [],
    };
  });
}

function normalizeCandidateTerm(term: string) {
  return term
    .replace(/[，。、“”"'`‘’（）()[\]{}<>《》!?！？,:：;；/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDedupKey(term: string) {
  const normalized = term
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"'`‘’（）()[\]{}<>《》]/g, "")
    .replace(/[\s\-—–_|｜·•,，。:：;；/\\]+/g, "")
    .replace(/(?<=\d)\.(?=\d)/g, "")
    .trim();

  return normalized;
}

export function normalizeGlossaryTerm(term: string) {
  return normalizeDedupKey(term);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) =>
      /^[A-Z0-9.+-]+$/.test(part)
        ? part
        : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

export function toCanonicalGlossaryTerm(term: string) {
  const cleaned = normalizeCandidateTerm(term);

  if (!cleaned) {
    return "";
  }

  if (/^([A-Za-z]{2,})[-\s]?(\d+(?:\.\d+)*)$/i.test(cleaned)) {
    const match = cleaned.match(/^([A-Za-z]{2,})[-\s]?(\d+(?:\.\d+)*)$/i);
    if (match) {
      const [, prefix, version] = match;
      const normalizedPrefix =
        /^[A-Z]{2,}$/.test(prefix)
          ? prefix.toUpperCase()
          : prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
      return `${normalizedPrefix} ${version}`;
    }
  }

  if (/^([A-Za-z]{2,})\s*(大会|峰会|论坛|发布会|活动)$/i.test(cleaned)) {
    const match = cleaned.match(/^([A-Za-z]{2,})\s*(大会|峰会|论坛|发布会|活动)$/i);
    return match ? `${match[1].toUpperCase()}${match[2]}` : cleaned;
  }

  if (/^[A-Z]{2,}\s+[A-Z]{2,}$/.test(cleaned)) {
    return cleaned
      .split(/\s+/)
      .map((part) => part.toUpperCase())
      .join(" ");
  }

  if (/^[A-Za-z]+(?:\s+[A-Za-z]+){1,3}$/.test(cleaned)) {
    return cleaned
      .split(/\s+/)
      .map((part) => {
        if (/^[A-Z]{2,}$/.test(part)) {
          return part.toUpperCase();
        }

        if (/[A-Z].*[A-Z]/.test(part.slice(1))) {
          return part;
        }

        return `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`;
      })
      .join(" ");
  }

  return titleCaseWords(cleaned);
}

function guessGlossaryCategory(term: string): GlossaryTerm["category"] {
  if (/^[A-Z]{2,}(?:\s+[A-Z0-9]{2,})*$/.test(term)) {
    return "abbreviation";
  }

  if (
    /[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}/.test(term) ||
    (/^[\u4e00-\u9fa5]{2,4}$/.test(term) && CHINESE_SURNAME_TEST_PATTERN.test(term))
  ) {
    return "person";
  }

  if (/(公司|组织|实验室|Labs|Lab|大会|Conference)/i.test(term)) {
    return "organization";
  }

  if (/(Code|Copilot|Research|GPT|Agent|World|Suite|Router|Drive|Docs|Labs?)/i.test(term)) {
    return "product";
  }

  if (/(架构|框架|协议|方法|学习|模型|上下文)/.test(term)) {
    return "method";
  }

  return "concept";
}

type GlossaryDocumentContext = {
  title?: string;
  generatedSummary?: string;
  sections?: Section[];
  keywords?: Keyword[];
};

function normalizeDocumentContext(context?: GlossaryDocumentContext) {
  const title = cleanText(context?.title);
  const generatedSummary = cleanText(context?.generatedSummary);
  const sectionTexts = (context?.sections ?? [])
    .flatMap((section) => [cleanText(section.title), cleanText(section.summary)])
    .filter(Boolean);
  const keywordTerms = (context?.keywords ?? [])
    .map((keyword) => cleanText(keyword.term))
    .filter(Boolean);

  return {
    title,
    generatedSummary,
    sectionTexts,
    keywordTerms,
    fullText: [title, generatedSummary, ...sectionTexts].filter(Boolean).join("\n"),
  };
}

function looksLikeDomainRelevantSection(text: string) {
  return /(AI|模型|产品|工具|训练|推理|学习|上下文|创业|公司|Agent|Copilot|Code|Research|发布|成本|性能|Benchmark|会议|大会)/i.test(
    text,
  );
}

function countChineseFunctionWords(text: string) {
  return (text.match(/[的是了在有和就又还也如果因为所以这个那个一个]/g) ?? [])
    .length;
}

function isEnglishLikeTerm(term: string) {
  return /^[A-Za-z][A-Za-z0-9.+-]*(?:\s+[A-Za-z][A-Za-z0-9.+-]*)*$/.test(term);
}

function countWholeTermMatches(term: string, text: string) {
  if (!term || !text) {
    return 0;
  }

  const normalizedText = text.normalize("NFKC");

  if (isEnglishLikeTerm(term)) {
    const compactTerm = normalizeCandidateTerm(term);

    if (!compactTerm) {
      return 0;
    }

    const pattern = new RegExp(`\\b${escapeRegExp(compactTerm)}\\b`, "gi");
    return normalizedText.match(pattern)?.length ?? 0;
  }

  return countTermInText(normalizeGlossaryTerm(term), normalizedText);
}

function isChineseFragmentLike(term: string) {
  if (!/^[\u4e00-\u9fa5]{2,8}$/.test(term)) {
    return false;
  }

  if (
    /(的|了|是|在|和|跟|把|被)/.test(term) &&
    !/(学习|模型|推理|对齐|扩散|上下文|训练|部署|参数|算力|架构|机制|原理|性能|成本|方法|策略|流程)$/.test(
      term,
    )
  ) {
    return true;
  }

  if (/^(这|那|它|其|国|后|前|而|并|且|就|又|还|都)/.test(term)) {
    return true;
  }

  if (/(这个|那个|他们|她们|我们|你们)/.test(term)) {
    return true;
  }

  return false;
}

function isChineseBoundaryFragment(term: string) {
  if (!/^[\u4e00-\u9fa5]{2,8}$/.test(term)) {
    return false;
  }

  if (
    /^(的|了|是|在|和|跟|把|被|会|能)/.test(term) ||
    /(的|了|是|在|和|跟|把|被|会|能)$/.test(term)
  ) {
    return true;
  }

  return false;
}

function hasVersionSignal(term: string) {
  return /(?:^|\s)\d+(?:\.\d+)+$/.test(term) || /[A-Za-z]+\s*\d+(?:\.\d+)+/i.test(term);
}

function looksLikeSingleNamePersonLike(term: string) {
  return /^[A-Z][a-z]{3,11}$/.test(term) || /^[A-Z]{4,10}$/.test(term);
}

function inferGlossaryCandidateSource(
  term: string,
  context = "",
): GlossaryCandidate["candidateSource"] {
  if (/^[A-Z]{2,}(?:\s+[A-Z0-9]{2,})*$/.test(term)) {
    return "acronym";
  }

  if (/^[A-Za-z]+(?:\s+)?\d+(?:\.\d+)+$/i.test(term)) {
    return "modelVersion";
  }

  if (/^[A-Za-z]{2,}\s*(大会|峰会|论坛|发布会|活动)$/i.test(term)) {
    return "meetingOrEvent";
  }

  if (/^[A-Z][A-Za-z0-9.+-]*(?:\s+[A-Z][A-Za-z0-9.+-]*){1,3}$/.test(term)) {
    return "englishProperNoun";
  }

  if (
    /^[\u4e00-\u9fa5]{2,4}$/.test(term) &&
    CHINESE_SURNAME_TEST_PATTERN.test(term) &&
    PERSON_CONTEXT_HINT_PATTERN.test(context) &&
    !TECHNICAL_CONTEXT_HINT_PATTERN.test(context) &&
    !isChineseFragmentLike(term)
  ) {
    return "chinesePerson";
  }

  if (/^[\u4e00-\u9fa5]{2,6}$/.test(term)) {
    return "chineseDomainTerm";
  }

  if (/[\u4e00-\u9fa5]/.test(term) && /[A-Za-z]/.test(term)) {
    return "mixedTerm";
  }

  if (/^[A-Z][A-Za-z]{3,}$/.test(term)) {
    return "singleWordProperNoun";
  }

  return "englishProperNoun";
}

function countTermInText(normalizedTerm: string, text: string) {
  if (!normalizedTerm || !text) {
    return 0;
  }

  const normalizedText = normalizeGlossaryTerm(text);
  if (!normalizedText) {
    return 0;
  }

  let count = 0;
  let index = normalizedText.indexOf(normalizedTerm);
  while (index !== -1) {
    count += 1;
    index = normalizedText.indexOf(normalizedTerm, index + normalizedTerm.length);
  }
  return count;
}

function inferGlossaryCandidateScores(
  candidate: GlossaryCandidate,
  documentContext?: GlossaryDocumentContext,
) {
  const normalizedTerm = candidate.normalizedTerm;
  const context = candidate.firstContext;
  const normalizedDoc = normalizeDocumentContext(documentContext);
  const isChineseName =
    /^[\u4e00-\u9fa5]{2,4}$/.test(candidate.term) &&
    CHINESE_SURNAME_TEST_PATTERN.test(candidate.term) &&
    !CHINESE_PERSON_EXCLUSION_PATTERN.test(candidate.term) &&
    !TECHNICAL_CONTEXT_HINT_PATTERN.test(context) &&
    !isChineseFragmentLike(candidate.term);
  const isSingleWordEnglish = /^[A-Z][A-Za-z]{3,}$/.test(candidate.term);
  const isChineseTechnicalTerm =
    CHINESE_TECHNICAL_TERM_PATTERN.test(candidate.term) ||
    (/^[\u4e00-\u9fa5]{2,6}$/.test(candidate.term) &&
      (TECHNICAL_CONTEXT_HINT_PATTERN.test(context) ||
        EXPLANATORY_CONTEXT_HINT_PATTERN.test(context)));
  const source =
    candidate.candidateSource ??
    inferGlossaryCandidateSource(candidate.term, candidate.firstContext);
  const matchedSignals: string[] = [];

  let shapeScore = 0;
  if (/^[A-Z]{2,}(?:\s+[A-Z0-9]{2,})*$/.test(candidate.term)) {
    shapeScore += 5;
  }
  if (/^[A-Za-z]+(?:\s+[A-Za-z]+){1,3}$/.test(candidate.term)) {
    shapeScore += 4;
  }
  if (/^[A-Za-z]+(?:\s+)?\d+(?:\.\d+)+$/i.test(candidate.term)) {
    shapeScore += 5;
  }
  if (/^[A-Za-z]{2,}\s*(大会|峰会|论坛|发布会|活动)$/i.test(candidate.term)) {
    shapeScore += 5;
  }
  if (isChineseName) {
    shapeScore += 4;
    matchedSignals.push("chinese_name_shape");
  }
  if (isChineseTechnicalTerm) {
    shapeScore += 4;
    matchedSignals.push("short_domain_term_shape");
  }
  if (isSingleWordEnglish) {
    shapeScore += 3;
    matchedSignals.push("single_word_proper_shape");
  }
  if (source === "meetingOrEvent") {
    shapeScore += 4;
    matchedSignals.push("event_shape");
  }

  let contextScore = 0;
  if (PERSON_CONTEXT_HINT_PATTERN.test(context) && isChineseName) {
    contextScore += 5;
    matchedSignals.push("person_context");
  }
  if (ENGLISH_ENTITY_CONTEXT_HINT_PATTERN.test(context) && isSingleWordEnglish) {
    contextScore += 4;
    matchedSignals.push("english_entity_context");
  }
  if (TECHNICAL_CONTEXT_HINT_PATTERN.test(context) && isChineseTechnicalTerm) {
    contextScore += 4;
    matchedSignals.push("technical_context");
  }
  if (EXPLANATORY_CONTEXT_HINT_PATTERN.test(context) && isChineseTechnicalTerm) {
    contextScore += 3;
    matchedSignals.push("explanatory_context");
  }
  if (MEETING_OR_EVENT_PATTERN.test(context) || /(大会|峰会|论坛|发布会|活动)/.test(context)) {
    contextScore += 2;
    matchedSignals.push("event_context");
  }
  if (
    /(?:stands?\s+for|refers?\s+to|means?|is\s+short\s+for|指的是|是指|全称是|代表的是)/i.test(
      context,
    )
  ) {
    contextScore += 4;
    matchedSignals.push("definition_like_context");
  }

  let documentScore = 0;
  const inTitle = countWholeTermMatches(candidate.term, normalizedDoc.title) > 0;
  const inSummary =
    countWholeTermMatches(candidate.term, normalizedDoc.generatedSummary) > 0;
  const inSections = normalizedDoc.sectionTexts.some(
    (text) => countWholeTermMatches(candidate.term, text) > 0,
  );
  if (inTitle) {
    documentScore += 5;
    matchedSignals.push("in_title");
  }
  if (inSummary) {
    documentScore += 4;
    matchedSignals.push("in_summary");
  }
  if (inSections) {
    documentScore += 3;
    matchedSignals.push("in_sections");
  }
  if (
    source === "chineseDomainTerm" &&
    normalizedDoc.sectionTexts.some(
      (text) =>
        looksLikeDomainRelevantSection(text) &&
        countWholeTermMatches(candidate.term, text) > 0,
    )
  ) {
    documentScore += 3;
    matchedSignals.push("in_domain_section");
  }

  let coOccurrenceScore = 0;
  if (candidate.occurrenceCount >= 2) {
    coOccurrenceScore += Math.min(candidate.occurrenceCount, 4);
    matchedSignals.push("repeated_occurrence");
  }
  if (
    normalizedDoc.keywordTerms.some(
      (term) =>
        term &&
        countWholeTermMatches(term, context) > 0,
    )
  ) {
    coOccurrenceScore += 2;
    matchedSignals.push("keyword_cooccurrence");
  }
  if (
    /[A-Z]/.test(candidate.term) &&
    TECHNICAL_CONTEXT_HINT_PATTERN.test(context)
  ) {
    coOccurrenceScore += 2;
    matchedSignals.push("technical_entity_cooccurrence");
  }
  if (
    source === "chineseDomainTerm" &&
    /[A-Z][A-Za-z0-9.+-]+|[A-Z]{2,}/.test(context)
  ) {
    coOccurrenceScore += 2;
    matchedSignals.push("entity_nearby");
  }

  let termhoodScore = 0;
  if (candidate.occurrenceCount >= 2) {
    termhoodScore += 2;
  }
  if (inTitle || inSummary || inSections) {
    termhoodScore += 2;
  }
  if (EXPLANATORY_CONTEXT_HINT_PATTERN.test(context)) {
    termhoodScore += 2;
  }
  if (source === "chineseDomainTerm" && !isChineseFragmentLike(candidate.term)) {
    termhoodScore += 1;
  }
  if (source === "singleWordProperNoun" && documentScore >= 4 && coOccurrenceScore >= 4) {
    termhoodScore += 1;
  }
  if (
    /^[A-Z]{2,}(?:\s+[A-Z0-9]{2,})*$/.test(candidate.term) &&
    (documentScore >= 4 || contextScore >= 4)
  ) {
    termhoodScore += 1;
  }

  const semanticScore = 0;

  let noisePenalty = 0;
  if (isLowValueGlossaryCandidate(candidate.term, context)) {
    noisePenalty += 8;
  }
  if (isNoisyHighConfidenceCandidate(candidate.term, context)) {
    noisePenalty += 6;
  }
  if (/^[\u4e00-\u9fa5]{9,}$/.test(candidate.term)) {
    noisePenalty += 4;
    matchedSignals.push("long_chinese_penalty");
  }
  if (
    source === "chineseDomainTerm" &&
    /^[\u4e00-\u9fa5]{2,6}$/.test(candidate.term) &&
    countChineseFunctionWords(candidate.firstContext) >= 3 &&
    !EXPLANATORY_CONTEXT_HINT_PATTERN.test(context) &&
    !TECHNICAL_CONTEXT_HINT_PATTERN.test(context)
  ) {
    noisePenalty += 4;
    matchedSignals.push("weak_domain_context_penalty");
  }
  if (source === "chineseDomainTerm" && isChineseFragmentLike(candidate.term)) {
    noisePenalty += 8;
    matchedSignals.push("fragment_like_penalty");
  }
  if (
    source === "singleWordProperNoun" &&
    ENGLISH_GENERIC_ACTION_OR_COMMON_WORDS.has(candidate.term.toLowerCase())
  ) {
    noisePenalty += 6;
    matchedSignals.push("generic_english_word_penalty");
  }
  if (
    source === "singleWordProperNoun" &&
    ENGLISH_GENERIC_ACTION_OR_UI_WORDS.has(candidate.term.toLowerCase())
  ) {
    noisePenalty += 8;
    matchedSignals.push("generic_english_action_or_ui_penalty");
  }
  if (
    isPotentialCorruptedEnglishToken(candidate.term) &&
    documentScore < 4 &&
    contextScore < 4
  ) {
    noisePenalty += 8;
    matchedSignals.push("corrupted_english_token_penalty");
  }
  if (
    source === "singleWordProperNoun" &&
    /^[A-Z]{4,}$/.test(candidate.term) &&
    documentScore < 4 &&
    contextScore < 4
  ) {
    noisePenalty += 4;
    matchedSignals.push("uppercase_single_word_penalty");
  }
  if (
    source === "englishProperNoun" &&
    /^[A-Z]+(?:\s+[A-Z]+)+$/.test(candidate.term) &&
    candidate.term.split(/\s+/).every((word) =>
      ENGLISH_GENERIC_ACTION_OR_COMMON_WORDS.has(word.toLowerCase()),
    )
  ) {
    noisePenalty += 8;
    matchedSignals.push("generic_english_phrase_penalty");
  }
  if (
    source === "englishProperNoun" &&
    isGenericEnglishPhrase(candidate.term) &&
    documentScore < 4 &&
    contextScore < 4
  ) {
    noisePenalty += 6;
    matchedSignals.push("weak_english_phrase_entity_penalty");
  }
  if (
    source === "acronym" &&
    candidate.term.split(/\s+/).length >= 2 &&
    candidate.term.split(/\s+/).every((word) =>
      ENGLISH_GENERIC_ACTION_OR_COMMON_WORDS.has(word.toLowerCase()),
    )
  ) {
    noisePenalty += 8;
    matchedSignals.push("generic_acronym_phrase_penalty");
  }
  if (
    source === "acronym" &&
    isWeakAcronymContext(candidate, {
      documentScore,
      contextScore,
      coOccurrenceScore,
    })
  ) {
    noisePenalty += 6;
    matchedSignals.push("weak_acronym_context_penalty");
  }
  if (
    isGenericBusinessOrTechnicalEnglishTerm(candidate.term) &&
    documentScore < 4 &&
    !/(?:stands?\s+for|refers?\s+to|means?|指的是|是指|全称是|代表的是)/i.test(context)
  ) {
    noisePenalty += 5;
    matchedSignals.push("generic_business_term_penalty");
  }
  if (
    isGenericBusinessOrTechnicalEnglishTerm(candidate.term) &&
    termhoodScore < 4
  ) {
    noisePenalty += 3;
    matchedSignals.push("weak_termhood_for_generic_term");
  }
  if (
    looksLikeSingleNamePersonLike(candidate.term) &&
    !PERSON_CONTEXT_HINT_PATTERN.test(context) &&
    documentScore < 5
  ) {
    noisePenalty += 5;
    matchedSignals.push("single_name_person_like_penalty");
  }
  if (isChineseBoundaryFragment(candidate.term)) {
    noisePenalty += 8;
    matchedSignals.push("chinese_boundary_fragment_penalty");
  }

  const totalScore =
    shapeScore +
    contextScore +
    documentScore +
    coOccurrenceScore +
    termhoodScore +
    semanticScore -
    noisePenalty;

  return {
    shapeScore,
    contextScore,
    documentScore,
    coOccurrenceScore,
    termhoodScore,
    semanticScore,
    noisePenalty,
    totalScore,
    finalScore: totalScore,
    matchedSignals,
  };
}

function hasStrongStructuralGlossarySignal(term: string, context = "") {
  const normalized = normalizeCandidateTerm(term);

  if (!normalized) {
    return false;
  }

  if (/^[A-Z]{2,}(?:\s+[A-Z0-9]{2,})*$/.test(normalized)) {
    return true;
  }

  if (/^[A-Za-z]+(?:\s+[A-Za-z]+){1,3}$/.test(normalized)) {
    const words = normalized.split(/\s+/);
    if (words.every((word) => /^[A-Z][A-Za-z0-9.+-]*$/.test(word))) {
      return true;
    }
  }

  if (/^[A-Za-z]+(?:\s+)?\d+(?:\.\d+)+$/i.test(normalized)) {
    return true;
  }

  if (/^[A-Za-z]{2,}\s*(大会|峰会|论坛|发布会|活动)$/i.test(normalized)) {
    return true;
  }

  if (
    /^[\u4e00-\u9fa5]{2,4}$/.test(normalized) &&
    CHINESE_SURNAME_TEST_PATTERN.test(normalized) &&
    PERSON_CONTEXT_HINT_PATTERN.test(context)
  ) {
    return true;
  }

  if (
    /^[\u4e00-\u9fa5]{2,10}$/.test(normalized) &&
    (TECHNICAL_CONTEXT_HINT_PATTERN.test(context) ||
      EXPLANATORY_CONTEXT_HINT_PATTERN.test(context)) &&
    /(学习|模型|推理|对齐|扩散|上下文|训练|部署|参数|算力|架构|机制|原理|性能|成本|方法|策略|流程)/.test(
      normalized,
    )
  ) {
    return true;
  }

  if (/[A-Z]/.test(normalized) && TECHNICAL_CONTEXT_HINT_PATTERN.test(context)) {
    return true;
  }

  return false;
}

function isNoisyHighConfidenceCandidate(term: string, context = "") {
  const normalized = normalizeCandidateTerm(term);

  if (!normalized) {
    return true;
  }

  if (hasStrongStructuralGlossarySignal(normalized, context)) {
    return false;
  }

  if (HIGH_CONFIDENCE_ROLE_DESCRIPTION_PATTERN.test(normalized)) {
    return true;
  }

  const englishWords = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (
    englishWords.length >= 3 &&
    englishWords.some((word) => ENGLISH_STOPWORDS.has(word.toLowerCase())) &&
    /^[A-Z0-9\s.-]+$/.test(normalized)
  ) {
    return true;
  }

  if (
    /^[A-Z]{10,}$/.test(normalized) &&
    !/^[A-Z]{2,6}$/.test(normalized) &&
    !/^[A-Z]{2,}(?:\s+[A-Z0-9]{2,}){0,2}$/.test(normalized)
  ) {
    return true;
  }

  if (
    /^[A-Z][A-Za-z]{12,}$/.test(normalized) &&
    !/[a-z]+[A-Z][a-z]+/.test(normalized)
  ) {
    return true;
  }

  if (
    /(AI\s+(?:SOFTWARE ENGINEER|CODING AGENT)|(?:CEO|CTO|CFO|COO|FOUNDER)\s+[A-Z][A-Za-z]+)/i.test(
      normalized,
    ) &&
    !hasStrongStructuralGlossarySignal(normalized, context)
  ) {
    return true;
  }

  if (
    /^[A-Z][A-Z\s.-]{8,}$/.test(normalized) &&
    normalized.split(/\s+/).length >= 2 &&
    !MEETING_OR_EVENT_PATTERN.test(normalized) &&
    !/^[A-Z]{2,6}(?:\s+[A-Z0-9]{2,6})*$/.test(normalized)
  ) {
    return true;
  }

  return false;
}

function isLowValueGlossaryCandidate(term: string, context = "") {
  const normalized = normalizeCandidateTerm(term);
  const lowered = normalized.toLowerCase();
  const compactContext = cleanText(context);

  if (!normalized) {
    return true;
  }

  if (hasStrongStructuralGlossarySignal(normalized, compactContext)) {
    return false;
  }

  if (LOW_VALUE_CHINESE_GLOSSARY_TERMS.has(normalized)) {
    return true;
  }

  if (LOW_VALUE_ENGLISH_GLOSSARY_TERMS.has(lowered)) {
    return true;
  }

  if (GENERIC_ABSTRACT_CHINESE_PATTERN.test(normalized)) {
    return true;
  }

  if (
    /^[\u4e00-\u9fa5]{2,4}$/.test(normalized) &&
    (LOW_VALUE_CHINESE_FRAGMENT_PATTERN.test(normalized) ||
      (LOW_VALUE_CHINESE_SUFFIX_PATTERN.test(normalized) &&
        !/(大会|峰会|模型|框架|协议|方法|系统|工具|产品)$/.test(normalized)))
  ) {
    return true;
  }

  if (
    /^[\u4e00-\u9fa5]{2,6}$/.test(normalized) &&
    CHINESE_SHORT_DOMAIN_STOPWORDS.has(normalized)
  ) {
    return true;
  }

  if (isChineseBoundaryFragment(normalized)) {
    return true;
  }

  if (isChineseFragmentLike(normalized)) {
    return true;
  }

  if (
    /^[\u4e00-\u9fa5]{2,6}$/.test(normalized) &&
    !CHINESE_SURNAME_TEST_PATTERN.test(normalized) &&
    !/(大会|峰会|模型|框架|协议|方法|学习|系统|工具|产品|上下文)$/.test(normalized) &&
    !TECHNICAL_CONTEXT_HINT_PATTERN.test(compactContext) &&
    !EXPLANATORY_CONTEXT_HINT_PATTERN.test(compactContext)
  ) {
    return true;
  }

  if (
    /^[\u4e00-\u9fa5]{2,10}$/.test(normalized) &&
    !/(大会|峰会|框架|协议|方法|系统|工具|产品|模型|上下文|学习)$/.test(normalized) &&
    !PERSON_CONTEXT_HINT_PATTERN.test(compactContext) &&
    !TECHNICAL_CONTEXT_HINT_PATTERN.test(compactContext)
  ) {
    return true;
  }

  if (
    /^[\u4e00-\u9fa5]{9,}$/.test(normalized) &&
    ((normalized.match(/[的了是在有和就又还也如果因为所以这个那个一个公司产品模型]/g)
      ?.length ?? 0) >= 2) &&
    !/(大会|峰会|框架|协议|方法|系统|工具|产品|模型|上下文|学习)$/.test(normalized) &&
    !TECHNICAL_CONTEXT_HINT_PATTERN.test(compactContext)
  ) {
    return true;
  }

  if (
    /^[A-Z\s]+$/.test(normalized) &&
    !/^[A-Z]{2,6}(?:\s+[A-Z0-9]{2,6})*$/.test(normalized) &&
    !MEETING_OR_EVENT_PATTERN.test(normalized)
  ) {
    return true;
  }

  if (
    /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}$/.test(normalized) &&
    normalized.split(/\s+/).every((part) => part.length <= 4) &&
    !TECHNICAL_CONTEXT_HINT_PATTERN.test(compactContext)
  ) {
    return true;
  }

  if (
    compactContext &&
    /(欢迎|评论区|公众号|听友群|加入群|订阅|收听|商务合作|相关链接|参考链接)/.test(
      compactContext,
    )
  ) {
    return true;
  }

  return false;
}

function inferGlossaryCandidateConfidence(
  candidate: GlossaryCandidate,
  documentContext?: GlossaryDocumentContext,
): "high" | "medium" | "low" {
  const term = candidate.term;
  const context = candidate.firstContext;
  const scores = inferGlossaryCandidateScores(candidate, documentContext);

  if (
    isLowValueGlossaryCandidate(term, context) ||
    isNoisyHighConfidenceCandidate(term, context)
  ) {
    return "low";
  }

  if (
    /^[\u4e00-\u9fa5]{9,}$/.test(term) &&
    !hasStrongStructuralGlossarySignal(term, context)
  ) {
    return "low";
  }

  const strongSignalCount = [
    scores.shapeScore >= 4,
    scores.contextScore >= 4,
    scores.documentScore >= 4,
    scores.coOccurrenceScore >= 3,
  ].filter(Boolean).length;
  const acronymTopicAnchor = hasAcronymTopicAnchor(candidate, scores);

  if (candidate.candidateSource === "chinesePerson") {
    return scores.totalScore >= 8 && scores.documentScore >= 4 ? "medium" : "low";
  }

  if (
    candidate.candidateSource === "chineseDomainTerm" &&
    strongSignalCount < 2
  ) {
    return scores.totalScore >= 6 ? "medium" : "low";
  }

  if (candidate.candidateSource === "chineseDomainTerm") {
    const domainHigh =
      strongSignalCount >= 2 &&
      scores.termhoodScore >= 4 &&
      scores.noisePenalty <= 2 &&
      ((scores.documentScore >= 4 && scores.coOccurrenceScore >= 2) ||
        (scores.contextScore >= 4 && scores.coOccurrenceScore >= 3));

    if (domainHigh) {
      return "high";
    }

    return scores.totalScore >= 6 ? "medium" : "low";
  }

  if (candidate.candidateSource === "singleWordProperNoun") {
    const singleWordHigh =
      strongSignalCount >= 2 &&
      scores.documentScore >= 4 &&
      scores.termhoodScore >= 4 &&
      (scores.contextScore >= 4 || scores.coOccurrenceScore >= 5) &&
      scores.noisePenalty <= 2 &&
      !isGenericBusinessOrTechnicalEnglishTerm(candidate.term) &&
      !isPotentialCorruptedEnglishToken(candidate.term) &&
      !looksLikeSingleNamePersonLike(candidate.term);

    if (singleWordHigh) {
      return "high";
    }

    return scores.totalScore >= 6 ? "medium" : "low";
  }

  if (candidate.candidateSource === "englishProperNoun") {
    const phraseHigh =
      strongSignalCount >= 2 &&
      scores.termhoodScore >= 4 &&
      (scores.documentScore >= 4 || scores.contextScore >= 4) &&
      scores.noisePenalty <= 2 &&
      !isGenericEnglishPhrase(candidate.term);

    if (phraseHigh) {
      return "high";
    }

    return scores.totalScore >= 6 ? "medium" : "low";
  }

  if (candidate.candidateSource === "acronym") {
    const multiWordAcronym = candidate.term.split(/\s+/).length >= 2;
    const acronymHigh =
      strongSignalCount >= 2 &&
      scores.termhoodScore >= 4 &&
      scores.noisePenalty <= 2 &&
      acronymTopicAnchor &&
      !looksLikeSingleNamePersonLike(candidate.term) &&
      (!multiWordAcronym ||
        scores.documentScore >= 4 ||
        scores.contextScore >= 4 ||
        candidate.categoryGuess === "abbreviation");

    if (acronymHigh) {
      return "high";
    }

    return scores.totalScore >= 6 ? "medium" : "low";
  }

  if (scores.totalScore >= 11 && strongSignalCount >= 2) {
    return "high";
  }

  if (scores.totalScore >= 5) {
    return "medium";
  }

  return "low";
}

function isGenericStandaloneEnglishTerm(term: string) {
  return GENERIC_ENGLISH_GLOSSARY_TERMS.has(term.trim().toLowerCase());
}

function isGenericBusinessOrTechnicalEnglishTerm(term: string) {
  return GENERIC_BUSINESS_OR_TECHNICAL_TERMS.has(term.trim().toLowerCase());
}

function isGenericEnglishPhrase(term: string) {
  const words = term
    .trim()
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
  return (
    words.length >= 2 &&
    words.every((word) => ENGLISH_GENERIC_ACTION_OR_COMMON_WORDS.has(word))
  );
}

function isPotentialCorruptedEnglishToken(term: string) {
  const normalized = term.trim();
  if (!/^[A-Za-z]{5,}$/.test(normalized)) {
    return false;
  }

  const lower = normalized.toLowerCase();
  const vowels = lower.match(/[aeiou]/g)?.length ?? 0;
  const consonantClusters = lower.match(/[bcdfghjklmnpqrstvwxyz]{4,}/g)?.length ?? 0;
  const oddTail = /[bcdfghjklmnpqrstvwxyz]{2,}$/.test(lower);
  const repeatedTail = /(.)\1{2,}$/.test(lower);

  return (
    (vowels <= 1 && normalized.length >= 6) ||
    consonantClusters >= 1 ||
    oddTail ||
    repeatedTail
  );
}

function hasAcronymTopicAnchor(
  candidate: GlossaryCandidate,
  scores: NonNullable<GlossaryCandidate["scoreBreakdown"]>,
) {
  const context = candidate.firstContext;
  const definitionLike =
    /(?:stands?\s+for|refers?\s+to|means?|is\s+short\s+for|指的是|是指|全称是|代表的是)/i.test(
      context,
    );
  const strongEntityContext =
    ENGLISH_ENTITY_CONTEXT_HINT_PATTERN.test(context) ||
    TECHNICAL_CONTEXT_HINT_PATTERN.test(context) ||
    MEETING_OR_EVENT_PATTERN.test(context);
  const documentAnchor = scores.documentScore >= 4;
  const repeatedAndContextual =
    candidate.occurrenceCount >= 2 && scores.coOccurrenceScore >= 3 && strongEntityContext;

  return documentAnchor || definitionLike || repeatedAndContextual;
}

function isWeakAcronymContext(
  candidate: GlossaryCandidate,
  scores: Pick<
    NonNullable<GlossaryCandidate["scoreBreakdown"]>,
    "documentScore" | "contextScore" | "coOccurrenceScore"
  >,
) {
  if (candidate.candidateSource !== "acronym") {
    return false;
  }

  return (
    scores.documentScore < 4 &&
    scores.contextScore < 4 &&
    scores.coOccurrenceScore < 4 &&
    candidate.occurrenceCount <= 1
  );
}

function hasGlossaryExplanationValue(term: string) {
  if (!isMeaningfulGlossaryCandidate(term)) {
    return false;
  }

  if (isLowValueGlossaryCandidate(term)) {
    return false;
  }

  if (isGenericStandaloneEnglishTerm(term)) {
    return false;
  }

  if (/^[a-z]+$/i.test(term) && term.length <= 3) {
    return false;
  }

  if (/^(agent)$/i.test(term)) {
    return false;
  }

  return true;
}

function generateConservativeAliases(term: string) {
  const aliases = new Set<string>();
  const normalized = normalizeGlossaryTerm(term);
  const spacedCamel = term
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .trim();

  if (spacedCamel && spacedCamel !== term && hasGlossaryExplanationValue(spacedCamel)) {
    aliases.add(spacedCamel);
  }

  const lowered = spacedCamel ? spacedCamel.toLowerCase() : term.toLowerCase();

  if (
    lowered &&
    lowered !== term.toLowerCase() &&
    hasGlossaryExplanationValue(lowered) &&
    !isGenericStandaloneEnglishTerm(lowered)
  ) {
    aliases.add(lowered);
  }

  const noSpace = term.replace(/\s+/g, "").trim();
  if (noSpace && noSpace !== term && hasGlossaryExplanationValue(noSpace)) {
    aliases.add(noSpace);
  }

  const hyphenated = term.replace(/\s+/g, "-").trim();
  if (hyphenated && hyphenated !== term && hasGlossaryExplanationValue(hyphenated)) {
    aliases.add(hyphenated);
  }

  const dehyphenated = term.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (
    dehyphenated &&
    dehyphenated !== term &&
    hasGlossaryExplanationValue(dehyphenated)
  ) {
    aliases.add(dehyphenated);
  }

  const versionTightened = term.replace(/\s+(?=\d+(?:\.\d+)+)/g, "").trim();
  if (
    versionTightened &&
    versionTightened !== term &&
    hasGlossaryExplanationValue(versionTightened)
  ) {
    aliases.add(versionTightened);
  }

  return Array.from(aliases).filter((alias) => {
    const aliasKey = normalizeGlossaryTerm(alias);

    return aliasKey && aliasKey !== normalized && !isGenericStandaloneEnglishTerm(alias);
  });
}

function isMeaningfulKeywordCandidate(term: string) {
  const normalized = normalizeCandidateTerm(term);

  if (!normalized) {
    return false;
  }

  if (GENERIC_TERMS.has(normalized)) {
    return false;
  }

  if (/^[A-Za-z]$/.test(normalized)) {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return false;
  }

  if (normalized.length < 2) {
    return false;
  }

  if (/^[然后就是这个那个嗯呃啊]+$/.test(normalized)) {
    return false;
  }

  return true;
}

function isMeaningfulGlossaryCandidate(term: string) {
  const normalized = normalizeCandidateTerm(term);
  const dedupKey = normalizeDedupKey(normalized);

  if (!normalized || !dedupKey) {
    return false;
  }

  if (GENERIC_GLOSSARY_TERMS.has(normalized)) {
    return false;
  }

  if (normalized.length < 2) {
    return false;
  }

  if (/^[\p{P}\p{S}]+$/u.test(normalized)) {
    return false;
  }

  if (/^(欢迎|评论区|公众号|听友群|加入群|订阅|收听|商务合作|相关链接|参考链接)/.test(normalized)) {
    return false;
  }

  if (/^(https?:\/\/|www\.|\S+@\S+\.\S+)/i.test(normalized)) {
    return false;
  }

  if (/^[然后就是这个那个嗯呃啊]+$/.test(normalized)) {
    return false;
  }

  return true;
}

function candidateScore(candidate: KeywordCandidate) {
  let score = candidate.count * 10;

  if (KEYWORD_HINT_PATTERN.test(candidate.term)) {
    score += 8;
  }

  if (
    /[A-Z]/.test(candidate.term) ||
    /[A-Za-z]+\s+[A-Za-z]+/.test(candidate.term)
  ) {
    score += 6;
  }

  if (/[\d.]/.test(candidate.term)) {
    score += 2;
  }

  if (candidate.term.length >= 3 && candidate.term.length <= 16) {
    score += 3;
  }

  return score;
}

function glossaryCandidateScore(candidate: KeywordCandidate) {
  let score = 0;

  score += candidate.count * 6;

  if (/[A-Z]{2,}/.test(candidate.term)) {
    score += 12;
  }

  if (/[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}/.test(candidate.term)) {
    score += 10;
  }

  if (GLOSSARY_HINT_PATTERN.test(candidate.term)) {
    score += 8;
  }

  if (/[\u4e00-\u9fa5]{2,}(?:架构|框架|模型|协议|方法|系统|工具|产品|公司|组织)/.test(candidate.term)) {
    score += 6;
  }

  if (candidate.term.length >= 2 && candidate.term.length <= 24) {
    score += 3;
  }

  return score;
}

function glossaryCandidatePriority(candidate: GlossaryCandidate) {
  const baseScore = glossaryCandidateScore({
    term: candidate.term,
    count: candidate.occurrenceCount,
    firstEvidenceBlockId: candidate.firstEvidenceBlockId,
    sampleContext: candidate.firstContext,
  });

  return baseScore + (candidate.scoreBreakdown?.totalScore ?? 0) * 4;
}

function sliceLocalContext(text: string, index: number, length: number, window = 24) {
  const start = Math.max(0, index - window);
  const end = Math.min(text.length, index + length + window);
  return text.slice(start, end);
}

export function extractKeywordCandidatesFromTranscript(
  blocks: TranscriptBlock[],
): KeywordCandidate[] {
  const candidates = new Map<string, KeywordCandidate>();

  const collectCandidate = (term: string, block: TranscriptBlock) => {
    const normalizedTerm = normalizeCandidateTerm(term);

    if (!isMeaningfulKeywordCandidate(normalizedTerm)) {
      return;
    }

    const existing = candidates.get(normalizedTerm);

    if (existing) {
      existing.count += 1;
      return;
    }

    candidates.set(normalizedTerm, {
      term: normalizedTerm,
      count: 1,
      firstEvidenceBlockId: block.id,
      sampleContext: block.text.slice(0, 120),
    });
  };

  for (const block of blocks) {
    const text = cleanText(block.text);

    if (!text) {
      continue;
    }

    const englishMatches =
      text.match(
        /\b[A-Z][A-Za-z0-9.+#-]*(?:\s+[A-Z][A-Za-z0-9.+#-]*){0,2}\b|\b[A-Za-z]{2,}(?:\s+[A-Za-z0-9.+#-]{2,}){0,2}\b|\b[A-Z]{2,}(?:-[A-Z0-9]{2,})*\b/g,
      ) ?? [];
    const hintedChineseMatches =
      text.match(
        /[\u4e00-\u9fa5A-Za-z0-9]{2,16}(?:平台|系统|框架|模型|接口|工具|产品|方法|协议)/g,
      ) ?? [];
    const chinesePhraseMatches = text.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [];

    for (const term of [
      ...englishMatches,
      ...hintedChineseMatches,
      ...chinesePhraseMatches,
    ]) {
      collectCandidate(term, block);
    }
  }

  return Array.from(candidates.values())
    .filter(
      (candidate) =>
        candidate.count > 1 || KEYWORD_HINT_PATTERN.test(candidate.term),
    )
    .sort((a, b) => candidateScore(b) - candidateScore(a) || b.count - a.count)
    .slice(0, MAX_KEYWORD_CANDIDATES);
}

function preferCanonicalGlossaryTerm(current: string, incoming: string) {
  const currentScore =
    current.length +
    (current.split(/\s+/).length > 1 ? 8 : 0) +
    (/[A-Z]/.test(current) ? 4 : 0) +
    (/^[A-Z0-9.\s-]+$/.test(current) ? 1 : 0);
  const incomingScore =
    incoming.length +
    (incoming.split(/\s+/).length > 1 ? 8 : 0) +
    (/[A-Z]/.test(incoming) ? 4 : 0) +
    (/^[A-Z0-9.\s-]+$/.test(incoming) ? 1 : 0);

  return incomingScore > currentScore ? incoming : current;
}

function parseModelVersionCandidate(term: string) {
  const cleaned = normalizeCandidateTerm(term);
  const match = cleaned.match(
    /^([A-Za-z][A-Za-z0-9\s.-]*?)\s*(\d+(?:\.\d+)*(?:[a-z])?|[a-z]?\d+(?:\.\d+)*)$/i,
  );

  if (!match) {
    return null;
  }

  const [, rawBase, rawVersion] = match;
  const base = rawBase.trim();
  const version = rawVersion.trim().toLowerCase();
  const normalizedBase = normalizeDedupKey(base);

  if (!base || !version || !normalizedBase) {
    return null;
  }

  return {
    base,
    version,
    normalizedBase,
  };
}

function areModelVersionVariants(a: GlossaryCandidate, b: GlossaryCandidate) {
  const parsedA = parseModelVersionCandidate(a.term);
  const parsedB = parseModelVersionCandidate(b.term);

  if (!parsedA || !parsedB) {
    return false;
  }

  if (parsedA.version !== parsedB.version) {
    return false;
  }

  if (parsedA.normalizedBase === parsedB.normalizedBase) {
    return true;
  }

  if (
    parsedA.normalizedBase.includes(parsedB.normalizedBase) ||
    parsedB.normalizedBase.includes(parsedA.normalizedBase)
  ) {
    return true;
  }

  const baseTokensA = parsedA.base
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const baseTokensB = parsedB.base
    .toLowerCase()
    .split(/[\s._-]+/)
    .filter(Boolean);

  return baseTokensA.some((tokenA) =>
    baseTokensB.some(
      (tokenB) =>
        tokenA === tokenB ||
        tokenA.includes(tokenB) ||
        tokenB.includes(tokenA),
    ),
  );
}

function mergeGlossaryCandidate(
  existing: GlossaryCandidate,
  incoming: GlossaryCandidate,
) {
  const preferredTerm = preferCanonicalGlossaryTerm(existing.term, incoming.term);

  return {
    ...existing,
    term: preferredTerm,
    aliases: Array.from(new Set([...existing.aliases, ...incoming.aliases])),
    categoryGuess: existing.categoryGuess ?? incoming.categoryGuess,
    confidence:
      existing.confidence === "high" || incoming.confidence === "high"
        ? "high"
        : existing.confidence === "medium" || incoming.confidence === "medium"
          ? "medium"
          : existing.confidence ?? incoming.confidence,
    occurrenceCount: existing.occurrenceCount + incoming.occurrenceCount,
    allEvidenceBlockIds: Array.from(
      new Set([...existing.allEvidenceBlockIds, ...incoming.allEvidenceBlockIds]),
    ),
  } satisfies GlossaryCandidate;
}

function collectGlossaryMatches(
  text: string,
  documentContext?: GlossaryDocumentContext,
) {
  const normalizedText = text.normalize("NFKC");
  const normalizedDoc = normalizeDocumentContext(documentContext);
  const patterns = [
    /\b[A-Z][A-Za-z0-9.+-]*(?:\s+[A-Z][A-Za-z0-9.+-]*){1,3}\b/g,
    /\b[A-Z]{2,}(?:\s+[A-Z0-9]{2,}){0,2}\b/g,
    /\b[A-Za-z]{2,}[-\s]?\d+(?:\.\d+)+\b/g,
    /(?:[A-Za-z]{2,}\s*(?:大会|峰会|论坛|发布会|活动))/g,
    /(?:[\u4e00-\u9fa5]{2,12}(?:架构|框架|协议|方法|系统|工具|产品|模型|大会|峰会|论坛|发布会|活动))/g,
    /(?:[\u4e00-\u9fa5]{2,12}(?:学习|上下文))/g,
    /\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z0-9.+-]+){1,3}\b/g,
    CHINESE_SURNAME_PATTERN,
    /\b[A-Z][a-z]{3,}\b/g,
  ];
  const matches = new Set<string>();

  for (const pattern of patterns) {
    for (const match of normalizedText.matchAll(pattern)) {
      const value = cleanText(match[0]);

      if (value) {
        matches.add(value);
      }
    }
  }

  for (const match of normalizedText.matchAll(/[\u4e00-\u9fa5]{2,4}/g)) {
    const value = cleanText(match[0]);
    const localContext = sliceLocalContext(
      normalizedText,
      match.index ?? 0,
      value.length,
    );

    if (
      value &&
      CHINESE_SURNAME_TEST_PATTERN.test(value) &&
      PERSON_CONTEXT_HINT_PATTERN.test(localContext) &&
      !CHINESE_PERSON_EXCLUSION_PATTERN.test(value)
    ) {
      matches.add(value);
    }
  }

  for (const match of normalizedText.matchAll(/[\u4e00-\u9fa5]{2,6}/g)) {
    const value = cleanText(match[0]);
    const localContext = sliceLocalContext(
      normalizedText,
      match.index ?? 0,
      value.length,
    );

    if (
      value &&
      !LOW_VALUE_CHINESE_GLOSSARY_TERMS.has(value) &&
      !GENERIC_ABSTRACT_CHINESE_PATTERN.test(value) &&
      !CHINESE_SHORT_DOMAIN_STOPWORDS.has(value) &&
      (
        TECHNICAL_CONTEXT_HINT_PATTERN.test(localContext) ||
        EXPLANATORY_CONTEXT_HINT_PATTERN.test(localContext) ||
        countTermInText(normalizeGlossaryTerm(value), normalizedDoc.fullText) > 0
      )
    ) {
      matches.add(value);
    }
  }

  for (const match of normalizedText.matchAll(/\b[a-z][a-z0-9.+-]{3,}(?:\s+[a-z][a-z0-9.+-]{3,})?\b/g)) {
    const value = cleanText(match[0]);
    const localContext = sliceLocalContext(
      normalizedText,
      match.index ?? 0,
      value.length,
    );
    const wordCount = value.split(/\s+/).length;

    if (
      value &&
      !GENERIC_ENGLISH_GLOSSARY_TERMS.has(value) &&
      (PERSON_CONTEXT_HINT_PATTERN.test(localContext) ||
        ENGLISH_ENTITY_CONTEXT_HINT_PATTERN.test(localContext) ||
        TECHNICAL_CONTEXT_HINT_PATTERN.test(localContext)) &&
      (wordCount > 1 || /^[a-z][a-z0-9.+-]{4,}$/i.test(value))
    ) {
      matches.add(titleCaseWords(value));
    }
  }

  return Array.from(matches);
}

export function dedupeGlossaryCandidates(candidates: GlossaryCandidate[]) {
  const exactMerged = new Map<string, GlossaryCandidate>();

  for (const candidate of candidates) {
    const key = candidate.normalizedTerm;
    const existing = exactMerged.get(key);

    if (!existing) {
      exactMerged.set(key, candidate);
      continue;
    }

    exactMerged.set(key, mergeGlossaryCandidate(existing, candidate));
  }

  const merged = Array.from(exactMerged.values()).sort(
    (a, b) =>
      glossaryCandidateScore({
        term: b.term,
        count: b.occurrenceCount,
        firstEvidenceBlockId: b.firstEvidenceBlockId,
        sampleContext: b.firstContext,
      }) -
        glossaryCandidateScore({
          term: a.term,
          count: a.occurrenceCount,
          firstEvidenceBlockId: a.firstEvidenceBlockId,
          sampleContext: a.firstContext,
        }) ||
      b.term.length - a.term.length,
  );

  const selected: GlossaryCandidate[] = [];

  for (const candidate of merged) {
    const duplicateTarget = selected.find((other) => {
      if (other.normalizedTerm === candidate.normalizedTerm) {
        return true;
      }

      if (
        areModelVersionVariants(other, candidate) &&
        (hasVersionSignal(other.term) || hasVersionSignal(candidate.term))
      ) {
        return true;
      }

      return (
        other.normalizedTerm.includes(candidate.normalizedTerm) &&
        other.term.length > candidate.term.length &&
        ((hasVersionSignal(other.term) && !hasVersionSignal(candidate.term)) ||
          other.term.split(/\s+/).length > candidate.term.split(/\s+/).length ||
          candidate.term.split(/\s+/).length === 1 ||
          isGenericStandaloneEnglishTerm(candidate.term)) &&
        !(
          hasStrongStructuralGlossarySignal(candidate.term, candidate.firstContext) &&
          !hasVersionSignal(other.term)
        )
      );
    });

    if (duplicateTarget) {
      duplicateTarget.aliases = Array.from(
        new Set([
          ...duplicateTarget.aliases,
          candidate.term,
          candidate.canonicalTerm ?? "",
          ...candidate.aliases,
        ].filter(Boolean)),
      );
      continue;
    }

    selected.push(candidate);
  }

  return selected;
}

function createExcludedCandidate(
  candidate: GlossaryCandidate,
  reason: GlossaryCandidateExclusionReason,
  matchedKeyword?: string,
  duplicateOf?: string,
): GlossaryExcludedCandidate {
  return {
    term: candidate.term,
    reason,
    ...(matchedKeyword ? { matchedKeyword } : {}),
    ...(duplicateOf ? { duplicateOf } : {}),
  };
}

function buildGlossaryCandidatePipeline(
  blocks: TranscriptBlock[],
  existingKeywords: Keyword[] = [],
  documentContext?: GlossaryDocumentContext,
) {
  const existingKeywordsByKey = new Map(
    existingKeywords
      .map((keyword) => [normalizeGlossaryTerm(keyword.term), keyword.term] as const)
      .filter(([key]) => Boolean(key)),
  );
  const candidatesByKey = new Map<string, GlossaryCandidate>();

  for (const block of blocks) {
    const text = cleanText(block.text);

    if (!text) {
      continue;
    }

    for (const matchedTerm of collectGlossaryMatches(text, documentContext)) {
      const cleanedTerm = normalizeCandidateTerm(matchedTerm);
      const normalizedTerm = normalizeGlossaryTerm(cleanedTerm);

      if (!normalizedTerm) {
        continue;
      }

      const candidate: GlossaryCandidate = {
        term: toCanonicalGlossaryTerm(cleanedTerm),
        canonicalTerm: toCanonicalGlossaryTerm(cleanedTerm),
        normalizedTerm,
        candidateSource: inferGlossaryCandidateSource(cleanedTerm, text),
        aliases: generateConservativeAliases(cleanedTerm),
        categoryGuess: guessGlossaryCategory(cleanedTerm),
        confidence: "medium",
        occurrenceCount: 1,
        firstEvidenceBlockId: block.id,
        firstTimestamp: block.time,
        firstContext: block.text.slice(0, 160),
        allEvidenceBlockIds: [block.id],
      };

      const existing = candidatesByKey.get(normalizedTerm);

      if (!existing) {
        candidatesByKey.set(normalizedTerm, candidate);
        continue;
      }

      candidatesByKey.set(normalizedTerm, {
        ...mergeGlossaryCandidate(existing, candidate),
        firstEvidenceBlockId:
          existing.firstEvidenceBlockId || candidate.firstEvidenceBlockId,
        firstTimestamp: existing.firstTimestamp || candidate.firstTimestamp,
        firstContext: existing.firstContext || candidate.firstContext,
      });
    }
  }

  const rawCandidates = Array.from(candidatesByKey.values());
  const excludedCandidates: GlossaryExcludedCandidate[] = [];
  const preliminaryCandidates: GlossaryCandidate[] = [];

  for (const candidate of rawCandidates) {
    const scoreBreakdown = inferGlossaryCandidateScores(candidate, documentContext);
    const candidateSource =
      candidate.candidateSource ??
      inferGlossaryCandidateSource(candidate.term, candidate.firstContext);

    if (!candidate.firstEvidenceBlockId || candidate.allEvidenceBlockIds.length === 0) {
      excludedCandidates.push(
        createExcludedCandidate(candidate, "invalid_evidence"),
      );
      continue;
    }

    if (!isMeaningfulGlossaryCandidate(candidate.term)) {
      excludedCandidates.push(
        createExcludedCandidate(candidate, "low_value"),
      );
      continue;
    }

    if (isLowValueGlossaryCandidate(candidate.term, candidate.firstContext)) {
      excludedCandidates.push(
        createExcludedCandidate(candidate, "low_value"),
      );
      continue;
    }

    if (
      isGenericStandaloneEnglishTerm(candidate.term) ||
      GENERIC_GLOSSARY_TERMS.has(candidate.term)
    ) {
      excludedCandidates.push(
        createExcludedCandidate(candidate, "generic_term"),
      );
      continue;
    }

    if (!hasGlossaryExplanationValue(candidate.term)) {
      excludedCandidates.push(
        createExcludedCandidate(candidate, "low_value"),
      );
      continue;
    }

    const matchedKeyword = existingKeywordsByKey.get(candidate.normalizedTerm);

    if (matchedKeyword) {
      excludedCandidates.push(
        createExcludedCandidate(candidate, "keyword_overlap", matchedKeyword),
      );
      continue;
    }

    const inferredConfidence = inferGlossaryCandidateConfidence(
      candidate,
      documentContext,
    );

    preliminaryCandidates.push({
      ...candidate,
      canonicalTerm: candidate.term,
      candidateSource,
      scoreBreakdown,
      matchedSignals: scoreBreakdown.matchedSignals,
      reason: scoreBreakdown.matchedSignals.join(", "),
      whyHigh: {
        strongSignalCount: [
          scoreBreakdown.shapeScore >= 4,
          scoreBreakdown.contextScore >= 4,
          scoreBreakdown.documentScore >= 4,
          scoreBreakdown.coOccurrenceScore >= 3,
        ].filter(Boolean).length,
        documentScore: scoreBreakdown.documentScore,
        contextScore: scoreBreakdown.contextScore,
        coOccurrenceScore: scoreBreakdown.coOccurrenceScore,
        termhoodScore: scoreBreakdown.termhoodScore,
        noisePenalty: scoreBreakdown.noisePenalty,
      },
      confidence: inferredConfidence,
    });
  }

  const dedupedCandidates = dedupeGlossaryCandidates(preliminaryCandidates);
  const dedupedKeys = new Set(dedupedCandidates.map((candidate) => candidate.normalizedTerm));
  const dedupedByKey = new Map(
    dedupedCandidates.map((candidate) => [candidate.normalizedTerm, candidate] as const),
  );

  for (const candidate of preliminaryCandidates) {
    if (!dedupedKeys.has(candidate.normalizedTerm)) {
      const duplicateTarget = Array.from(dedupedByKey.values()).find((other) => {
        if (other.normalizedTerm === candidate.normalizedTerm) {
          return true;
        }

        return (
          other.normalizedTerm.includes(candidate.normalizedTerm) &&
          other.term.length >= candidate.term.length
        );
      });

      excludedCandidates.push(
        createExcludedCandidate(
          candidate,
          "duplicate",
          undefined,
          duplicateTarget?.term,
        ),
      );
    }
  }

  const filteredCandidates = dedupedCandidates.sort(
    (a, b) =>
      (b.confidence === "high" ? 2 : b.confidence === "medium" ? 1 : 0) -
        (a.confidence === "high" ? 2 : a.confidence === "medium" ? 1 : 0) ||
      glossaryCandidatePriority(b) - glossaryCandidatePriority(a) ||
      b.term.length - a.term.length,
  );

  return {
    rawCandidates,
    filteredCandidates,
    excludedCandidates,
  };
}

export function extractGlossaryCandidatesFromFullTranscript(
  blocks: TranscriptBlock[],
  existingKeywords: Keyword[] = [],
  documentContext?: GlossaryDocumentContext,
) {
  return buildGlossaryCandidatePipeline(
    blocks,
    existingKeywords,
    documentContext,
  ).filteredCandidates;
}

function buildExpectedTermCheck({
  expectedTerms,
  transcriptBlocks,
  rawCandidates,
  filteredCandidates,
  excludedCandidates,
}: {
  expectedTerms: string[];
  transcriptBlocks: TranscriptBlock[];
  rawCandidates: GlossaryCandidate[];
  filteredCandidates: GlossaryCandidate[];
  excludedCandidates: GlossaryExcludedCandidate[];
}) {
  // expectedTermCheck is diagnostics-only.
  // It must never affect candidate generation, filtering, scoring,
  // confidence assignment, inclusion/exclusion decisions, or rescue logic.
  const normalizedTranscriptText = normalizeDedupKey(
    transcriptBlocks.map((block) => block.text).join("\n"),
  );
  const rawByKey = new Map(
    rawCandidates.map((candidate) => [candidate.normalizedTerm, candidate] as const),
  );
  const filteredByKey = new Map(
    filteredCandidates.map((candidate) => [candidate.normalizedTerm, candidate] as const),
  );
  const excludedByKey = new Map(
    excludedCandidates.map((candidate) => [
      normalizeGlossaryTerm(candidate.term),
      candidate,
    ]),
  );

  return expectedTerms.map((expected) => {
    const normalizedExpected = normalizeGlossaryTerm(expected);
    const transcriptMatched = normalizedExpected
      ? normalizedTranscriptText.includes(normalizedExpected)
      : false;
    const rawCandidate = rawByKey.get(normalizedExpected);
    const filteredCandidate = filteredByKey.get(normalizedExpected);
    const excludedCandidate = excludedByKey.get(normalizedExpected);

    if (filteredCandidate) {
      return {
        expected,
        transcriptMatched,
        rawCandidateMatched: true,
        filteredCandidateMatched: true,
        status: "included",
        matchedCandidate: filteredCandidate.term,
      } satisfies ExpectedTermCheckResult;
    }

    if (excludedCandidate) {
      return {
        expected,
        transcriptMatched,
        rawCandidateMatched: true,
        filteredCandidateMatched: false,
        status: "excluded",
        matchedCandidate: excludedCandidate.term,
        matchedKeyword: excludedCandidate.matchedKeyword,
        duplicateOf: excludedCandidate.duplicateOf,
        reason: excludedCandidate.reason,
      } satisfies ExpectedTermCheckResult;
    }

    if (rawCandidate) {
      return {
        expected,
        transcriptMatched,
        rawCandidateMatched: true,
        filteredCandidateMatched: false,
        status: "found_in_transcript_but_not_candidate",
        matchedCandidate: rawCandidate.term,
        reason: "not_detected",
      } satisfies ExpectedTermCheckResult;
    }

    return {
      expected,
      transcriptMatched,
      rawCandidateMatched: false,
      filteredCandidateMatched: false,
      status: transcriptMatched
        ? "found_in_transcript_but_not_candidate"
        : "not_found_in_transcript",
      reason: "not_detected",
    } satisfies ExpectedTermCheckResult;
  });
}

export function diagnoseGlossaryCandidatesFromFullTranscript({
  blocks,
  existingKeywords = [],
  expectedTerms = [],
  documentContext,
}: {
  blocks: TranscriptBlock[];
  existingKeywords?: Keyword[];
  expectedTerms?: string[];
  documentContext?: GlossaryDocumentContext;
}): GlossaryCandidateDiagnostics {
  const {
    rawCandidates,
    filteredCandidates,
    excludedCandidates,
  } = buildGlossaryCandidatePipeline(blocks, existingKeywords, documentContext);

  return {
    whetherHardcodedWhitelistUsed: false,
    whetherExpectedTermCheckAffectsScoring: false,
    totalTranscriptBlocks: blocks.length,
    rawCandidateCount: rawCandidates.length,
    filteredCandidateCount: filteredCandidates.length,
    excludedCount: excludedCandidates.length,
    confidenceCounts: filteredCandidates.reduce(
      (acc, candidate) => {
        const confidence = candidate.confidence ?? "low";
        acc[confidence] += 1;
        return acc;
      },
      { high: 0, medium: 0, low: 0 },
    ),
    candidates: filteredCandidates.map((candidate) => ({
      ...candidate,
      score: glossaryCandidatePriority(candidate),
    })),
    excludedCandidates,
    expectedTermCheck: buildExpectedTermCheck({
      expectedTerms,
      transcriptBlocks: blocks,
      rawCandidates,
      filteredCandidates,
      excludedCandidates,
    }),
  };
}

function compactGlossaryCandidateContext(value: string) {
  return cleanText(value).replace(/\s+/g, " ").slice(
    0,
    MAX_GLOSSARY_BATCH_CANDIDATE_CONTEXT_CHARS,
  );
}

function assignGlossaryCandidateIds(candidates: GlossaryCandidate[]) {
  return candidates.map((candidate, index) => ({
    ...candidate,
    candidateId: `c${String(index + 1).padStart(3, "0")}`,
  }));
}

function toGlossaryToolCandidate(candidate: GlossaryCandidate): GlossaryToolCandidate {
  return {
    candidateId: candidate.candidateId || "",
    term: candidate.term,
    normalizedTerm: candidate.normalizedTerm,
    candidateSource: candidate.candidateSource || "unknown",
    categoryGuess: candidate.categoryGuess || "unknown",
    confidence: candidate.confidence || "unknown",
    shortEvidence: compactGlossaryCandidateContext(candidate.firstContext),
    matchedSignalsSummary:
      candidate.matchedSignals?.slice(0, 4).join(", ") ||
      candidate.scoreBreakdown?.matchedSignals?.slice(0, 4).join(", ") ||
      "none",
  };
}

function estimateGlossaryCandidateChars(candidate: GlossaryCandidate) {
  return [
    candidate.candidateId || "",
    candidate.term,
    candidate.aliases.join(","),
    candidate.categoryGuess || "",
    String(candidate.occurrenceCount),
    candidate.firstEvidenceBlockId,
    candidate.firstTimestamp || "",
    compactGlossaryCandidateContext(candidate.firstContext),
  ].join(" | ").length;
}

export function buildGlossaryCandidateBatches(
  candidates: GlossaryCandidate[],
  options?: {
    maxPromptChars?: number;
  },
): GlossaryCandidateBatch[] {
  const maxPromptChars = options?.maxPromptChars ?? MAX_GLOSSARY_BATCH_PROMPT_CHARS;
  const batches: GlossaryCandidateBatch[] = [];
  let currentCandidates: GlossaryCandidate[] = [];
  let currentChars = 0;

  const flush = () => {
    if (currentCandidates.length === 0) {
      return;
    }

    batches.push({
      index: batches.length + 1,
      candidateCount: currentCandidates.length,
      estimatedPromptChars: currentChars,
      candidates: currentCandidates,
    });
    currentCandidates = [];
    currentChars = 0;
  };

  for (const candidate of candidates) {
    const compactCandidate: GlossaryCandidate = {
      ...candidate,
      firstContext: compactGlossaryCandidateContext(candidate.firstContext),
    };
    const candidateChars = estimateGlossaryCandidateChars(compactCandidate);

    if (
      currentCandidates.length > 0 &&
      currentChars + candidateChars > maxPromptChars
    ) {
      flush();
    }

    currentCandidates.push(compactCandidate);
    currentChars += candidateChars;
  }

  flush();

  return batches;
}

function sampleTranscriptBlocks(blocks: TranscriptBlock[], maxChars: number) {
  if (blocks.length === 0) {
    return [] as TranscriptBlock[];
  }

  const targetCount = Math.min(
    MAX_BLOCKS,
    Math.max(MIN_BLOCKS, Math.min(blocks.length, 30)),
  );

  if (blocks.length <= targetCount) {
    const finalBlocks: TranscriptBlock[] = [];
    let totalChars = 0;

    for (const block of blocks) {
      const serialized = `${block.id} ${block.time} ${block.speaker} ${block.text}`;

      if (
        finalBlocks.length >= MIN_BLOCKS &&
        totalChars + serialized.length > maxChars
      ) {
        break;
      }

      finalBlocks.push(block);
      totalChars += serialized.length;
    }

    return finalBlocks;
  }

  const indices = new Set<number>();
  const segmentSize = Math.max(8, Math.floor(targetCount / 3));
  const middleStart = Math.max(
    0,
    Math.floor(blocks.length / 2) - Math.floor(segmentSize / 2),
  );

  const pushRange = (start: number, end: number) => {
    for (
      let index = start;
      index < end && indices.size < targetCount;
      index += 1
    ) {
      if (index >= 0 && index < blocks.length) {
        indices.add(index);
      }
    }
  };

  pushRange(0, segmentSize);
  pushRange(middleStart, middleStart + segmentSize);
  pushRange(Math.max(0, blocks.length - segmentSize), blocks.length);

  if (indices.size < targetCount) {
    const step = Math.max(1, Math.floor(blocks.length / targetCount));

    for (
      let index = 0;
      index < blocks.length && indices.size < targetCount;
      index += step
    ) {
      indices.add(index);
    }
  }

  const sampled = Array.from(indices)
    .sort((a, b) => a - b)
    .map((index) => blocks[index])
    .filter(Boolean);

  const finalBlocks: TranscriptBlock[] = [];
  let totalChars = 0;

  for (const block of sampled) {
    const serialized = `${block.id} ${block.time} ${block.speaker} ${block.text}`;

    if (
      finalBlocks.length >= MIN_BLOCKS &&
      totalChars + serialized.length > maxChars
    ) {
      break;
    }

    finalBlocks.push(block);
    totalChars += serialized.length;
  }

  return finalBlocks.slice(0, MAX_BLOCKS);
}

function transcriptPromptText(blocks: TranscriptBlock[]) {
  return blocks
    .map(
      (block) =>
        `${block.id} | ${block.time} | ${block.speaker || "未知说话人"} | ${block.text}`,
    )
    .join("\n");
}

function buildSummaryKeywordsSystemPrompt() {
  return [
    "你是 KnowBase 的轻量知识包摘要助手。",
    "你只能基于给定 transcriptBlocks 生成结果，不要虚构信息。",
    "你必须只输出严格 JSON，不要输出 markdown，不要输出 JSON 外的任何文字。",
    "evidenceBlockId 必须来自输入 block id。",
    "本轮只生成 generatedSummary 和 keywords，不要输出 sections，不要输出 glossaryTerms。",
  ].join(" ");
}

function buildSummaryKeywordsUserPrompt({
  title,
  platform,
  summary,
  transcript,
  keywordCandidates,
}: {
  title: string;
  platform: string;
  summary: string;
  transcript: string;
  keywordCandidates: KeywordCandidate[];
}) {
  return `
请基于以下单篇内容，输出轻量知识包 JSON。

标题：${title}
平台：${platform}
已有简介（仅作辅助参考，优先级低于 transcript）：${summary || "无"}

输出结构必须严格是：
{
  "generatedSummary": "150-250字中文摘要",
  "keywords": [
    {
      "term": "关键词",
      "explanation": "一句话解释",
      "context": "它在本内容中的语境",
      "evidenceBlockId": "t-001"
    }
  ]
}

要求：
1. generatedSummary 必须是 150-250 字中文摘要。
2. keywords 最多 5 个。
3. 不要输出 sections。
4. 不要输出 glossaryTerms。
5. 不要使用输入中不存在的 evidenceBlockId。
6. 不要输出 null，缺失字段直接省略。
7. 不要输出 Markdown。
8. keywords 不是泛主题词，而应优先选择出现频率较高、信息量具体的专有名词 / 核心概念 / 工具 / 方法 / 产品名 / 技术名词。
9. 优先从给定的 keywordCandidates 中选择关键词；只有在候选不足时，才允许从 transcript 中补充更合适的具体术语。
10. explanation 要解释“这个词在本内容里是什么意思”，不要写百科式定义。
11. 避免选择泛词、动词、口语词、无具体含义的短词。

KeywordCandidates:
${keywordCandidates.length > 0
    ? keywordCandidates
        .map(
          (candidate) =>
            `- ${candidate.term} | count=${candidate.count} | evidence=${candidate.firstEvidenceBlockId} | context=${candidate.sampleContext}`,
        )
        .join("\n")
    : "无"}

TranscriptBlocks:
${transcript}
`.trim();
}

function buildGlossaryTermsSystemPrompt() {
  return [
    "你是 KnowBase 的术语解释助手。",
    "只能基于给定标题、summary、keywords、sections、glossaryCandidates 选择术语，不要虚构。",
    "你必须调用 submit_glossary_terms tool 提交最终结果。",
    "不要在 content 中输出最终结果；content 可以为空。",
    "最终结果只能放在 submit_glossary_terms.function.arguments。",
    "candidateId 必须来自输入候选池。",
    "优先中高置信度候选，宁可少选，不要乱选。",
    `最多输出 ${GLOSSARY_LLM_OUTPUT_SAFETY.maxGlossaryTermsForLlmOutput} 个。`,
    `definition <= ${GLOSSARY_LLM_OUTPUT_SAFETY.maxDefinitionChars} 字符。`,
    `whyItMatters <= ${GLOSSARY_LLM_OUTPUT_SAFETY.maxWhyItMattersChars} 字符。`,
    `evidence <= ${GLOSSARY_LLM_OUTPUT_SAFETY.maxEvidenceChars} 字符。`,
    `aliases 最多 ${GLOSSARY_LLM_OUTPUT_SAFETY.maxAliasesPerTerm} 个。`,
  ].join(" ");
}

function buildSectionsContext(sections: Section[]) {
  if (sections.length === 0) {
    return "无";
  }

  return sections
    .slice(0, 10)
    .map((section) => {
      const range = [section.startTimestamp, section.endTimestamp]
        .filter(Boolean)
        .join(" - ");
      const summary = cleanText(section.summary) || section.title;

      return `- ${section.title}${range ? ` | ${range}` : ""} | ${summary}`;
    })
    .join("\n");
}

function buildGlossaryTermsUserPrompt({
  title,
  platform,
  generatedSummary,
  keywords,
  sections,
  glossaryCandidates,
}: {
  title: string;
  platform: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
  glossaryCandidates: GlossaryCandidate[];
}) {
  const existingKeywordTerms = keywords.map((keyword) => keyword.term).filter(Boolean);

  return `
请调用 submit_glossary_terms tool 提交 glossaryTerms。

标题：${title}
平台：${platform}
已有 generatedSummary：${generatedSummary}

已有 keywords：
${keywords.length > 0
    ? keywords
        .map(
          (keyword) =>
            `- ${keyword.term} | explanation=${keyword.explanation} | evidence=${keyword.evidenceBlockId}`,
        )
        .join("\n")
    : "无"}

已有 sections：
${buildSectionsContext(sections)}

GlossaryCandidates：
${glossaryCandidates.length > 0
    ? glossaryCandidates
        .map(
          (candidate) => {
            const toolCandidate = toGlossaryToolCandidate(candidate);
            return `- candidateId=${toolCandidate.candidateId} | term=${toolCandidate.term} | normalized=${toolCandidate.normalizedTerm} | candidateSource=${toolCandidate.candidateSource} | categoryGuess=${toolCandidate.categoryGuess} | confidence=${toolCandidate.confidence} | shortEvidence=${toolCandidate.shortEvidence} | matchedSignals=${toolCandidate.matchedSignalsSummary}`;
          },
        )
        .join("\n")
    : "无"}

submit_glossary_terms.arguments 结构必须是：
{
  "glossaryTerms": [
    {
      "candidateId": "c001",
      "term": "术语",
      "normalizedTerm": "string",
      "category": "technical_concept",
      "definition": "string",
      "whyItMatters": "string",
      "evidence": "string",
      "aliases": ["string"]
    }
  ]
}

要求：
1. 必须调用 submit_glossary_terms，不要把最终结果写在普通 content 中。
2. 只允许使用候选池里的 candidateId。
3. term 必须来自候选池，或能在标题 / summary / sections 原文中找到。
4. 避免与 existingKeywords 重复。
5. 优先公司名、产品名、模型名、方法论、行业术语；低置信度和噪音候选宁可不选。
6. category 只能是 technical_concept | product_name | company_name | model_name | framework | event | industry_term | other。
7. 如果没有合适术语，调用 tool 并传 {"glossaryTerms": []}。

existingKeywords：
${existingKeywordTerms.length > 0
    ? existingKeywordTerms.map((term) => `- ${term}`).join("\n")
    : "无"}
`.trim();
}

function buildGlossaryJsonRepairSystemPrompt() {
  return [
    "You repair malformed JSON.",
    "Return JSON only.",
    "Do not explain.",
    "Do not output markdown.",
    "Do not output code fences.",
    "Do not add any text before or after the JSON object.",
    "The top-level object must be {\"glossaryTerms\":[...]}",
    "Preserve existing items and field meanings.",
    "Do not add new terms.",
    "Do not remove terms unless the malformed text makes them impossible to recover.",
    "Do not rewrite definitions semantically; only fix JSON syntax and field formatting.",
    "Use empty strings or [] instead of null or undefined.",
  ].join(" ");
}

function buildGlossaryJsonRepairUserPrompt(malformed: string) {
  return `
Convert the following malformed JSON-like text into a valid JSON object with the exact schema {"glossaryTerms":[...]}.
Preserve all existing items and field meanings.
Do not add new terms.
Do not explain.
Return JSON only.

Malformed text:
${malformed}
`.trim();
}

function buildGlossaryToolSchema(): MiniMaxFunctionTool {
  return {
    type: "function",
    function: {
      name: "submit_glossary_terms",
      description:
        "Submit the final glossary terms for the current content. Use this instead of writing results in plain content.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          glossaryTerms: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                candidateId: { type: "string" },
                term: { type: "string" },
                normalizedTerm: { type: "string" },
                category: {
                  type: "string",
                  enum: [
                    "technical_concept",
                    "product_name",
                    "company_name",
                    "model_name",
                    "framework",
                    "event",
                    "industry_term",
                    "other",
                  ],
                },
                definition: { type: "string" },
                whyItMatters: { type: "string" },
                evidence: { type: "string" },
                aliases: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: [
                "candidateId",
                "term",
                "normalizedTerm",
                "category",
                "definition",
                "whyItMatters",
                "evidence",
                "aliases",
              ],
            },
          },
        },
        required: ["glossaryTerms"],
      },
    },
  };
}

function buildGlossaryToolChoice(): MiniMaxToolChoice {
  return {
    type: "function",
    function: {
      name: "submit_glossary_terms",
    },
  };
}

function findGlossaryToolCall(toolCalls: MiniMaxToolCall[]) {
  return toolCalls.find(
    (toolCall) => cleanText(toolCall.function?.name) === "submit_glossary_terms",
  );
}

function normalizeKeywords(
  value: unknown,
  blocksById: Map<string, TranscriptBlock>,
) {
  if (!Array.isArray(value)) {
    return [] as Keyword[];
  }

  return value
    .map((keyword) => {
      if (!isRecord(keyword)) {
        return null;
      }

      const evidenceBlockId = cleanText(keyword.evidenceBlockId);

      if (!blocksById.has(evidenceBlockId)) {
        return null;
      }

      const term = cleanText(keyword.term);
      const explanation = cleanText(keyword.explanation);
      const context = cleanText(keyword.context);

      if (!term || !explanation || !context) {
        return null;
      }

      return {
        term,
        explanation,
        context,
        evidenceBlockId,
      };
    })
    .filter((keyword): keyword is Keyword => Boolean(keyword))
    .slice(0, 5);
}

function mapGlossaryLlmCategory(
  category: string,
  fallback?: GlossaryTerm["category"],
): GlossaryTerm["category"] {
  switch (category) {
    case "technical_concept":
    case "industry_term":
      return "concept";
    case "product_name":
    case "model_name":
      return "product";
    case "company_name":
      return "organization";
    case "framework":
      return "method";
    case "event":
      return "organization";
    case "other":
      return fallback ?? "concept";
    default:
      return fallback ?? "concept";
  }
}

function buildGlossaryDocumentText({
  title,
  generatedSummary,
  sections,
}: {
  title: string;
  generatedSummary: string;
  sections: Section[];
}) {
  return [
    title,
    generatedSummary,
    ...sections.flatMap((section) => [section.title, section.summary]),
  ]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join("\n");
}

function validateGlossaryLlmPayload(
  value: unknown,
  {
    candidates,
    documentText,
  }: {
    candidates: GlossaryCandidate[];
    documentText: string;
  },
) {
  const diagnostics: GlossaryValidationDiagnostics = {
    parsedOk: true,
    validationOk: true,
    rawItemCount: 0,
    validItemCount: 0,
    normalizedGlossaryTermsCount: 0,
    selectedGlossaryCount: 0,
    droppedInvalidItemCount: 0,
    droppedByInvalidCandidateIdCount: 0,
    droppedByValidationCount: 0,
    droppedInvalidReasons: [],
    droppedReasons: [],
    glossaryTermsKeyPresent: false,
    glossaryTermsIsArray: false,
    firstRawItemsPreview: [],
    firstValidItemsPreview: [],
  };

  if (!isRecord(value)) {
    diagnostics.parsedOk = false;
    diagnostics.validationOk = false;
    diagnostics.droppedInvalidReasons.push("result_not_object");
    return {
      glossaryTerms: [] as GlossaryLlmTerm[],
      diagnostics,
    };
  }

  diagnostics.glossaryTermsKeyPresent = "glossaryTerms" in value;
  diagnostics.glossaryTermsIsArray = Array.isArray(value.glossaryTerms);
  const items = Array.isArray(value.glossaryTerms) ? value.glossaryTerms : [];
  diagnostics.rawItemCount = items.length;
  diagnostics.firstRawItemsPreview = previewUnknownItems(items);
  const candidateById = new Map(
    candidates
      .filter((candidate) => Boolean(candidate.candidateId))
      .map((candidate) => [candidate.candidateId!, candidate] as const),
  );
  const normalizedDocumentText = normalizeDedupKey(documentText);

  const validItems: GlossaryLlmTerm[] = [];

  for (const item of items) {
    if (!isRecord(item)) {
      diagnostics.droppedInvalidItemCount += 1;
      diagnostics.droppedByValidationCount += 1;
      diagnostics.droppedInvalidReasons.push("item_not_object");
      diagnostics.droppedReasons.push("item_not_object");
      continue;
    }

    const candidateId = cleanText(item.candidateId);
    const term = cleanText(item.term);
    const normalizedTerm =
      cleanText(item.normalizedTerm) || normalizeGlossaryTerm(term);
    const category = cleanText(item.category) as GlossaryLlmCategory;
    const definition = cleanText(item.definition);
    const whyItMatters = cleanText(item.whyItMatters);
    const evidence = cleanText(item.evidence)
      .replace(/\s+/g, " ")
      .slice(0, GLOSSARY_LLM_OUTPUT_SAFETY.maxEvidenceChars);
    const aliases = Array.isArray(item.aliases)
      ? item.aliases
          .map((alias) => cleanText(alias))
          .filter(Boolean)
          .slice(0, GLOSSARY_LLM_OUTPUT_SAFETY.maxAliasesPerTerm)
      : [];
    const matchedCandidate = candidateById.get(candidateId);

    if (!candidateId || !matchedCandidate) {
      diagnostics.droppedInvalidItemCount += 1;
      diagnostics.droppedByInvalidCandidateIdCount += 1;
      diagnostics.droppedInvalidReasons.push(`invalid_candidate_id:${candidateId || "empty"}`);
      diagnostics.droppedReasons.push(`invalid_candidate_id:${candidateId || "empty"}`);
      continue;
    }

    if (!term) {
      diagnostics.droppedInvalidItemCount += 1;
      diagnostics.droppedByValidationCount += 1;
      diagnostics.droppedInvalidReasons.push(`empty_term:${candidateId}`);
      diagnostics.droppedReasons.push(`empty_term:${candidateId}`);
      continue;
    }

    if (!definition) {
      diagnostics.droppedInvalidItemCount += 1;
      diagnostics.droppedByValidationCount += 1;
      diagnostics.droppedInvalidReasons.push(`missing_definition:${candidateId}`);
      diagnostics.droppedReasons.push(`missing_definition:${candidateId}`);
      continue;
    }

    const normalizedCandidateTerm = normalizeGlossaryTerm(matchedCandidate.term);
    const normalizedResolvedTerm = normalizeGlossaryTerm(term);
    const termExistsInDocument =
      normalizedResolvedTerm &&
      normalizedDocumentText.includes(normalizedResolvedTerm);

    if (
      normalizedResolvedTerm !== normalizedCandidateTerm &&
      !termExistsInDocument
    ) {
      diagnostics.droppedInvalidItemCount += 1;
      diagnostics.droppedByValidationCount += 1;
      diagnostics.droppedInvalidReasons.push(`term_out_of_scope:${candidateId}`);
      diagnostics.droppedReasons.push(`term_out_of_scope:${candidateId}`);
      continue;
    }

    validItems.push({
      candidateId,
      term,
      normalizedTerm: normalizedTerm || normalizedResolvedTerm,
      category: (
        [
          "technical_concept",
          "product_name",
          "company_name",
          "model_name",
          "framework",
          "event",
          "industry_term",
          "other",
        ] as const
      ).includes(category)
        ? category
        : "other",
      definition: definition.slice(0, GLOSSARY_LLM_OUTPUT_SAFETY.maxDefinitionChars),
      whyItMatters: whyItMatters.slice(0, GLOSSARY_LLM_OUTPUT_SAFETY.maxWhyItMattersChars),
      evidence,
      aliases,
    });
  }

  diagnostics.validItemCount = validItems.length;
  diagnostics.selectedGlossaryCount = validItems.length;
  diagnostics.validationOk = diagnostics.droppedInvalidItemCount === 0;
  diagnostics.firstValidItemsPreview = validItems.slice(0, 5);

  return {
    glossaryTerms: validItems,
    diagnostics,
  };
}

function normalizeGlossaryTerms(
  value: GlossaryLlmTerm[],
  blocksById: Map<string, TranscriptBlock>,
  candidates: GlossaryCandidate[],
  existingKeywords: Keyword[] = [],
) {
  const seenTerms = new Set<string>();
  const existingKeywordKeys = new Set(
    existingKeywords.map((keyword) => normalizeDedupKey(keyword.term)).filter(Boolean),
  );
  const candidateByKey = new Map(
    candidates.map((candidate) => [candidate.normalizedTerm, candidate] as const),
  );
  const selectedTerms: SelectedGlossaryTerm[] = [];
  const transcriptTexts = Array.from(blocksById.values()).map((block) => block.text);

  const buildFallbackContextExample = (candidate: GlossaryCandidate) => {
    const contextPrefix = candidate.firstTimestamp
      ? `${candidate.firstTimestamp} 处提到 ${candidate.term}`
      : `节目中提到 ${candidate.term}`;

    return `${contextPrefix}，用于说明相关背景、观点或产品语境。`;
  };

  const sanitizeContextExample = (
    contextExample: string,
    candidate: GlossaryCandidate,
  ) => {
    const normalizedContext = cleanText(contextExample).replace(/\s+/g, " ");
    const fallback = buildFallbackContextExample(candidate);

    if (!normalizedContext) {
      return fallback.slice(0, MAX_GLOSSARY_CONTEXT_EXAMPLE_CHARS);
    }

    const contextKey = normalizeDedupKey(normalizedContext);
    const copiedFromTranscript =
      contextKey.length >= 20 &&
      transcriptTexts.some((text) =>
        normalizeDedupKey(text).includes(contextKey),
      );

    if (copiedFromTranscript) {
      return fallback.slice(0, MAX_GLOSSARY_CONTEXT_EXAMPLE_CHARS);
    }

    return normalizedContext.slice(0, MAX_GLOSSARY_CONTEXT_EXAMPLE_CHARS);
  };

  for (const [index, term] of value.entries()) {
    const normalizedTerm = cleanText(term.term);
    const normalizedKey = normalizeGlossaryTerm(normalizedTerm);
    const candidate = candidateByKey.get(normalizedKey);

    if (!normalizedTerm || !normalizedKey || seenTerms.has(normalizedKey)) {
      continue;
    }

    if (!candidate || !hasGlossaryExplanationValue(candidate.term)) {
      continue;
    }

    if (existingKeywordKeys.has(normalizedKey)) {
      continue;
    }

    const resolvedEvidenceBlockIds = Array.from(
      new Set([
        candidate.firstEvidenceBlockId,
        ...candidate.allEvidenceBlockIds,
      ]),
    ).filter((blockId) => blockId && blocksById.has(blockId));

    if (resolvedEvidenceBlockIds.length === 0) {
      continue;
    }

    const definition = cleanText(term.definition);
    const contextExample = sanitizeContextExample(
      cleanText(term.evidence),
      candidate,
    );

    if (!definition || !contextExample) {
      continue;
    }

    const normalizedDefinitionKey = normalizeDedupKey(definition);

    if (
      normalizedDefinitionKey &&
      transcriptTexts.some((text) =>
        normalizeDedupKey(text).includes(normalizedDefinitionKey),
      )
    ) {
      continue;
    }

    const aliases = Array.isArray(term.aliases)
      ? Array.from(
          new Set(
            term.aliases
              .map((alias) => cleanText(alias))
              .filter(
                (alias) =>
                  alias &&
                  alias.toLowerCase() !== normalizedKey &&
                  alias.length >= 2,
              ),
          ),
        )
      : [];
    const category = mapGlossaryLlmCategory(term.category, candidate.categoryGuess);
    const selectedGlossaryTerm: SelectedGlossaryTerm = {
      candidateId: term.candidateId,
      term: candidate.term,
      normalizedTerm: candidate.normalizedTerm,
      category: term.category,
      definition,
      whyItMatters: cleanText(term.whyItMatters).slice(
        0,
        GLOSSARY_LLM_OUTPUT_SAFETY.maxWhyItMattersChars,
      ),
      evidence: contextExample,
      aliases: [],
      localCategory: category,
      occurrenceCount: candidate.occurrenceCount,
      evidenceBlockIds: resolvedEvidenceBlockIds.slice(0, 5),
      firstEvidenceBlockId: candidate.firstEvidenceBlockId,
      firstTimestamp: candidate.firstTimestamp,
    };

    const mergedAliases = Array.from(
      new Set([...candidate.aliases, ...aliases]),
    ).filter((alias) => {
      const aliasKey = normalizeGlossaryTerm(alias);

      return (
        aliasKey &&
        aliasKey !== normalizedKey &&
        !isGenericStandaloneEnglishTerm(alias)
      );
    });

    if (mergedAliases.length > 0) {
      selectedGlossaryTerm.aliases = mergedAliases;
    }

    seenTerms.add(normalizedKey);
    selectedTerms.push(selectedGlossaryTerm);
  }

  return selectedTerms;
}

function toLocalGlossaryTerms(value: SelectedGlossaryTerm[]) {
  return value.map((term, index) => ({
    id: `g-${String(index + 1).padStart(3, "0")}`,
    term: term.term,
    definition: term.definition,
    contextExample: term.evidence,
    occurrenceCount: term.occurrenceCount,
    evidenceBlockIds: term.evidenceBlockIds,
    firstEvidenceBlockId: term.firstEvidenceBlockId,
    firstTimestamp: term.firstTimestamp,
    aliases: term.aliases,
    category: term.localCategory,
  }));
}

function validateGeneratedSummaryKeywords(result: SummaryKeywordsResult) {
  if (!result.generatedSummary) {
    throw new Error("LLM 结果缺少 generatedSummary。");
  }

  if (result.keywords.length === 0) {
    throw new Error("LLM 结果缺少可用 keywords。");
  }
}

function validateGeneratedGlossaryTerms(result: GlossaryTermsResult) {
  if (result.glossaryTerms.length === 0) {
    throw new Error("LLM 结果缺少可用 glossaryTerms。");
  }
}

function classifyGlossaryFailure({
  rawResponseDiagnostics,
  validationDiagnostics,
}: {
  rawResponseDiagnostics: RawGlossaryResponseDiagnostics;
  validationDiagnostics: GlossaryValidationDiagnostics;
}) {
  if (rawResponseDiagnostics.rawResponseLength === 0) {
    return {
      errorType: "minimax_empty_response" as const,
      message: "MiniMax 返回为空，未生成任何 glossary 内容。",
    };
  }

  if (!validationDiagnostics.parsedOk) {
    return {
      errorType: "response_parse_failed" as const,
      message: "MiniMax 返回内容无法解析为有效 JSON。",
    };
  }

  if (!validationDiagnostics.glossaryTermsKeyPresent) {
    return rawResponseDiagnostics.alternativeFieldNamesDetected.length > 0
      ? {
          errorType: "minimax_schema_mismatch" as const,
          message: "MiniMax 返回了近似字段，但缺少顶层 glossaryTerms。",
        }
      : {
          errorType: "missing_glossary_terms_key" as const,
          message: "MiniMax 返回对象缺少 glossaryTerms 字段。",
        };
  }

  if (!validationDiagnostics.glossaryTermsIsArray) {
    return {
      errorType: "glossary_terms_not_array" as const,
      message: "MiniMax 返回的 glossaryTerms 不是数组。",
    };
  }

  if (validationDiagnostics.rawItemCount === 0) {
    return {
      errorType: "glossary_terms_empty" as const,
      message: "MiniMax 返回的 glossaryTerms 数组为空。",
    };
  }

  if (validationDiagnostics.validItemCount === 0) {
    if (
      validationDiagnostics.droppedByInvalidCandidateIdCount > 0 &&
      validationDiagnostics.droppedByValidationCount === 0
    ) {
      return {
        errorType: "all_glossary_terms_dropped_by_validation" as const,
        message: "Tool arguments 中的 glossaryTerms 全部因 candidateId 无效被丢弃。",
      };
    }

    return {
      errorType: "all_glossary_terms_dropped_by_validation" as const,
      message: "MiniMax 返回了 glossaryTerms，但所有项都在校验阶段被丢弃。",
    };
  }

  if (validationDiagnostics.normalizedGlossaryTermsCount === 0) {
    return {
      errorType: "all_glossary_terms_dropped_by_validation" as const,
      message: "MiniMax 返回了 glossaryTerms，但所有项都在本地过滤后失去可用性。",
    };
  }

  return {
    errorType: "minimax_schema_mismatch" as const,
    message: "MiniMax 返回的 glossaryTerms 结构与预期不一致。",
  };
}

function isTokenTooLongError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    message.includes("token") &&
    (message.includes("too long") ||
      message.includes("context") ||
      message.includes("length") ||
      message.includes("maximum"))
  );
}

async function runSummaryKeywordsGeneration({
  title,
  platform,
  summary,
  sampledBlocks,
}: {
  title: string;
  platform: string;
  summary: string;
  sampledBlocks: TranscriptBlock[];
}) {
  const transcript = transcriptPromptText(sampledBlocks);
  const keywordCandidates = extractKeywordCandidatesFromTranscript(sampledBlocks);
  const completion = await createMiniMaxChatCompletion({
    messages: [
      {
        role: "system",
        content: buildSummaryKeywordsSystemPrompt(),
      },
      {
        role: "user",
        content: buildSummaryKeywordsUserPrompt({
          title,
          platform,
          summary,
          transcript,
          keywordCandidates,
        }),
      },
    ],
    maxTokens: 1200,
  });
  const parsed = JSON.parse(
    extractJsonObject(completion.content),
  ) as Partial<SummaryKeywordsResult>;
  const blocksById = new Map(sampledBlocks.map((block) => [block.id, block]));
  const result = {
    generatedSummary: cleanText(parsed.generatedSummary),
    keywords: normalizeKeywords(parsed.keywords, blocksById),
  };

  validateGeneratedSummaryKeywords(result);

  return {
    ...result,
    normalizedKeywords: result.keywords,
    model: completion.model || getMiniMaxModel(),
    sampledBlockIds: sampledBlocks.map((block) => block.id),
    sampledBlocksCount: sampledBlocks.length,
    sampledTranscriptChars: transcript.length,
  };
}

async function runGlossaryTermsGeneration({
  title,
  platform,
  generatedSummary,
  keywords,
  sections,
  transcriptBlocks,
  glossaryCandidates,
  allowRepair = false,
}: {
  title: string;
  platform: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
  transcriptBlocks: TranscriptBlock[];
  glossaryCandidates: GlossaryCandidate[];
  allowRepair?: boolean;
}) {
  const repairJson = allowRepair
    ? async (malformed: string) => {
        const repairCompletion = await createMiniMaxChatCompletion({
          messages: [
            {
              role: "system",
              content: buildGlossaryJsonRepairSystemPrompt(),
            },
            {
              role: "user",
              content: buildGlossaryJsonRepairUserPrompt(malformed.slice(0, 12000)),
            },
          ],
          temperature: 0,
          maxTokens: 2200,
          timeoutMs: GLOSSARY_TERMS_REPAIR_TIMEOUT_MS,
        });

        return repairCompletion.content;
      }
    : undefined;

  const toolSchema = buildGlossaryToolSchema();
  const toolChoice = buildGlossaryToolChoice();

  const completion = await createMiniMaxChatCompletion({
    messages: [
      {
        role: "system",
        content: buildGlossaryTermsSystemPrompt(),
      },
      {
        role: "user",
        content: buildGlossaryTermsUserPrompt({
          title,
          platform,
          generatedSummary,
          keywords,
          sections,
          glossaryCandidates,
        }),
      },
    ],
    temperature: 0,
    tools: [toolSchema],
    toolChoice,
    requestJsonResponse: false,
    maxTokens: 1800,
    timeoutMs: GLOSSARY_TERMS_PRIMARY_TIMEOUT_MS,
  });
  const selectedToolCall = findGlossaryToolCall(completion.toolCalls);
  const toolArguments = cleanText(selectedToolCall?.function?.arguments);
  const fallbackToContentParser = !selectedToolCall;
  const parseSource = toolArguments || completion.content;
  const rawResponseDiagnostics = inspectRawGlossaryResponse({
    raw: parseSource,
    finishReason: completion.finishReason,
    reasoningContent: completion.reasoningContent,
    reasoningDetails: completion.reasoningDetails,
    toolCalls: completion.toolCalls,
    selectedToolCall,
    fallbackToContentParser,
    requestDiagnostics: completion.requestDiagnostics,
  });

  if (rawResponseDiagnostics.rawResponseLength === 0) {
    throw new GlossaryGenerationError({
      errorType: "minimax_empty_response",
      message: "MiniMax 返回为空，未生成任何 glossary 内容。",
      rawResponseDiagnostics,
      repaired: false,
    });
  }

  let parsed: unknown;
  let parseDiagnostics: LlmJsonParseDiagnostics;

  try {
    const parseResult = await safeParseLlmJson({
      raw: parseSource,
      allowRepair,
      repairJson,
    });
    parsed = parseResult.parsed;
    parseDiagnostics = parseResult.diagnostics;
  } catch (error) {
    if (error instanceof LlmJsonParseError) {
      throw new GlossaryGenerationError({
        errorType: error.diagnostics.likelyTruncated
          ? "llm_output_truncated"
          : "response_parse_failed",
        message: error.message,
        rawResponseDiagnostics,
        parseDiagnostics: error.diagnostics,
        repaired: error.diagnostics.repaired === true,
      });
    }

    throw error;
  }

  const validated = validateGlossaryLlmPayload(parsed, {
    candidates: glossaryCandidates,
    documentText: buildGlossaryDocumentText({
      title,
      generatedSummary,
      sections,
    }),
  });
  const blocksById = new Map(transcriptBlocks.map((block) => [block.id, block]));
  const selectedGlossaryTerms = normalizeGlossaryTerms(
    validated.glossaryTerms,
    blocksById,
    glossaryCandidates,
    keywords,
  );
  const normalizedGlossaryTerms = toLocalGlossaryTerms(selectedGlossaryTerms);
  const result = {
    glossaryTerms: selectedGlossaryTerms,
  };
  validated.diagnostics.normalizedGlossaryTermsCount = normalizedGlossaryTerms.length;
  validated.diagnostics.selectedGlossaryCount = selectedGlossaryTerms.length;

  if (result.glossaryTerms.length === 0) {
    const failure = classifyGlossaryFailure({
      rawResponseDiagnostics,
      validationDiagnostics: validated.diagnostics,
    });

    throw new GlossaryGenerationError({
      errorType: failure.errorType,
      message: failure.message,
      rawResponseDiagnostics,
      parseDiagnostics,
      validationDiagnostics: validated.diagnostics,
      repaired: parseDiagnostics.repaired === true,
    });
  }

  validateGeneratedGlossaryTerms(result);

  const glossaryPromptChars = glossaryCandidates
    .map(
      (candidate) =>
        `${candidate.term} ${candidate.firstContext} ${candidate.firstEvidenceBlockId}`,
    )
    .join("\n").length;

  return {
    ...result,
    normalizedGlossaryTerms,
    llmGlossaryTerms: validated.glossaryTerms,
    rawResponseDiagnostics,
    parseDiagnostics,
    validationDiagnostics: validated.diagnostics,
    repaired: parseDiagnostics.repaired === true,
    model: completion.model || getMiniMaxModel(),
    sampledBlockIds: glossaryCandidates.map((candidate) => candidate.firstEvidenceBlockId),
    sampledBlocksCount: glossaryCandidates.length,
    sampledTranscriptChars: glossaryPromptChars,
  };
}

export async function generateSummaryKeywordsFromTranscript({
  title,
  platform,
  summary,
  transcriptBlocks,
}: {
  title: string;
  platform: string;
  summary: string;
  transcriptBlocks: TranscriptBlock[];
}): Promise<GeneratedSummaryKeywords> {
  if (transcriptBlocks.length === 0) {
    throw new Error("transcriptBlocks 为空，无法生成摘要与关键词。");
  }

  const firstSample = sampleTranscriptBlocks(
    transcriptBlocks,
    MAX_SUMMARY_TRANSCRIPT_CHARS,
  );

  try {
    return await runSummaryKeywordsGeneration({
      title,
      platform,
      summary,
      sampledBlocks: firstSample,
    });
  } catch (error) {
    if (!isTokenTooLongError(error)) {
      throw error;
    }

    const secondSample = sampleTranscriptBlocks(
      transcriptBlocks,
      RETRY_SUMMARY_TRANSCRIPT_CHARS,
    );

    return runSummaryKeywordsGeneration({
      title,
      platform,
      summary,
      sampledBlocks: secondSample,
    });
  }
}

export async function generateGlossaryTermsFromContent({
  title,
  platform,
  generatedSummary,
  keywords,
  sections,
  transcriptBlocks,
  allowRepair = false,
}: {
  title: string;
  platform: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
  transcriptBlocks: TranscriptBlock[];
  allowRepair?: boolean;
}): Promise<GeneratedGlossaryTerms> {
  if (transcriptBlocks.length === 0) {
    throw new Error("transcriptBlocks 为空，无法生成 glossaryTerms。");
  }

  if (!generatedSummary.trim()) {
    throw new Error("generatedSummary 为空，无法生成 glossaryTerms。");
  }

  if (keywords.length === 0) {
    throw new Error("keywords 为空，无法生成 glossaryTerms。");
  }

  const glossaryCandidates = assignGlossaryCandidateIds(
    extractGlossaryCandidatesFromFullTranscript(transcriptBlocks, keywords),
  );

  if (glossaryCandidates.length === 0) {
    throw new Error("全文中未提取到可解释的 glossary candidates。");
  }

  const batches = buildGlossaryCandidateBatches(glossaryCandidates);
  const aggregatedLlmGlossaryTerms: GlossaryLlmTerm[] = [];
  const aggregatedSelectedGlossaryTerms: SelectedGlossaryTerm[] = [];
  const aggregatedNormalizedGlossaryTerms: LocalGlossaryTerm[] = [];
  const sampledBlockIds = new Set<string>();
  let sampledBlocksCount = 0;
  let sampledTranscriptChars = 0;
  let model = getMiniMaxModel();
  let rawResponseDiagnostics: RawGlossaryResponseDiagnostics = {
    rawResponsePreview: "",
    rawResponseLength: 0,
    finishReason: "",
    containsThinkTag: false,
    containsGlossaryTermsKey: false,
    alternativeFieldNamesDetected: [],
    requestFormat: "openai_compatible_chat_completions",
    reasoningSplitRequested: true,
    reasoningContentSeparated: false,
    reasoningContentPreview: "",
    reasoningDetailsPresent: false,
    responseFormatRequested: true,
    responseFormatActuallyReliableForModel: false,
    toolCallingSupportedForModel: true,
    toolChoiceRequested: true,
    requestedToolName: "submit_glossary_terms",
    toolCallsPresent: false,
    toolCallCount: 0,
    toolCallNames: [],
    usedToolCall: false,
    fallbackToContentParser: false,
    selectedToolName: "",
    argumentsLength: 0,
    argumentsPreview: "",
  };
  let parseDiagnostics: LlmJsonParseDiagnostics = {
    directParseFailed: false,
    reasoningTagStripped: false,
    codeFenceCleanupAttempted: false,
    codeFenceParseFailed: false,
    balancedObjectExtractionAttempted: false,
    balancedObjectExtractionSucceeded: false,
    objectExtractionAttempted: false,
    objectExtractionParseFailed: false,
    rawResponseExcerpt: "",
    rawResponsePreview: "",
  };
  const validationDiagnostics: GlossaryValidationDiagnostics = {
    parsedOk: true,
    validationOk: true,
    rawItemCount: 0,
    validItemCount: 0,
    normalizedGlossaryTermsCount: 0,
    selectedGlossaryCount: 0,
    droppedInvalidItemCount: 0,
    droppedByInvalidCandidateIdCount: 0,
    droppedByValidationCount: 0,
    droppedInvalidReasons: [],
    droppedReasons: [],
    glossaryTermsKeyPresent: true,
    glossaryTermsIsArray: true,
    firstRawItemsPreview: [],
    firstValidItemsPreview: [],
  };

  try {
    for (const batch of batches) {
      const generated = await runGlossaryTermsGeneration({
        title,
        platform,
        generatedSummary,
        keywords,
        sections,
        transcriptBlocks,
        glossaryCandidates: batch.candidates,
        allowRepair,
      });

      model = generated.model;
      rawResponseDiagnostics = generated.rawResponseDiagnostics;
      parseDiagnostics = generated.parseDiagnostics;
      generated.llmGlossaryTerms.forEach((term) =>
        aggregatedLlmGlossaryTerms.push(term),
      );
      generated.glossaryTerms.forEach((term) =>
        aggregatedSelectedGlossaryTerms.push(term),
      );
      generated.normalizedGlossaryTerms.forEach((term) =>
        aggregatedNormalizedGlossaryTerms.push(term),
      );
      validationDiagnostics.rawItemCount += generated.validationDiagnostics.rawItemCount;
      validationDiagnostics.validItemCount += generated.validationDiagnostics.validItemCount;
      validationDiagnostics.normalizedGlossaryTermsCount +=
        generated.validationDiagnostics.normalizedGlossaryTermsCount;
      validationDiagnostics.selectedGlossaryCount +=
        generated.validationDiagnostics.selectedGlossaryCount;
      validationDiagnostics.droppedInvalidItemCount +=
        generated.validationDiagnostics.droppedInvalidItemCount;
      validationDiagnostics.droppedByInvalidCandidateIdCount +=
        generated.validationDiagnostics.droppedByInvalidCandidateIdCount;
      validationDiagnostics.droppedByValidationCount +=
        generated.validationDiagnostics.droppedByValidationCount;
      validationDiagnostics.droppedInvalidReasons.push(
        ...generated.validationDiagnostics.droppedInvalidReasons,
      );
      validationDiagnostics.droppedReasons.push(
        ...generated.validationDiagnostics.droppedReasons,
      );
      if (validationDiagnostics.firstRawItemsPreview.length === 0) {
        validationDiagnostics.firstRawItemsPreview =
          generated.validationDiagnostics.firstRawItemsPreview;
      }
      if (validationDiagnostics.firstValidItemsPreview.length === 0) {
        validationDiagnostics.firstValidItemsPreview =
          generated.validationDiagnostics.firstValidItemsPreview;
      }
      generated.sampledBlockIds.forEach((blockId) => sampledBlockIds.add(blockId));
      sampledBlocksCount += generated.sampledBlocksCount;
      sampledTranscriptChars += generated.sampledTranscriptChars;
    }
  } catch (error) {
    if (!isTokenTooLongError(error)) {
      throw error;
    }

    const retryBatches = buildGlossaryCandidateBatches(glossaryCandidates, {
      maxPromptChars: Math.max(1200, Math.floor(MAX_GLOSSARY_BATCH_PROMPT_CHARS / 2)),
    });

    aggregatedLlmGlossaryTerms.length = 0;
    aggregatedSelectedGlossaryTerms.length = 0;
    aggregatedNormalizedGlossaryTerms.length = 0;
    sampledBlockIds.clear();
    sampledBlocksCount = 0;
    sampledTranscriptChars = 0;
    validationDiagnostics.rawItemCount = 0;
    validationDiagnostics.validItemCount = 0;
    validationDiagnostics.normalizedGlossaryTermsCount = 0;
    validationDiagnostics.selectedGlossaryCount = 0;
    validationDiagnostics.droppedInvalidItemCount = 0;
    validationDiagnostics.droppedByInvalidCandidateIdCount = 0;
    validationDiagnostics.droppedByValidationCount = 0;
    validationDiagnostics.droppedInvalidReasons = [];
    validationDiagnostics.droppedReasons = [];
    validationDiagnostics.firstRawItemsPreview = [];
    validationDiagnostics.firstValidItemsPreview = [];

    for (const batch of retryBatches) {
      const generated = await runGlossaryTermsGeneration({
        title,
        platform,
        generatedSummary,
        keywords,
        sections,
        transcriptBlocks,
        glossaryCandidates: batch.candidates,
        allowRepair,
      });

      model = generated.model;
      rawResponseDiagnostics = generated.rawResponseDiagnostics;
      parseDiagnostics = generated.parseDiagnostics;
      generated.llmGlossaryTerms.forEach((term) =>
        aggregatedLlmGlossaryTerms.push(term),
      );
      generated.glossaryTerms.forEach((term) =>
        aggregatedSelectedGlossaryTerms.push(term),
      );
      generated.normalizedGlossaryTerms.forEach((term) =>
        aggregatedNormalizedGlossaryTerms.push(term),
      );
      validationDiagnostics.rawItemCount += generated.validationDiagnostics.rawItemCount;
      validationDiagnostics.validItemCount += generated.validationDiagnostics.validItemCount;
      validationDiagnostics.normalizedGlossaryTermsCount +=
        generated.validationDiagnostics.normalizedGlossaryTermsCount;
      validationDiagnostics.selectedGlossaryCount +=
        generated.validationDiagnostics.selectedGlossaryCount;
      validationDiagnostics.droppedInvalidItemCount +=
        generated.validationDiagnostics.droppedInvalidItemCount;
      validationDiagnostics.droppedByInvalidCandidateIdCount +=
        generated.validationDiagnostics.droppedByInvalidCandidateIdCount;
      validationDiagnostics.droppedByValidationCount +=
        generated.validationDiagnostics.droppedByValidationCount;
      validationDiagnostics.droppedInvalidReasons.push(
        ...generated.validationDiagnostics.droppedInvalidReasons,
      );
      validationDiagnostics.droppedReasons.push(
        ...generated.validationDiagnostics.droppedReasons,
      );
      if (validationDiagnostics.firstRawItemsPreview.length === 0) {
        validationDiagnostics.firstRawItemsPreview =
          generated.validationDiagnostics.firstRawItemsPreview;
      }
      if (validationDiagnostics.firstValidItemsPreview.length === 0) {
        validationDiagnostics.firstValidItemsPreview =
          generated.validationDiagnostics.firstValidItemsPreview;
      }
      generated.sampledBlockIds.forEach((blockId) => sampledBlockIds.add(blockId));
      sampledBlocksCount += generated.sampledBlocksCount;
      sampledTranscriptChars += generated.sampledTranscriptChars;
    }
  }

  validationDiagnostics.validationOk =
    validationDiagnostics.droppedInvalidItemCount === 0;
  if (validationDiagnostics.firstRawItemsPreview.length === 0) {
    validationDiagnostics.firstRawItemsPreview = aggregatedLlmGlossaryTerms.slice(0, 5);
  }
  if (validationDiagnostics.firstValidItemsPreview.length === 0) {
    validationDiagnostics.firstValidItemsPreview = aggregatedLlmGlossaryTerms.slice(0, 5);
  }

  const result = {
    glossaryTerms: aggregatedSelectedGlossaryTerms,
  };

  validateGeneratedGlossaryTerms(result);

  return {
    ...result,
    normalizedGlossaryTerms: aggregatedNormalizedGlossaryTerms,
    llmGlossaryTerms: aggregatedLlmGlossaryTerms,
    rawResponseDiagnostics,
    parseDiagnostics,
    validationDiagnostics,
    repaired: false,
    model,
    sampledBlockIds: Array.from(sampledBlockIds),
    sampledBlocksCount,
    sampledTranscriptChars,
  };
}
