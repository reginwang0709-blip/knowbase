import "server-only";

import type { GlossaryTerm, Keyword, Section, TranscriptBlock } from "@/lib/mock-data";
import {
  GLOSSARY_DISPLAY_POLICY_NAME,
  buildGlossaryExplanationPreview,
  evaluateGlossaryDisplayEligibility,
  normalizeGlossaryTermRecord,
  normalizeGlossaryTermText,
} from "@/lib/glossary-terms";
import {
  createMiniMaxChatCompletion,
  getMiniMaxModel,
} from "./minimax-client";
import {
  diagnoseGlossaryCandidatesFromFullTranscript,
  type GlossaryCandidate,
} from "./knowledge-pack-generator";

const PREGENERATED_GLOSSARY_TERM_LIMIT = 8;
const SINGLE_GLOSSARY_EXPLAIN_MAX_TOKENS = 500;

type SingleTermExplanation = {
  definition: string;
  whyItMatters: string;
  evidence: string;
  aliases: string[];
};

type GeneratedGlossaryDisplayDiagnostics = {
  highlightableCount: number;
  readyCount: number;
  pendingCount: number;
  inventoryOnlyCount: number;
  lowConfidenceInventoryCount: number;
  userAddedCount: number;
  displayPolicyUsed: string;
  topHighlightableTerms: Array<{
    term: string;
    confidence: string;
    displayReason: string;
  }>;
  droppedFromHighlightExamples: Array<{
    term: string;
    confidence: string;
    hiddenReason: string;
  }>;
  inventoryOnlyExamples: Array<{
    term: string;
    confidence: string;
    hiddenReason: string;
  }>;
};

export type GeneratedGlossaryInventory = {
  glossaryTerms: GlossaryTerm[];
  highlightableGlossaryTerms: GlossaryTerm[];
  readyGlossaryTerms: GlossaryTerm[];
  pendingGlossaryTerms: GlossaryTerm[];
  model: string;
  sampledBlockIds: string[];
  sampledBlocksCount: number;
  sampledTranscriptChars: number;
  preGeneratedCount: number;
  totalInventoryCount: number;
  displayDiagnostics: GeneratedGlossaryDisplayDiagnostics;
};

function mapCandidateCategoryToGlossaryCategory(
  category?: GlossaryCandidate["categoryGuess"],
): GlossaryTerm["category"] {
  switch (category) {
    case "person":
      return "person";
    case "organization":
      return "organization";
    case "abbreviation":
      return "abbreviation";
    case "method":
      return "method";
    case "product":
      return "product";
    default:
      return "concept";
  }
}

function buildGlossaryTermId(index: number) {
  return `gt-${String(index + 1).padStart(3, "0")}`;
}

function buildEvidenceSnippet(candidate: GlossaryCandidate) {
  return candidate.firstContext.trim().replace(/\s+/g, " ").slice(0, 120);
}

function buildGlossaryInventoryTerm({
  candidate,
  contentId,
  index,
}: {
  candidate: GlossaryCandidate;
  contentId: string;
  index: number;
}) {
  const now = new Date().toISOString();

  return normalizeGlossaryTermRecord(
    {
      id: buildGlossaryTermId(index),
      termId: buildGlossaryTermId(index),
      contentId,
      term: candidate.term,
      normalizedTerm: candidate.normalizedTerm || normalizeGlossaryTermText(candidate.term),
      category: mapCandidateCategoryToGlossaryCategory(candidate.categoryGuess),
      source: "auto",
      confidence: candidate.confidence,
      evidenceSnippet: buildEvidenceSnippet(candidate),
      blockId: candidate.firstEvidenceBlockId,
      firstEvidenceBlockId: candidate.firstEvidenceBlockId,
      occurrenceCount: candidate.occurrenceCount,
      evidenceBlockIds: candidate.allEvidenceBlockIds.slice(0, 10),
      explanationStatus: "pending",
      explanation: null,
      createdAt: now,
      updatedAt: now,
    },
    contentId,
  );
}

function applyCandidateDisplaySignals(term: GlossaryTerm, candidate?: GlossaryCandidate) {
  const display = evaluateGlossaryDisplayEligibility(term, {
    candidateSource: candidate?.candidateSource,
    confidence: candidate?.confidence,
    matchedSignals: candidate?.matchedSignals,
    scoreBreakdown: candidate?.scoreBreakdown,
  });

  return normalizeGlossaryTermRecord(
    {
      ...term,
      highlightEnabled: display.highlightEnabled,
      displayStatus: display.displayStatus,
      displayReason: display.displayReason,
      hiddenReason: display.hiddenReason,
    },
    term.contentId,
  );
}

