import "server-only";

import type { Keyword, TranscriptBlock } from "@/lib/mock-data";
import { createMiniMaxChatCompletion, getMiniMaxModel } from "./minimax-client";

export type KnowledgePackGenerationStage = "summary_keywords";

type SummaryKeywordsResult = {
  generatedSummary: string;
  keywords: Array<{
    term: string;
    explanation: string;
    context: string;
    evidenceBlockId: string;
  }>;
};

export type KeywordCandidate = {
  term: string;
  count: number;
  firstEvidenceBlockId: string;
  sampleContext: string;
};

export type GeneratedSummaryKeywords = SummaryKeywordsResult & {
  normalizedKeywords: Keyword[];
  model: string;
  sampledBlockIds: string[];
  sampledBlocksCount: number;
  sampledTranscriptChars: number;
};

const MAX_BLOCKS = 40;
const MIN_BLOCKS = 20;
const MAX_TRANSCRIPT_CHARS = 5000;
const RETRY_TRANSCRIPT_CHARS = 4200;
const MAX_KEYWORD_CANDIDATES = 20;
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
const KEYWORD_HINT_PATTERN =
  /(平台|系统|框架|模型|接口|工具|产品|方法|协议|API|SDK|Agent|Copilot|Workflow|Studio|Suite)/i;

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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCandidateTerm(term: string) {
  return term
    .replace(/[，。、“”"'`‘’（）()[\]{}<>《》!?！？,:：;；/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function candidateScore(candidate: KeywordCandidate) {
  let score = candidate.count * 10;

  if (KEYWORD_HINT_PATTERN.test(candidate.term)) {
    score += 8;
  }

  if (/[A-Z]/.test(candidate.term) || /[A-Za-z]+\s+[A-Za-z]+/.test(candidate.term)) {
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
    const chinesePhraseMatches =
      text.match(/[\u4e00-\u9fa5]{2,8}/g) ?? [];

    for (const term of [...englishMatches, ...hintedChineseMatches, ...chinesePhraseMatches]) {
      collectCandidate(term, block);
    }
  }

  return Array.from(candidates.values())
    .filter((candidate) => candidate.count > 1 || KEYWORD_HINT_PATTERN.test(candidate.term))
    .sort((a, b) => candidateScore(b) - candidateScore(a) || b.count - a.count)
    .slice(0, MAX_KEYWORD_CANDIDATES);
}

function sampleTranscriptBlocks(
  blocks: TranscriptBlock[],
  maxChars: number,
) {
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

      if (finalBlocks.length >= MIN_BLOCKS && totalChars + serialized.length > maxChars) {
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
    for (let index = start; index < end && indices.size < targetCount; index += 1) {
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

    for (let index = 0; index < blocks.length && indices.size < targetCount; index += step) {
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

    if (finalBlocks.length >= MIN_BLOCKS && totalChars + serialized.length > maxChars) {
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

function buildSystemPrompt() {
  return [
    "你是 KnowBase 的轻量知识包摘要助手。",
    "你只能基于给定 transcriptBlocks 生成结果，不要虚构信息。",
    "你必须只输出严格 JSON，不要输出 markdown，不要输出 JSON 外的任何文字。",
    "evidenceBlockId 必须来自输入 block id。",
    "本轮只生成 generatedSummary 和 keywords，不要输出 sections，不要输出 glossaryTerms。",
  ].join(" ");
}

function buildUserPrompt({
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

function validateGeneratedSummaryKeywords(result: SummaryKeywordsResult) {
  if (!result.generatedSummary) {
    throw new Error("LLM 结果缺少 generatedSummary。");
  }

  if (result.keywords.length === 0) {
    throw new Error("LLM 结果缺少可用 keywords。");
  }
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
        content: buildSystemPrompt(),
      },
      {
        role: "user",
        content: buildUserPrompt({
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

  const firstSample = sampleTranscriptBlocks(transcriptBlocks, MAX_TRANSCRIPT_CHARS);

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

    const secondSample = sampleTranscriptBlocks(transcriptBlocks, RETRY_TRANSCRIPT_CHARS);

    return runSummaryKeywordsGeneration({
      title,
      platform,
      summary,
      sampledBlocks: secondSample,
    });
  }
}