function buildDisplayDiagnostics(glossaryTerms: GlossaryTerm[]): GeneratedGlossaryDisplayDiagnostics {
  const highlightableGlossaryTerms = glossaryTerms.filter(
    (term) => term.highlightEnabled === true || term.displayStatus === "highlighted",
  );
  const readyCount = glossaryTerms.filter(
    (term) => term.explanationStatus === "ready",
  ).length;
  const pendingCount = glossaryTerms.filter(
    (term) => term.explanationStatus !== "ready",
  ).length;
  const inventoryOnlyTerms = glossaryTerms.filter((term) => !term.highlightEnabled);
  const lowConfidenceInventoryTerms = inventoryOnlyTerms.filter(
    (term) => term.source !== "user_added" && term.confidence === "low",
  );
  const userAddedCount = glossaryTerms.filter((term) => term.source === "user_added").length;

  return {
    highlightableCount: highlightableGlossaryTerms.length,
    readyCount,
    pendingCount,
    inventoryOnlyCount: inventoryOnlyTerms.length,
    lowConfidenceInventoryCount: lowConfidenceInventoryTerms.length,
    userAddedCount,
    displayPolicyUsed: GLOSSARY_DISPLAY_POLICY_NAME,
    topHighlightableTerms: highlightableGlossaryTerms.slice(0, 12).map((term) => ({
      term: term.term,
      confidence: term.confidence || "unknown",
      displayReason: term.displayReason || "highlighted",
    })),
    droppedFromHighlightExamples: inventoryOnlyTerms.slice(0, 12).map((term) => ({
      term: term.term,
      confidence: term.confidence || "unknown",
      hiddenReason: term.hiddenReason || "inventory_only",
    })),
    inventoryOnlyExamples: inventoryOnlyTerms.slice(0, 12).map((term) => ({
      term: term.term,
      confidence: term.confidence || "unknown",
      hiddenReason: term.hiddenReason || "inventory_only",
    })),
  };
}

function buildSingleTermExplainSystemPrompt() {
  return [
    "你是 KnowBase 的单术语解释助手。",
    "只解释一个术语。",
    "只输出严格 JSON。",
    "不要输出 markdown，不要输出额外说明。",
    "definition 用一句话解释这个词在本内容中的含义。",
    "whyItMatters 用一句话说明它为什么和本内容相关。",
    "evidence 用一句很短的语境说明，不要长引用。",
    "aliases 始终是数组，没有别名就输出 []。",
  ].join(" ");
}

function buildSingleTermExplainUserPrompt({
  title,
  platform,
  generatedSummary,
  keywords,
  sections,
  term,
}: {
  title: string;
  platform: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
  term: GlossaryTerm;
}) {
  const preview = buildGlossaryExplanationPreview(term);

  return `
请只解释这一个术语，输出结构必须严格为：
{
  "definition": "string",
  "whyItMatters": "string",
  "evidence": "string",
  "aliases": ["string"]
}

标题：${title}
平台：${platform}
摘要：${generatedSummary}
已有 keywords：${keywords.map((keyword) => keyword.term).join(" / ") || "无"}
sections：${sections
    .slice(0, 6)
    .map((section) => `${section.title} | ${section.summary}`)
    .join("\n") || "无"}

当前术语：
- term=${term.term}
- normalizedTerm=${term.normalizedTerm}
- category=${term.category || "concept"}
- confidence=${term.confidence || "unknown"}
- evidenceSnippet=${term.evidenceSnippet || preview.evidence || "无"}

要求：
1. 只解释这个术语。
2. 不要解释为百科词条，要结合本内容语境。
3. definition、whyItMatters、evidence 都要短。
4. aliases 最多 3 个。
5. 不要输出 glossaryTerms 数组。
`.trim();
}

function parseSingleTermExplanation(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
  const parsed = JSON.parse(candidate) as Partial<SingleTermExplanation>;

  return {
    definition: typeof parsed.definition === "string" ? parsed.definition.trim().slice(0, 80) : "",
    whyItMatters:
      typeof parsed.whyItMatters === "string"
        ? parsed.whyItMatters.trim().slice(0, 60)
        : "",
    evidence: typeof parsed.evidence === "string" ? parsed.evidence.trim().slice(0, 80) : "",
    aliases: Array.isArray(parsed.aliases)
      ? parsed.aliases
          .map((alias) => (typeof alias === "string" ? alias.trim() : ""))
          .filter(Boolean)
          .slice(0, 3)
      : [],
  } satisfies SingleTermExplanation;
}

export async function explainSingleGlossaryTerm({
  title,
  platform,
  generatedSummary,
  keywords,
  sections,
  term,
}: {
  title: string;
  platform: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
  term: GlossaryTerm;
}) {
  const completion = await createMiniMaxChatCompletion({
    messages: [
      {
        role: "system",
        content: buildSingleTermExplainSystemPrompt(),
      },
      {
        role: "user",
        content: buildSingleTermExplainUserPrompt({
          title,
          platform,
          generatedSummary,
          keywords,
          sections,
          term,
        }),
      },
    ],
    temperature: 0,
    maxTokens: SINGLE_GLOSSARY_EXPLAIN_MAX_TOKENS,
  });

  const explanation = parseSingleTermExplanation(completion.content);

  if (!explanation.definition || !explanation.evidence) {
    throw new Error("术语解释生成结果不完整。");
  }

  const now = new Date().toISOString();

  return normalizeGlossaryTermRecord(
    {
      ...term,
      aliases: explanation.aliases,
      definition: explanation.definition,
      contextExample: explanation.evidence,
      explanationStatus: "ready",
      explanation,
      updatedAt: now,
    },
    term.contentId,
  );
}

export async function buildGlossaryInventoryFromContent({
  contentId,
  title,
  platform,
  generatedSummary,
  keywords,
  sections,
  transcriptBlocks,
}: {
  contentId: string;
  title: string;
  platform: string;
  generatedSummary: string;
  keywords: Keyword[];
  sections: Section[];
  transcriptBlocks: TranscriptBlock[];
}): Promise<GeneratedGlossaryInventory> {
  const diagnostics = diagnoseGlossaryCandidatesFromFullTranscript({
    blocks: transcriptBlocks,
    existingKeywords: keywords,
    documentContext: {
      title,
      generatedSummary,
      sections,
      keywords,
    },
  });

  const inventory = diagnostics.candidates.map((candidate, index) =>
    applyCandidateDisplaySignals(
      buildGlossaryInventoryTerm({
        candidate,
        contentId,
        index,
      }),
      candidate,
    ),
  );
  const candidatesByTerm = new Map(
    diagnostics.candidates.map((candidate) => [candidate.normalizedTerm, candidate] as const),
  );
  const readyGlossaryTerms: GlossaryTerm[] = [];
  const pendingGlossaryTerms: GlossaryTerm[] = [];
  const preGenerateTargets = inventory
    .filter((term) => {
      const candidate = candidatesByTerm.get(term.normalizedTerm || "");
      return candidate?.confidence === "high";
    })
    .slice(0, PREGENERATED_GLOSSARY_TERM_LIMIT);

  for (const term of inventory) {
    if (!preGenerateTargets.some((item) => item.id === term.id)) {
      pendingGlossaryTerms.push(term);
    }
  }

  for (const term of preGenerateTargets) {
    try {
      const explained = await explainSingleGlossaryTerm({
        title,
        platform,
        generatedSummary,
        keywords,
        sections,
        term: {
          ...term,
          category: term.category || mapCandidateCategoryToGlossaryCategory(
            candidatesByTerm.get(term.normalizedTerm || "")?.categoryGuess,
          ),
          evidenceSnippet:
            term.evidenceSnippet ||
            candidatesByTerm.get(term.normalizedTerm || "")?.firstContext ||
            "",
        },
      });
      readyGlossaryTerms.push(
        applyCandidateDisplaySignals(
          explained,
          candidatesByTerm.get(explained.normalizedTerm || ""),
        ),
      );
    } catch {
      pendingGlossaryTerms.push(
        applyCandidateDisplaySignals(
          normalizeGlossaryTermRecord(
            {
              ...term,
              explanationStatus: "failed",
              explanation: null,
            },
            contentId,
          ),
          candidatesByTerm.get(term.normalizedTerm || ""),
        ),
      );
    }
  }

  const readyById = new Map(readyGlossaryTerms.map((term) => [term.id, term] as const));
  const glossaryTerms = inventory.map((term) => readyById.get(term.id) ?? term);
  const highlightableGlossaryTerms = glossaryTerms.filter(
    (term) => term.highlightEnabled === true || term.displayStatus === "highlighted",
  );
  const displayDiagnostics = buildDisplayDiagnostics(glossaryTerms);

  return {
    glossaryTerms,
    highlightableGlossaryTerms,
    readyGlossaryTerms,
    pendingGlossaryTerms: glossaryTerms.filter(
      (term) => term.explanationStatus !== "ready",
    ),
    model: getMiniMaxModel(),
    sampledBlockIds: glossaryTerms
      .map((term) => term.blockId || term.firstEvidenceBlockId || "")
      .filter(Boolean),
    sampledBlocksCount: glossaryTerms.length,
    sampledTranscriptChars: transcriptBlocks.map((block) => block.text).join("\n").length,
    preGeneratedCount: readyGlossaryTerms.length,
    totalInventoryCount: glossaryTerms.length,
    displayDiagnostics,
  };
}

export function createUserAddedGlossaryTerm({
  contentId,
  termId,
  term,
  blockId,
  evidenceSnippet,
}: {
  contentId: string;
  termId: string;
  term: string;
  blockId: string;
  evidenceSnippet: string;
}) {
  const now = new Date().toISOString();

  return normalizeGlossaryTermRecord(
    {
      id: termId,
      termId,
      contentId,
      term,
      normalizedTerm: normalizeGlossaryTermText(term),
      category: "concept",
      source: "user_added",
      evidenceSnippet,
      blockId,
      firstEvidenceBlockId: blockId,
      occurrenceCount: 1,
      evidenceBlockIds: blockId ? [blockId] : [],
      occurrences: blockId
        ? [
            {
              blockId,
              startOffset: null,
              endOffset: null,
              matchedText: term,
            },
          ]
        : [],
      explanationStatus: "pending",
      explanation: null,
      highlightEnabled: true,
      displayStatus: "highlighted",
      displayReason: "user_added",
      createdAt: now,
      updatedAt: now,
    },
    contentId,
  );
}
