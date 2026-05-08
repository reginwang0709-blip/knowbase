"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GlossaryTerm,
  KnowledgeItem,
  Section,
  TranscriptBlock,
} from "@/lib/mock-data";
import type { ReactNode } from "react";
import {
  buildGlossaryExplanationPreview,
  isGlossaryTermHighlightEnabled,
  isValidUserGlossarySelection,
} from "@/lib/glossary-terms";

type KnowledgePackClientProps = {
  item: KnowledgeItem;
};

type GlossaryToken = {
  key: string;
  term: GlossaryTerm;
  token: string;
};

type HighlightPlacement = {
  key: string;
  term: GlossaryTerm;
  label: string;
  start: number;
  end: number;
};

type HighlightPlanResult = {
  highlightsByBlockId: Map<string, HighlightPlacement[]>;
  diagnostics: {
    totalGlossaryTerms: number;
    highlightableTermsCount: number;
    highlightTokensCount: number;
    uniqueHighlightedNormalizedTermsCount: number;
    suppressedDuplicateCount: number;
    suppressedFragmentCount: number;
    suppressedNoisyVariantCount: number;
    pendingHighlightCount: number;
    readyHighlightCount: number;
  };
};

type SectionTranscriptGroup = {
  section: Section;
  blocks: TranscriptBlock[];
};

type TextSelectionState = {
  term: string;
  blockId: string | null;
  startOffset: number;
  endOffset: number;
  contextBefore: string;
  contextAfter: string;
  x: number;
  y: number;
  error?: string;
};

type GlossaryFeedbackAction = "star" | "hide" | "incorrect";

type SelectionDebugState = {
  trigger: string;
  selectionText: string;
  selectionTextLength: number;
  selectionRangeCount: number;
  anchorNodeName: string;
  anchorPreview: string;
  focusNodeName: string;
  focusPreview: string;
  commonAncestorName: string;
  whetherInsideTranscriptContainer: boolean;
  foundTranscriptBlockId: string | null;
  foundBlockByClosest: string | null;
  rangeRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
  popoverOpen: boolean;
  popoverTop: number | null;
  popoverLeft: number | null;
  popoverRendered: boolean;
  rejectReason: string | null;
};

const highlightDuration = 2600;
const navItems = [
  { id: "content-meta", label: "基本信息" },
  { id: "content-summary", label: "内容摘要" },
  { id: "content-keywords", label: "Top 5 关键词" },
  { id: "content-transcript", label: "逐字稿 / 文章" },
];
const categoryLabels: Record<NonNullable<GlossaryTerm["category"]>, string> = {
  concept: "概念",
  person: "人物",
  organization: "机构",
  abbreviation: "缩写",
  method: "方法",
  product: "产品",
  technical_concept: "技术概念",
  product_name: "产品名",
  company_name: "公司",
  model_name: "模型",
  framework: "框架",
  event: "事件",
  industry_term: "行业术语",
  other: "术语",
};

const SPOKEN_FRAGMENT_STARTERS = [
  "然后",
  "这个",
  "那个",
  "什么",
  "就是",
  "其实",
  "可能",
  "一个",
  "一些",
  "这种",
  "那个",
];
const CHINESE_FUNCTION_WORD_START = /^(个|的|了|是|在|和|跟|把|被|会|能|这|那|国的)/;
const CHINESE_FUNCTION_WORD_END = /(的|了|是|在|和|跟|把|被|会|能)$/;
const NOISY_ENGLISH_WORDS = new Set([
  "clock",
  "cloud",
  "code",
  "coding",
  "open",
  "token",
]);

function buildGlossaryTokens(glossaryTerms: GlossaryTerm[]) {
  const byKey = new Map<string, GlossaryTerm>();
  let suppressedDuplicateCount = 0;
  let suppressedFragmentCount = 0;
  let suppressedNoisyVariantCount = 0;

  for (const term of glossaryTerms) {
    if (!isGlossaryTermHighlightEnabled(term)) {
      continue;
    }

    const key = getGlossaryTermKey(term);

    if (!key) {
      suppressedFragmentCount += 1;
      continue;
    }

    const suppressionReason = getFrontendSuppressionReason(term, glossaryTerms);

    if (suppressionReason === "fragment") {
      suppressedFragmentCount += 1;
      continue;
    }

    if (suppressionReason === "noisy_variant") {
      suppressedNoisyVariantCount += 1;
      continue;
    }

    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, term);
      continue;
    }

    suppressedDuplicateCount += 1;
    byKey.set(key, pickPreferredGlossaryTerm(existing, term));
  }

  const terms = Array.from(byKey.entries()).map(([key, term]) => ({ key, term }));
  const tokens = terms.flatMap(({ key, term }) => {
    const uniqueTokens = Array.from(
      new Set([term.term, ...(term.aliases ?? [])].filter(Boolean)),
    )
      .filter((token) => isAllowedHighlightToken(token, term))
      .sort((first, second) => second.length - first.length);

    return uniqueTokens.map((token) => ({ key, term, token }));
  });

  return {
    tokens: tokens.sort((first, second) => {
      if (second.token.length !== first.token.length) {
        return second.token.length - first.token.length;
      }

      return compareGlossaryTermPriority(first.term, second.term);
    }),
    terms: terms.map((entry) => entry.term),
    diagnostics: {
      suppressedDuplicateCount,
      suppressedFragmentCount,
      suppressedNoisyVariantCount,
    },
  };
}

function getNodeName(node: Node | null | undefined) {
  if (!node) {
    return "";
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return "#text";
  }

  return node.nodeName;
}

function getNodePreview(node: Node | null | undefined) {
  if (!node) {
    return "";
  }

  const text =
    node.nodeType === Node.TEXT_NODE
      ? node.textContent || ""
      : (node as Element).textContent || "";

  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}

function toElement(node: Node | null | undefined) {
  if (!node) {
    return null;
  }

  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function isValidManualGlossarySelection(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty_selection" } as const;
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(trimmed)) {
    return { ok: false, reason: "punctuation_only" } as const;
  }

  if (trimmed.length > 60) {
    return { ok: false, reason: "selection_too_long" } as const;
  }

  const lineBreakCount = (trimmed.match(/\n/g) ?? []).length;

  if (lineBreakCount > 2) {
    return { ok: false, reason: "too_many_line_breaks" } as const;
  }

  return { ok: true, reason: null } as const;
}

function findTranscriptBlockIdFromSources({
  selection,
  range,
  eventTarget,
}: {
  selection: Selection;
  range: Range;
  eventTarget?: EventTarget | null;
}) {
  const sources = [
    toElement(selection.anchorNode),
    toElement(selection.focusNode),
    eventTarget instanceof Node ? toElement(eventTarget) : null,
    toElement(range.startContainer),
    toElement(range.endContainer),
  ];

  for (const source of sources) {
    const blockElement = source?.closest<HTMLElement>("[data-transcript-block-id]");

    if (blockElement?.dataset.transcriptBlockId) {
      return {
        blockId: blockElement.dataset.transcriptBlockId,
        foundByClosest: blockElement.dataset.transcriptBlockId,
      };
    }
  }

  return {
    blockId: null,
    foundByClosest: null,
  };
}

function normalizeGlossaryMatchText(value: string) {
  return value.normalize("NFKC").toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGenericGlossaryToken(token: string) {
  return new Set([
    "code",
    "model",
    "product",
    "user",
    "system",
    "agent",
    "cloud",
  ]).has(token.trim().toLowerCase());
}

function getGlossaryTermKey(term: GlossaryTerm) {
  return term.normalizedTerm?.trim() || normalizeGlossaryMatchText(term.term).replace(/\s+/g, "");
}

function getConfidenceRank(confidence?: GlossaryTerm["confidence"]) {
  switch (confidence) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function getStatusRank(status?: GlossaryTerm["explanationStatus"]) {
  switch (status) {
    case "ready":
      return 3;
    case "generating":
      return 2;
    case "pending":
      return 1;
    case "failed":
      return 0;
    default:
      return 0;
  }
}

function compareGlossaryTermPriority(first: GlossaryTerm, second: GlossaryTerm) {
  if ((second.displayStatus === "hidden" ? 1 : 0) !== (first.displayStatus === "hidden" ? 1 : 0)) {
    return (first.displayStatus === "hidden" ? 1 : 0) - (second.displayStatus === "hidden" ? 1 : 0);
  }

  if ((second.source === "user_added" ? 1 : 0) !== (first.source === "user_added" ? 1 : 0)) {
    return (second.source === "user_added" ? 1 : 0) - (first.source === "user_added" ? 1 : 0);
  }

  if ((second.isStarred ? 1 : 0) !== (first.isStarred ? 1 : 0)) {
    return (second.isStarred ? 1 : 0) - (first.isStarred ? 1 : 0);
  }

  if ((second.userFeedback === "incorrect" ? 1 : 0) !== (first.userFeedback === "incorrect" ? 1 : 0)) {
    return (first.userFeedback === "incorrect" ? 1 : 0) - (second.userFeedback === "incorrect" ? 1 : 0);
  }

  if (getStatusRank(second.explanationStatus) !== getStatusRank(first.explanationStatus)) {
    return getStatusRank(second.explanationStatus) - getStatusRank(first.explanationStatus);
  }

  if (getConfidenceRank(second.confidence) !== getConfidenceRank(first.confidence)) {
    return getConfidenceRank(second.confidence) - getConfidenceRank(first.confidence);
  }

  if (second.term.length !== first.term.length) {
    return second.term.length - first.term.length;
  }

  return second.occurrenceCount - first.occurrenceCount;
}

function pickPreferredGlossaryTerm(first: GlossaryTerm, second: GlossaryTerm) {
  return compareGlossaryTermPriority(first, second) > 0 ? second : first;
}

function getGlossaryAnchorBlockId(term: GlossaryTerm) {
  const record = term as unknown as Record<string, unknown>;
  const firstEvidenceBlockId =
    typeof record.firstEvidenceBlockId === "string"
      ? record.firstEvidenceBlockId
      : "";

  return firstEvidenceBlockId || term.evidenceBlockIds[0] || "";
}

function tokenizeEnglishPhrase(value: string) {
  return value
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function levenshteinDistance(first: string, second: string) {
  if (first === second) {
    return 0;
  }

  const dp = Array.from({ length: first.length + 1 }, () =>
    Array<number>(second.length + 1).fill(0),
  );

  for (let i = 0; i <= first.length; i += 1) {
    dp[i][0] = i;
  }

  for (let j = 0; j <= second.length; j += 1) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= first.length; i += 1) {
    for (let j = 1; j <= second.length; j += 1) {
      const cost = first[i - 1] === second[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[first.length][second.length];
}

function looksLikeChineseFragment(term: string) {
  const trimmed = term.trim();

  if (!/[\u4e00-\u9fff]/.test(trimmed)) {
    return false;
  }

  if (SPOKEN_FRAGMENT_STARTERS.some((value) => trimmed.startsWith(value))) {
    return true;
  }

  if (CHINESE_FUNCTION_WORD_START.test(trimmed) || CHINESE_FUNCTION_WORD_END.test(trimmed)) {
    return true;
  }

  if (/(这个|那个|什么什么|然后这个)/.test(trimmed)) {
    return true;
  }

  if (trimmed.length >= 4 && /(然后|这个|那个|什么|就是|其实|可能)/.test(trimmed)) {
    return true;
  }

  return false;
}

function looksLikeNoisyEnglishPhrase(term: string) {
  const words = tokenizeEnglishPhrase(term);

  if (words.length === 0) {
    return false;
  }

  if (words.length === 1) {
    return NOISY_ENGLISH_WORDS.has(words[0]);
  }

  if (words.length === 2 && NOISY_ENGLISH_WORDS.has(words[1])) {
    return words[0].length <= 5 || NOISY_ENGLISH_WORDS.has(words[0]);
  }

  return words.every((word) => NOISY_ENGLISH_WORDS.has(word));
}

function isWeakerAsrLikeVariant(term: GlossaryTerm, glossaryTerms: GlossaryTerm[]) {
  const words = tokenizeEnglishPhrase(term.term);

  if (words.length !== 2 || !NOISY_ENGLISH_WORDS.has(words[1])) {
    return false;
  }

  return glossaryTerms.some((candidate) => {
    if (candidate.id === term.id || !isGlossaryTermHighlightEnabled(candidate)) {
      return false;
    }

    const candidateWords = tokenizeEnglishPhrase(candidate.term);

    if (candidateWords.length !== 2 || candidateWords[1] !== words[1]) {
      return false;
    }

    if (compareGlossaryTermPriority(term, candidate) > 0) {
      return false;
    }

    return levenshteinDistance(words[0], candidateWords[0]) <= 3;
  });
}

function getFrontendSuppressionReason(
  term: GlossaryTerm,
  glossaryTerms: GlossaryTerm[],
): "fragment" | "noisy_variant" | null {
  if (looksLikeChineseFragment(term.term)) {
    return "fragment";
  }

  if (looksLikeNoisyEnglishPhrase(term.term) || isWeakerAsrLikeVariant(term, glossaryTerms)) {
    return "noisy_variant";
  }

  return null;
}

function isAllowedHighlightToken(token: string, term: GlossaryTerm) {
  if (token.length < 2 || isGenericGlossaryToken(token)) {
    return false;
  }

  if (looksLikeChineseFragment(token) || looksLikeNoisyEnglishPhrase(token)) {
    return false;
  }

  if (tokenizeEnglishPhrase(token).length === 1 && term.term !== token && token.length <= 4) {
    return false;
  }

  return true;
}

function findTokenMatch(
  text: string,
  token: string,
  startIndex = 0,
) {
  if (!token) {
    return null;
  }

  const hasLatinChars = /[A-Za-z0-9]/.test(token);

  if (hasLatinChars) {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9])(${escapeRegExp(token)})(?=$|[^A-Za-z0-9])`,
      "i",
    );
    const sliced = text.slice(startIndex);
    const match = pattern.exec(sliced);

    if (!match || typeof match.index !== "number") {
      return null;
    }

    const leading = match[1] ?? "";
    const matched = match[2] ?? "";
    const index = startIndex + match.index + leading.length;

    return {
      index,
      length: matched.length,
      text: text.slice(index, index + matched.length),
    };
  }

  const index = text.indexOf(token, startIndex);

  if (index === -1) {
    return null;
  }

  return {
    index,
    length: token.length,
    text: text.slice(index, index + token.length),
  };
}

function rangesOverlap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return firstStart < secondEnd && secondStart < firstEnd;
}

function timestampToSeconds(value?: string) {
  if (!value) {
    return null;
  }

  const parts = value
    .split(":")
    .map((part) => Number(part.trim()))
    .filter((part) => !Number.isNaN(part));

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function buildBlockIndexMap(blocks: TranscriptBlock[]) {
  return new Map(blocks.map((block, index) => [block.id, index]));
}

function getBlockIndex(
  blockIndexMap: Map<string, number>,
  blockId?: string,
) {
  return blockId ? blockIndexMap.get(blockId) ?? null : null;
}

function createSectionAnchorId(sectionId: string) {
  return `section-${sectionId}`;
}

function formatSectionRange(section: Section) {
  if (section.startTimestamp && section.endTimestamp) {
    return `${section.startTimestamp} - ${section.endTimestamp}`;
  }

  return section.startTimestamp || section.endTimestamp || "章节";
}

function shouldShowSectionSummary(section: Section) {
  const title = section.title.trim();
  const summary = section.summary.trim();

  return Boolean(summary && summary !== title);
}

function groupTranscriptBlocksBySections(
  sections: Section[],
  transcriptBlocks: TranscriptBlock[],
) {
  if (sections.length === 0) {
    return [] as SectionTranscriptGroup[];
  }

  const blockIndexMap = buildBlockIndexMap(transcriptBlocks);

  return sections.map((section, index) => {
    const nextSection = sections[index + 1];
    const currentStart = timestampToSeconds(section.startTimestamp);
    const currentEnd = timestampToSeconds(section.endTimestamp);
    const nextStart = timestampToSeconds(nextSection?.startTimestamp);
    const startBlockIndex =
      getBlockIndex(blockIndexMap, section.startBlockId) ??
      getBlockIndex(blockIndexMap, section.endBlockId);
    const endBlockIndex =
      getBlockIndex(blockIndexMap, section.endBlockId) ??
      getBlockIndex(blockIndexMap, nextSection?.startBlockId);

    const blocks = transcriptBlocks.filter((block, blockIndex) => {
      const blockSeconds = timestampToSeconds(block.time);

      if (blockSeconds !== null) {
        if (index === 0 && nextStart !== null) {
          return blockSeconds < nextStart;
        }

        if (currentStart !== null && currentEnd !== null) {
          return blockSeconds >= currentStart && blockSeconds < currentEnd;
        }

        if (currentStart !== null && nextStart !== null) {
          return blockSeconds >= currentStart && blockSeconds < nextStart;
        }

        if (currentStart !== null) {
          return blockSeconds >= currentStart;
        }
      }

      if (startBlockIndex === null) {
        return false;
      }

      if (endBlockIndex !== null) {
        return blockIndex >= startBlockIndex && blockIndex < endBlockIndex;
      }

      return blockIndex >= startBlockIndex;
    });

    return {
      section,
      blocks,
    };
  });
}

function GlossaryMarker({
  label,
  term,
  onLocate,
  onRequestExplain,
  onFeedback,
  isOpen,
  onTermMouseEnter,
  onTermMouseLeave,
  onTooltipMouseEnter,
  onTooltipMouseLeave,
}: {
  label: string;
  term: GlossaryTerm;
  onLocate: (term: GlossaryTerm) => void;
  onRequestExplain: (
    term: GlossaryTerm,
    requestSource?: "generate_button" | "retry_button",
  ) => void;
  onFeedback: (term: GlossaryTerm, action: GlossaryFeedbackAction) => void;
  isOpen: boolean;
  onTermMouseEnter: (term: GlossaryTerm) => void;
  onTermMouseLeave: () => void;
  onTooltipMouseEnter: () => void;
  onTooltipMouseLeave: () => void;
}) {
  const categoryLabel = term.category ? categoryLabels[term.category] : null;
  const preview = buildGlossaryExplanationPreview(term);
  const status = term.explanationStatus ?? "pending";
  const isReady = status === "ready" && Boolean(term.explanation);
  const isStarred = term.isStarred === true;

  return (
    <span
      className="relative inline-block"
      data-glossary-marker={term.id}
      data-no-selection-popover="true"
      onMouseEnter={() => onTermMouseEnter(term)}
      onMouseLeave={onTermMouseLeave}
    >
      <button
        className={`rounded px-1 font-medium underline underline-offset-4 transition ${
          status === "failed"
            ? "bg-coral/10 text-coral decoration-coral/30 hover:bg-coral/20"
            : "bg-sage/10 text-sage decoration-sage/30 hover:bg-sage/20"
        }`}
        type="button"
        onClick={() => onLocate(term)}
      >
        {label}
      </button>
      {isOpen ? (
        <span
          className="absolute left-0 top-full z-[80] mt-2 block w-[300px] max-w-[80vw] rounded-lg border border-line bg-white p-3 text-left text-xs leading-5 text-ink opacity-100 shadow-lg"
          data-glossary-tooltip={term.id}
          data-no-selection-popover="true"
          onMouseEnter={onTooltipMouseEnter}
          onMouseLeave={onTooltipMouseLeave}
        >
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-ink">{term.term}</span>
          {categoryLabel ? (
            <span className="rounded-full bg-sage/10 px-2 py-0.5 text-[11px] font-semibold text-sage">
              {categoryLabel}
            </span>
          ) : null}
          <span className="rounded-full bg-panel px-2 py-0.5 text-[11px] text-muted">
            出现 {term.occurrenceCount} 次
          </span>
        </span>
        {isReady ? (
          <>
            <span className="mt-2 block text-muted">{preview.definition}</span>
            {preview.whyItMatters ? (
              <span className="mt-2 block text-[11px] text-muted">
                相关性：{preview.whyItMatters}
              </span>
            ) : null}
            <span className="mt-2 block rounded-md bg-panel p-2 text-ink">
              语境：{preview.evidence}
            </span>
          </>
        ) : status === "failed" ? (
          <>
            <span className="mt-2 block text-coral">解释生成失败。</span>
            <button
              className="mt-3 rounded-md border border-coral/30 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/10"
              type="button"
              onClick={() => onRequestExplain(term, "retry_button")}
            >
              重试生成
            </button>
          </>
        ) : status === "generating" ? (
          <>
            <span className="mt-2 block text-muted">解释生成中...</span>
            <button
              className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-muted"
              type="button"
              disabled
            >
              生成中...
            </button>
          </>
        ) : (
          <>
            <span className="mt-2 block text-muted">该术语解释尚未生成。</span>
            <button
              className="mt-3 rounded-md border border-sage/30 px-3 py-1.5 text-xs font-semibold text-sage transition hover:bg-sage/10"
              type="button"
              onClick={() => onRequestExplain(term, "generate_button")}
            >
              生成解释
            </button>
          </>
        )}
        <span className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
              isStarred
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-line text-muted hover:bg-panel"
            }`}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFeedback(term, "star");
            }}
          >
            ★ 收藏
          </button>
          <button
            className="rounded-md border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:bg-panel"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFeedback(term, "hide");
            }}
          >
            隐藏 / 不需要
          </button>
          <button
            className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${
              term.userFeedback === "incorrect"
                ? "border-coral/30 bg-coral/10 text-coral"
                : "border-line text-muted hover:bg-panel"
            }`}
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFeedback(term, "incorrect");
            }}
          >
            不准确
          </button>
        </span>
        </span>
      ) : null}
    </span>
  );
}

function MarkedText({
  text,
  highlights,
  onLocate,
  onRequestExplain,
  onFeedback,
  activeTooltipTermId,
  onTermMouseEnter,
  onTermMouseLeave,
  onTooltipMouseEnter,
  onTooltipMouseLeave,
}: {
  text: string;
  highlights: HighlightPlacement[];
  onLocate: (term: GlossaryTerm) => void;
  onRequestExplain: (
    term: GlossaryTerm,
    requestSource?: "generate_button" | "retry_button",
  ) => void;
  onFeedback: (term: GlossaryTerm, action: GlossaryFeedbackAction) => void;
  activeTooltipTermId: string;
  onTermMouseEnter: (term: GlossaryTerm) => void;
  onTermMouseLeave: () => void;
  onTooltipMouseEnter: () => void;
  onTooltipMouseLeave: () => void;
}) {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let plainIndex = 0;

  for (const highlight of highlights) {
    if (highlight.start > cursor) {
      nodes.push(
        <Fragment key={`plain-${plainIndex}`}>
          {text.slice(cursor, highlight.start)}
        </Fragment>,
      );
      plainIndex += 1;
    }

    nodes.push(
      <GlossaryMarker
        key={`glossary-${highlight.key}-${highlight.start}`}
        label={highlight.label}
        term={highlight.term}
        onLocate={onLocate}
        onRequestExplain={onRequestExplain}
        onFeedback={onFeedback}
        isOpen={activeTooltipTermId === highlight.term.id}
        onTermMouseEnter={onTermMouseEnter}
        onTermMouseLeave={onTermMouseLeave}
        onTooltipMouseEnter={onTooltipMouseEnter}
        onTooltipMouseLeave={onTooltipMouseLeave}
      />,
    );
    cursor = highlight.end;
  }

  if (cursor < text.length) {
    nodes.push(
      <Fragment key={`plain-${plainIndex}`}>{text.slice(cursor)}</Fragment>,
    );
  }

  return <>{nodes.length > 0 ? nodes : text}</>;
}

function findBestPlacementInBlock(
  text: string,
  termTokens: GlossaryToken[],
  occupiedRanges: Array<{ start: number; end: number }>,
) {
  let bestMatch:
    | (ReturnType<typeof findTokenMatch> & {
        token: string;
      })
    | null = null;

  for (const termToken of termTokens) {
    let searchIndex = 0;

    while (searchIndex < text.length) {
      const tokenMatch = findTokenMatch(text, termToken.token, searchIndex);

      if (!tokenMatch) {
        break;
      }

      const start = tokenMatch.index;
      const end = tokenMatch.index + tokenMatch.length;
      const overlaps = occupiedRanges.some((range) =>
        rangesOverlap(start, end, range.start, range.end),
      );

      if (!overlaps) {
        if (
          !bestMatch ||
          start < bestMatch.index ||
          (start === bestMatch.index && termToken.token.length > bestMatch.token.length)
        ) {
          bestMatch = {
            ...tokenMatch,
            token: termToken.token,
          };
        }
        break;
      }

      searchIndex = tokenMatch.index + Math.max(1, tokenMatch.length);
    }
  }

  return bestMatch;
}

function buildHighlightPlan(
  blocks: TranscriptBlock[],
  glossaryTokens: GlossaryToken[],
) : HighlightPlanResult {
  const highlightsByBlockId = new Map<string, HighlightPlacement[]>();
  const occupiedRangesByBlockId = new Map<string, Array<{ start: number; end: number }>>();
  const blockById = new Map(blocks.map((block) => [block.id, block] as const));
  const tokensByKey = new Map<string, GlossaryToken[]>();

  for (const glossaryToken of glossaryTokens) {
    const current = tokensByKey.get(glossaryToken.key) ?? [];
    current.push(glossaryToken);
    tokensByKey.set(glossaryToken.key, current);
  }

  const uniqueTerms = Array.from(tokensByKey.entries())
    .map(([key, tokens]) => ({
      key,
      term: tokens[0]?.term,
      tokens,
    }))
    .filter(
      (entry): entry is { key: string; term: GlossaryTerm; tokens: GlossaryToken[] } =>
        Boolean(entry.term) && entry.tokens.length > 0,
    )
    .sort((first, second) => {
      const secondMaxLength = Math.max(...second.tokens.map((item) => item.token.length));
      const firstMaxLength = Math.max(...first.tokens.map((item) => item.token.length));

      if (secondMaxLength !== firstMaxLength) {
        return secondMaxLength - firstMaxLength;
      }

      return compareGlossaryTermPriority(first.term, second.term);
    });

  for (const entry of uniqueTerms) {
    const preferredBlockIds = Array.from(
      new Set([
        getGlossaryAnchorBlockId(entry.term),
        entry.term.blockId || "",
        ...entry.term.evidenceBlockIds,
        ...blocks.map((block) => block.id),
      ].filter(Boolean)),
    );

    for (const blockId of preferredBlockIds) {
      const block = blockById.get(blockId);

      if (!block) {
        continue;
      }

      const occupiedRanges = occupiedRangesByBlockId.get(block.id) ?? [];
      const placement = findBestPlacementInBlock(block.text, entry.tokens, occupiedRanges);

      if (!placement) {
        continue;
      }

      const nextPlacement: HighlightPlacement = {
        key: entry.key,
        term: entry.term,
        label: placement.text,
        start: placement.index,
        end: placement.index + placement.length,
      };

      const blockHighlights = highlightsByBlockId.get(block.id) ?? [];
      blockHighlights.push(nextPlacement);
      blockHighlights.sort((first, second) => first.start - second.start);
      highlightsByBlockId.set(block.id, blockHighlights);
      occupiedRangesByBlockId.set(block.id, [
        ...occupiedRanges,
        { start: nextPlacement.start, end: nextPlacement.end },
      ]);
      break;
    }
  }

  const highlightedTerms = uniqueTerms.filter((entry) =>
    Array.from(highlightsByBlockId.values()).some((placements) =>
      placements.some((placement) => placement.key === entry.key),
    ),
  );

  return {
    highlightsByBlockId,
    diagnostics: {
      totalGlossaryTerms: 0,
      highlightableTermsCount: uniqueTerms.length,
      highlightTokensCount: glossaryTokens.length,
      uniqueHighlightedNormalizedTermsCount: highlightedTerms.length,
      suppressedDuplicateCount: 0,
      suppressedFragmentCount: 0,
      suppressedNoisyVariantCount: 0,
      pendingHighlightCount: highlightedTerms.filter(
        (entry) => entry.term.explanationStatus !== "ready",
      ).length,
      readyHighlightCount: highlightedTerms.filter(
        (entry) => entry.term.explanationStatus === "ready",
      ).length,
    },
  };
}

export default function KnowledgePackClient({ item }: KnowledgePackClientProps) {
  const [glossaryTerms, setGlossaryTerms] = useState(item.glossaryTerms);
  const [activeNavId, setActiveNavId] = useState("content-meta");
  const [activeSectionId, setActiveSectionId] = useState(
    item.sections[0]?.id ?? "",
  );
  const [highlightedBlockId, setHighlightedBlockId] = useState("");
  const [hoveringTermId, setHoveringTermId] = useState("");
  const [selectionState, setSelectionState] = useState<TextSelectionState | null>(null);
  const [isAddingSelection, setIsAddingSelection] = useState(false);
  const [feedbackLoadingTermId, setFeedbackLoadingTermId] = useState("");
  const [activeTooltipTermId, setActiveTooltipTermId] = useState("");
  const [tooltipCloseTimer, setTooltipCloseTimer] = useState<number | null>(null);
  const [selectionDebug, setSelectionDebug] = useState<SelectionDebugState | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptTextRootRef = useRef<HTMLDivElement | null>(null);
  const selectionPopoverOpenedAtRef = useRef(0);
  const glossaryEventLogRef = useRef<Map<string, number>>(new Map());
  const selectionPointerStateRef = useRef<{
    startedInsideTranscript: boolean;
    startBlockId: string | null;
  }>({
    startedInsideTranscript: false,
    startBlockId: null,
  });

  const sections = useMemo(
    () => [...item.sections].sort((first, second) => first.order - second.order),
    [item.sections],
  );
  const glossaryHighlightModel = useMemo(
    () => buildGlossaryTokens(glossaryTerms),
    [glossaryTerms],
  );
  const highlightPlan = useMemo(() => {
    const result = buildHighlightPlan(item.transcriptBlocks, glossaryHighlightModel.tokens);

    return {
      highlightsByBlockId: result.highlightsByBlockId,
      diagnostics: {
        ...result.diagnostics,
        totalGlossaryTerms: glossaryTerms.length,
        highlightableTermsCount: glossaryHighlightModel.terms.length,
        suppressedDuplicateCount:
          glossaryHighlightModel.diagnostics.suppressedDuplicateCount,
        suppressedFragmentCount:
          glossaryHighlightModel.diagnostics.suppressedFragmentCount,
        suppressedNoisyVariantCount:
          glossaryHighlightModel.diagnostics.suppressedNoisyVariantCount,
      },
    };
  }, [glossaryHighlightModel, glossaryTerms.length, item.transcriptBlocks]);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.log("[KnowledgePackClient] glossary highlight diagnostics", {
      contentId: item.id,
      ...highlightPlan.diagnostics,
    });
  }, [highlightPlan.diagnostics, item.id]);
  const highlightsByBlockId = useMemo(
    () => highlightPlan.highlightsByBlockId,
    [highlightPlan.highlightsByBlockId],
  );
  const sectionGroups = useMemo(
    () => groupTranscriptBlocksBySections(sections, item.transcriptBlocks),
    [item.transcriptBlocks, sections],
  );
  const blockSectionMap = useMemo(() => {
    const entries = sectionGroups.flatMap(({ section, blocks }) =>
      blocks.map((block) => [block.id, section] as const),
    );

    return new Map(entries);
  }, [sectionGroups]);

  const clearHighlightLater = () => {
    window.setTimeout(() => {
      setHighlightedBlockId("");
    }, highlightDuration);
  };

  const clearTooltipCloseTimer = useCallback(() => {
    if (tooltipCloseTimer !== null) {
      window.clearTimeout(tooltipCloseTimer);
      setTooltipCloseTimer(null);
    }
  }, [tooltipCloseTimer]);

  const logGlossaryEvent = useCallback((
    term: GlossaryTerm,
    eventType: "term_hovered" | "tooltip_opened",
    metadata: Record<string, unknown> = {},
  ) => {
    const eventKey = `${eventType}:${term.id}`;
    const now = Date.now();
    const previousLoggedAt = glossaryEventLogRef.current.get(eventKey) ?? 0;

    if (now - previousLoggedAt < 1200) {
      return;
    }

    glossaryEventLogRef.current.set(eventKey, now);
    void fetch("/api/glossary/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      body: JSON.stringify({
        contentId: item.id,
        glossaryTermId: term.termId || "",
        contentGlossaryTermId: term.contentGlossaryTermId || term.id,
        eventType,
        eventSource: "user",
        metadata: {
          term: term.term,
          normalizedTerm: term.normalizedTerm,
          ...metadata,
        },
      }),
    }).catch((error) => {
      console.error("[KnowledgePackClient] failed to log glossary event", error);
    });
  }, [item.id]);

  const closeTooltipImmediately = useCallback(() => {
    clearTooltipCloseTimer();
    setActiveTooltipTermId("");
  }, [clearTooltipCloseTimer]);

  const scheduleTooltipClose = useCallback(() => {
    clearTooltipCloseTimer();
    const nextTimer = window.setTimeout(() => {
      setActiveTooltipTermId("");
      setTooltipCloseTimer(null);
    }, 180);
    setTooltipCloseTimer(nextTimer);
  }, [clearTooltipCloseTimer]);

  const scrollToElement = (elementId: string) => {
    document.getElementById(elementId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const jumpToNav = (navId: string) => {
    setActiveNavId(navId);
    scrollToElement(navId);
  };

  const jumpToSection = (section: Section) => {
    setActiveNavId("content-transcript");
    setActiveSectionId(section.id);
    setHighlightedBlockId(section.startBlockId);
    scrollToElement(createSectionAnchorId(section.id));

    if (section.startBlockId) {
      clearHighlightLater();
    }
  };

  const jumpToTranscript = (blockId: string, sectionId?: string) => {
    setActiveNavId("content-transcript");
    if (sectionId) {
      setActiveSectionId(sectionId);
    }
    setHighlightedBlockId(blockId);
    scrollToElement(blockId);
    clearHighlightLater();
  };

  const findSectionByBlockId = (blockId: string) =>
    blockSectionMap.get(blockId) ??
    sections.find((section) =>
      [
        section.startBlockId,
        section.endBlockId,
        ...(section.evidenceBlockIds ?? []),
      ].includes(blockId),
    );

  const locateGlossaryTerm = (term: GlossaryTerm) => {
    const blockId = getGlossaryAnchorBlockId(term);

    if (!blockId) {
      return;
    }

    const relatedSection = findSectionByBlockId(blockId);
    jumpToTranscript(blockId, relatedSection?.id);
  };

  const replaceGlossaryTerm = (nextTerm: GlossaryTerm) => {
    setGlossaryTerms((current) => {
      const existingIndex = current.findIndex((term) => term.id === nextTerm.id);

      if (existingIndex === -1) {
        return [...current, nextTerm];
      }

      return current.map((term) => (term.id === nextTerm.id ? nextTerm : term));
    });
  };

  const triggerGlossaryExplain = async (
    term: GlossaryTerm,
    requestSource: "generate_button" | "retry_button" = "generate_button",
  ) => {
    const status = term.explanationStatus ?? "pending";

    if (!isGlossaryTermHighlightEnabled(term)) {
      return;
    }

    if (status === "ready" || status === "generating" || hoveringTermId === term.id) {
      return;
    }

    setActiveTooltipTermId(term.id);
    clearTooltipCloseTimer();
    setHoveringTermId(term.id);
    replaceGlossaryTerm({
      ...term,
      explanationStatus: "generating",
    });

    try {
      const response = await fetch("/api/glossary/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId: item.id,
          termId: term.termId || term.id,
          contentGlossaryTermId: term.contentGlossaryTermId || "",
          term: term.term,
          requestSource,
        }),
      });
      const payload = (await response.json()) as {
        glossaryTerm?: GlossaryTerm;
      };

      if (payload.glossaryTerm) {
        replaceGlossaryTerm(payload.glossaryTerm);
        setActiveTooltipTermId(payload.glossaryTerm.id);
      } else {
        replaceGlossaryTerm({
          ...term,
          explanationStatus: "failed",
        });
      }
    } catch {
      replaceGlossaryTerm({
        ...term,
        explanationStatus: "failed",
      });
    } finally {
      setHoveringTermId("");
    }
  };

  const submitGlossaryFeedback = async (
    term: GlossaryTerm,
    action: GlossaryFeedbackAction,
  ) => {
    if (feedbackLoadingTermId === term.id) {
      return;
    }

    const optimisticTerm: GlossaryTerm =
      action === "star"
        ? {
            ...term,
            isStarred: true,
            userFeedback: "starred",
            highlightEnabled: true,
            displayStatus: "highlighted",
            displayReason: "user_starred",
            hiddenReason: undefined,
          }
        : action === "hide"
          ? {
              ...term,
              isStarred: false,
              userFeedback: "hidden",
              highlightEnabled: false,
              displayStatus: "hidden",
              hiddenReason: "user_feedback",
            }
          : {
              ...term,
              userFeedback: "incorrect",
            };

    setFeedbackLoadingTermId(term.id);
    replaceGlossaryTerm(optimisticTerm);
    if (action === "hide") {
      closeTooltipImmediately();
    }

    try {
      const response = await fetch("/api/glossary/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId: item.id,
          termId: term.termId || term.id,
          action,
        }),
      });
      const payload = (await response.json()) as {
        glossaryTerm?: GlossaryTerm;
      };

      if (payload.glossaryTerm) {
        replaceGlossaryTerm(payload.glossaryTerm);
        if (payload.glossaryTerm.displayStatus !== "hidden") {
          setActiveTooltipTermId(payload.glossaryTerm.id);
        }
      } else {
        replaceGlossaryTerm(term);
      }
    } catch {
      replaceGlossaryTerm(term);
    } finally {
      setFeedbackLoadingTermId("");
    }
  };

  const closeSelectionPopover = useCallback(() => {
    setSelectionState(null);
  }, []);

  const reportSelectionDebug = useCallback((debug: SelectionDebugState) => {
    setSelectionDebug(debug);

    if (process.env.NODE_ENV === "development") {
      console.debug("[KnowledgePackClient] selection debug", debug);
    }
  }, []);

  const computeSelectionState = useCallback((trigger: string, eventTarget?: EventTarget | null) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    const transcriptContainer = transcriptTextRootRef.current;
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const commonElement = range ? toElement(range.commonAncestorContainer) : null;
    const whetherInsideTranscriptContainer = Boolean(
      transcriptContainer && commonElement && transcriptContainer.contains(commonElement),
    );
    const rangeRect =
      range && selection && !selection.isCollapsed
        ? range.getBoundingClientRect()
        : null;
    const blockLookup =
      selection && range
        ? findTranscriptBlockIdFromSources({
            selection,
            range,
            eventTarget,
          })
        : { blockId: null, foundByClosest: null };

    const buildDebug = (
      rejectReason: string | null,
      popoverOpen: boolean,
      popoverPosition?: { top: number; left: number } | null,
    ): SelectionDebugState => ({
      trigger,
      selectionText: selectedText,
      selectionTextLength: selectedText.length,
      selectionRangeCount: selection?.rangeCount ?? 0,
      anchorNodeName: getNodeName(selection?.anchorNode),
      anchorPreview: getNodePreview(selection?.anchorNode),
      focusNodeName: getNodeName(selection?.focusNode),
      focusPreview: getNodePreview(selection?.focusNode),
      commonAncestorName: getNodeName(range?.commonAncestorContainer),
      whetherInsideTranscriptContainer,
      foundTranscriptBlockId: blockLookup.blockId,
      foundBlockByClosest: blockLookup.foundByClosest,
      rangeRect: rangeRect
        ? {
            top: rangeRect.top,
            left: rangeRect.left,
            width: rangeRect.width,
            height: rangeRect.height,
          }
        : null,
      popoverOpen,
      popoverTop: popoverOpen ? popoverPosition?.top ?? null : null,
      popoverLeft: popoverOpen ? popoverPosition?.left ?? null : null,
      popoverRendered: popoverOpen,
      rejectReason,
    });

    if (!selection || selection.rangeCount === 0 || !transcriptContainer) {
      reportSelectionDebug(buildDebug("missing_selection_or_container", false));
      closeSelectionPopover();
      return null;
    }

    if (selection.isCollapsed) {
      reportSelectionDebug(buildDebug("selection_collapsed", false));
      closeSelectionPopover();
      return null;
    }

    if (!whetherInsideTranscriptContainer) {
      reportSelectionDebug(buildDebug("selection_outside_transcript", false));
      closeSelectionPopover();
      return null;
    }

    const manualValidation = isValidManualGlossarySelection(selectedText);

    if (!manualValidation.ok) {
      reportSelectionDebug(buildDebug(manualValidation.reason, false));
      closeSelectionPopover();
      return null;
    }

    const selectionRange = range!;

    const anchorBlockId = findTranscriptBlockIdFromSources({
      selection,
      range: selectionRange,
      eventTarget: selection.anchorNode,
    }).blockId;
    const focusBlockId = findTranscriptBlockIdFromSources({
      selection,
      range: selectionRange,
      eventTarget: selection.focusNode,
    }).blockId;

    if (!anchorBlockId || !focusBlockId || anchorBlockId !== focusBlockId) {
      reportSelectionDebug(buildDebug("cross_block_selection", false));
      closeSelectionPopover();
      return null;
    }

    const selectionText = selection.toString();
    const normalizedSelectedText = selectedText.replace(/\s+/g, " ");
    const lineBreakCount = (selectionText.match(/\n/g) ?? []).length;

    if (lineBreakCount > 2) {
      reportSelectionDebug(buildDebug("selection_spans_too_many_lines", false));
      closeSelectionPopover();
      return {
        term: selectedText,
        blockId: blockLookup.blockId,
        startOffset: 0,
        endOffset: selectedText.length,
        contextBefore: "",
        contextAfter: "",
        x: 0,
        y: 0,
        error: "当前选择跨度过大，请尽量在单个段落内选择术语。",
      } satisfies TextSelectionState;
    }

    const block =
      (blockLookup.blockId
        ? item.transcriptBlocks.find((entry) => entry.id === blockLookup.blockId)
        : undefined) ??
      item.transcriptBlocks.find((entry) => selectedText && entry.text.includes(selectedText));
    const rawIndex = block?.text.indexOf(selectedText) ?? -1;
    const compactIndex =
      rawIndex >= 0
        ? rawIndex
        : block?.text.replace(/\s+/g, " ").indexOf(normalizedSelectedText) ?? -1;
    const startOffset = Math.max(0, compactIndex >= 0 ? compactIndex : 0);
    const endOffset = startOffset + selectedText.length;
    const viewportCenterX = (rangeRect?.left ?? 0) + (rangeRect?.width ?? 0) / 2;
    const aboveTop = (rangeRect?.top ?? 0) - 84;
    const belowTop = (rangeRect?.bottom ?? 0) + 12;
    const y = aboveTop >= 16 ? aboveTop : belowTop;
    const x = viewportCenterX;
    reportSelectionDebug(buildDebug(null, true, { top: y, left: x }));

    return {
      term: selectedText,
      blockId: anchorBlockId,
      startOffset,
      endOffset,
      contextBefore:
        block && startOffset > 0
          ? block.text.slice(Math.max(0, startOffset - 30), startOffset)
          : "",
      contextAfter:
        block && endOffset < block.text.length
          ? block.text.slice(endOffset, Math.min(block.text.length, endOffset + 30))
          : "",
      x,
      y,
    } satisfies TextSelectionState;
  }, [closeSelectionPopover, item.transcriptBlocks, reportSelectionDebug]);

  const captureTextSelection = useCallback((event?: React.MouseEvent | MouseEvent) => {
    window.setTimeout(() => {
      const pointerState = selectionPointerStateRef.current;
      const targetElement =
        event?.target instanceof Node ? toElement(event.target) : null;
      const endInsideTranscript = Boolean(
        targetElement && transcriptTextRootRef.current?.contains(targetElement),
      );
      const endBlockId =
        targetElement?.closest<HTMLElement>("[data-transcript-block-id]")?.dataset
          .transcriptBlockId ?? null;

      if (
        !pointerState.startedInsideTranscript ||
        !endInsideTranscript ||
        !pointerState.startBlockId ||
        !endBlockId ||
        pointerState.startBlockId !== endBlockId
      ) {
        reportSelectionDebug({
          trigger: "mouseup",
          selectionText: window.getSelection()?.toString().trim() ?? "",
          selectionTextLength: (window.getSelection()?.toString().trim() ?? "").length,
          selectionRangeCount: window.getSelection()?.rangeCount ?? 0,
          anchorNodeName: getNodeName(window.getSelection()?.anchorNode),
          anchorPreview: getNodePreview(window.getSelection()?.anchorNode),
          focusNodeName: getNodeName(window.getSelection()?.focusNode),
          focusPreview: getNodePreview(window.getSelection()?.focusNode),
          commonAncestorName: getNodeName(
            window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0).commonAncestorContainer : null,
          ),
          whetherInsideTranscriptContainer: endInsideTranscript,
          foundTranscriptBlockId: endBlockId,
          foundBlockByClosest: endBlockId,
          rangeRect: null,
          popoverOpen: false,
          popoverTop: null,
          popoverLeft: null,
          popoverRendered: false,
          rejectReason: !pointerState.startedInsideTranscript || !endInsideTranscript
            ? "selection_outside_transcript"
            : "cross_block_selection",
        });
        closeSelectionPopover();
        window.getSelection()?.removeAllRanges();
        return;
      }

      const nextSelectionState = computeSelectionState("mouseup", event?.target ?? null);

      if (!nextSelectionState) {
        closeSelectionPopover();
        window.getSelection()?.removeAllRanges();
        return;
      }

      selectionPopoverOpenedAtRef.current = Date.now();
      closeTooltipImmediately();
      setSelectionState(nextSelectionState);
      window.getSelection()?.removeAllRanges();
    }, 0);
  }, [closeSelectionPopover, closeTooltipImmediately, computeSelectionState, reportSelectionDebug]);

  const handleTranscriptPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const targetElement =
      event.target instanceof Node ? toElement(event.target) : null;

    if (targetElement?.closest("[data-no-selection-popover='true']")) {
      selectionPointerStateRef.current = {
        startedInsideTranscript: false,
        startBlockId: null,
      };
      return;
    }

    const blockId =
      targetElement?.closest<HTMLElement>("[data-transcript-block-id]")?.dataset
        .transcriptBlockId ?? null;

    selectionPointerStateRef.current = {
      startedInsideTranscript: Boolean(blockId),
      startBlockId: blockId,
    };
  }, []);

  const addSelectionToGlossary = async () => {
    if (!selectionState || isAddingSelection) {
      return;
    }

    if (selectionState.error) {
      return;
    }

    setIsAddingSelection(true);
    setSelectionState((current) =>
      current
        ? {
            ...current,
            error: undefined,
          }
        : current,
    );

    try {
      const response = await fetch("/api/glossary/terms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentId: item.id,
          selectedText: selectionState.term,
          blockId: selectionState.blockId || "",
          startOffset: selectionState.startOffset,
          endOffset: selectionState.endOffset,
          contextBefore: selectionState.contextBefore,
          contextAfter: selectionState.contextAfter,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        glossaryTerm?: GlossaryTerm;
      };

      if (payload.glossaryTerm) {
        replaceGlossaryTerm(payload.glossaryTerm);
        if (payload.glossaryTerm.highlightEnabled || payload.glossaryTerm.displayStatus === "highlighted") {
          setActiveTooltipTermId(payload.glossaryTerm.id);
        }
        setSelectionState(null);
        window.getSelection()?.removeAllRanges();
        void triggerGlossaryExplain(
          payload.glossaryTerm,
          "generate_button",
        );
      } else {
        setSelectionState((current) =>
          current
            ? {
                ...current,
                error: payload.message || "添加术语失败，请重试。",
              }
            : current,
        );
      }
    } catch {
      setSelectionState((current) =>
        current
          ? {
              ...current,
              error: "添加术语失败，请重试。",
            }
          : current,
      );
    } finally {
      setIsAddingSelection(false);
    }
  };

  const handleTermMouseEnter = useCallback(
    (term: GlossaryTerm) => {
      clearTooltipCloseTimer();
      setActiveTooltipTermId(term.id);
      logGlossaryEvent(term, "term_hovered");
      logGlossaryEvent(term, "tooltip_opened");
    },
    [clearTooltipCloseTimer, logGlossaryEvent],
  );

  const handleTooltipMouseEnter = useCallback(() => {
    clearTooltipCloseTimer();
  }, [clearTooltipCloseTimer]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed) {
        if (process.env.NODE_ENV === "development") {
          reportSelectionDebug({
            trigger: "selectionchange",
            selectionText: "",
            selectionTextLength: 0,
            selectionRangeCount: selection?.rangeCount ?? 0,
            anchorNodeName: getNodeName(selection?.anchorNode),
            anchorPreview: getNodePreview(selection?.anchorNode),
            focusNodeName: getNodeName(selection?.focusNode),
            focusPreview: getNodePreview(selection?.focusNode),
            commonAncestorName: "",
            whetherInsideTranscriptContainer: false,
            foundTranscriptBlockId: null,
            foundBlockByClosest: null,
            rangeRect: null,
            popoverOpen: false,
            popoverTop: null,
            popoverLeft: null,
            popoverRendered: false,
            rejectReason: "selection_collapsed",
          });
        }
        return;
      }

      computeSelectionState("selectionchange");
    };

    const handleDocumentMouseDown = (event: MouseEvent) => {
      if (Date.now() - selectionPopoverOpenedAtRef.current < 200) {
        return;
      }

      const target = event.target as Node | null;

      if (target) {
        const selectionPopover = document.getElementById("selection-popover");
        const targetElement =
          target.nodeType === Node.ELEMENT_NODE
            ? (target as Element)
            : target.parentElement;

        if (
          selectionPopover?.contains(target) ||
          targetElement?.closest("[data-no-selection-popover='true']") ||
          targetElement?.closest("[data-glossary-marker]") ||
          targetElement?.closest("[data-glossary-tooltip]")
        ) {
          return;
        }
      }

      closeSelectionPopover();
      closeTooltipImmediately();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSelectionPopover();
        closeTooltipImmediately();
        window.getSelection()?.removeAllRanges();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      clearTooltipCloseTimer();
    };
  }, [
    clearTooltipCloseTimer,
    closeSelectionPopover,
    closeTooltipImmediately,
    computeSelectionState,
    reportSelectionDebug,
    selectionState,
  ]);

  return (
    <article className="grid gap-7 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
      {selectionState ? (
        <div
          className="fixed z-[120] w-[320px] max-w-[calc(100vw-24px)] -translate-x-1/2 rounded-xl border border-line bg-white px-4 py-4 text-ink shadow-2xl"
          id="selection-popover"
          data-no-selection-popover="true"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          style={{
            left: `clamp(24px, ${selectionState.x}px, calc(100vw - 24px))`,
            top: Math.max(16, selectionState.y),
          }}
        >
          <p className="text-xs font-semibold tracking-wide text-muted">添加为术语</p>
          <p className="mt-2 text-base font-semibold leading-6 text-ink">
            {selectionState.term}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted">
            将该文本加入 Glossary，并生成解释。
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              className="flex-1 rounded-lg border border-sage/30 bg-sage px-3 py-2 text-sm font-semibold text-white transition hover:bg-sage/90 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={addSelectionToGlossary}
              disabled={isAddingSelection}
            >
              {isAddingSelection ? "正在添加..." : "添加并生成解释"}
            </button>
            <button
              className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted transition hover:bg-panel"
              type="button"
              onClick={() => {
                closeSelectionPopover();
                window.getSelection()?.removeAllRanges();
              }}
              disabled={isAddingSelection}
            >
              取消
            </button>
          </div>
          {selectionState.error ? (
            <p className="mt-3 text-xs text-coral">{selectionState.error}</p>
          ) : null}
          {isAddingSelection ? (
            <p className="mt-3 text-[11px] text-muted">正在将该文本加入术语表...</p>
          ) : null}
        </div>
      ) : null}
      {process.env.NODE_ENV === "development" && selectionDebug ? (
        <div
          className="fixed bottom-4 right-4 z-[95] max-w-[320px] rounded-xl border border-line bg-white/95 p-3 text-[11px] leading-5 text-muted shadow-xl"
          data-no-selection-popover="true"
        >
          <p className="font-semibold text-ink">Selection debug</p>
          <p>selectedText: {selectionDebug.selectionText || "(empty)"}</p>
          <p>rejectReason: {selectionDebug.rejectReason || "accepted"}</p>
          <p>foundBlockId: {selectionDebug.foundTranscriptBlockId || "(none)"}</p>
          <p>insideTranscript: {selectionDebug.whetherInsideTranscriptContainer ? "true" : "false"}</p>
          <p>popoverOpen: {selectionState ? "true" : "false"}</p>
          <p>popoverTop: {selectionState?.y ?? selectionDebug.popoverTop ?? "(none)"}</p>
          <p>popoverLeft: {selectionState?.x ?? selectionDebug.popoverLeft ?? "(none)"}</p>
          <p>popoverRendered: {selectionState ? "true" : "false"}</p>
        </div>
      ) : null}
      <aside className="kb-card p-5 lg:sticky lg:top-6">
        <h2 className="text-lg font-semibold text-ink">目录</h2>
        <nav className="mt-4 grid gap-1">
          {navItems.map((navItem) => {
            const isActive = navItem.id === activeNavId;

            return (
              <button
                className={`rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${
                  isActive
                    ? "bg-sage/10 text-sage"
                    : "text-ink hover:bg-panel"
                }`}
                key={navItem.id}
                type="button"
                onClick={() => jumpToNav(navItem.id)}
              >
                {navItem.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-3 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
          <div className="grid gap-1 border-l border-line pl-3">
          {sections.map((section) => {
            const isActive = section.id === activeSectionId;

            return (
              <button
                className={`rounded-lg px-3 py-2 text-left transition ${
                  isActive
                    ? "bg-sage/10 text-sage"
                    : "text-muted hover:bg-panel hover:text-ink"
                }`}
                key={section.id}
                type="button"
                onClick={() => jumpToSection(section)}
              >
                <span className="block text-xs font-semibold">
                  {section.startTimestamp}
                  {section.endTimestamp ? ` - ${section.endTimestamp}` : ""}
                </span>
                <span className="mt-1 line-clamp-2 block text-sm font-medium leading-5">
                  {section.title}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      </aside>

      <div className="space-y-7">
        <section className="kb-card scroll-mt-6 p-6 sm:p-8" id="content-meta">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sage/10 px-3 py-1 text-xs font-semibold text-sage">
              {item.sourcePlatform}
            </span>
            <span className="rounded-full bg-coral/10 px-3 py-1 text-xs font-semibold text-coral">
              已解析
            </span>
          </div>
          <h1 className="max-w-4xl text-3xl font-bold leading-tight text-ink sm:text-4xl">
            {item.title}
          </h1>

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted">来源链接</dt>
              <dd className="mt-1 break-all font-medium text-ink">
                <a href={item.sourceUrl}>{item.sourceUrl}</a>
              </dd>
            </div>
            <div>
              <dt className="text-muted">作者</dt>
              <dd className="mt-1 font-medium text-ink">{item.author}</dd>
            </div>
            <div>
              <dt className="text-muted">发布时间</dt>
              <dd className="mt-1 font-medium text-ink">{item.publishedAt}</dd>
            </div>
            <div>
              <dt className="text-muted">解析时间</dt>
              <dd className="mt-1 font-medium text-ink">{item.parsedAt}</dd>
            </div>
          </dl>
        </section>

        <section className="kb-card scroll-mt-6 p-6" id="content-summary">
          <p className="kb-label mb-3">内容摘要</p>
          <p className="text-base leading-7 text-ink">{item.summary}</p>
        </section>

        <section className="kb-card p-6 lg:hidden">
          <p className="kb-label mb-3">目录</p>
          <div className="grid gap-2">
            {navItems.map((navItem) => (
              <button
                className={`rounded-lg border p-3 text-left text-sm font-semibold transition ${
                  navItem.id === activeNavId
                    ? "border-sage bg-sage/10 text-sage"
                    : "border-line bg-white text-ink"
                }`}
                key={navItem.id}
                type="button"
                onClick={() => jumpToNav(navItem.id)}
              >
                {navItem.label}
              </button>
            ))}
            {sections.map((section) => (
              <button
                className={`ml-4 rounded-lg border p-3 text-left transition ${
                  section.id === activeSectionId
                    ? "border-sage bg-sage/10"
                    : "border-line bg-white"
                }`}
                key={section.id}
                type="button"
                onClick={() => jumpToSection(section)}
              >
                <span className="text-xs font-semibold text-sage">
                  {section.startTimestamp}
                  {section.endTimestamp ? ` - ${section.endTimestamp}` : ""}
                </span>
                <span className="mt-1 line-clamp-2 block text-sm font-semibold leading-5 text-ink">
                  {section.title}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="kb-card scroll-mt-6 p-6" id="content-keywords">
          <p className="kb-label mb-4">Top 5 关键词</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {item.keywords.slice(0, 5).map((keyword) => (
              <div className="rounded-lg border border-line p-4" key={keyword.term}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-ink">
                    {keyword.term}
                  </h2>
                  <button
                    className="text-sm font-semibold text-sage hover:text-coral"
                    type="button"
                    onClick={() => {
                      const relatedSection = findSectionByBlockId(
                        keyword.evidenceBlockId,
                      );
                      jumpToTranscript(
                        keyword.evidenceBlockId,
                        relatedSection?.id,
                      );
                    }}
                  >
                    定位原文
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {keyword.explanation}
                </p>
                <p className="mt-3 rounded-lg bg-panel p-3 text-sm leading-6 text-ink">
                  语境示例：{keyword.context}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="kb-card scroll-mt-6 p-6" id="content-transcript">
          <p className="kb-label mb-4">逐字稿 / 文章</p>
          <div
            className="grid gap-3"
            ref={transcriptContainerRef}
          >
            <div
              className="grid gap-3"
              ref={transcriptTextRootRef}
              onPointerDown={handleTranscriptPointerDown}
              onPointerUp={captureTextSelection}
            >
            {sectionGroups.length > 0
              ? sectionGroups.map(({ section, blocks }) => (
                  <div
                    className="grid gap-3"
                    id={createSectionAnchorId(section.id)}
                    key={section.id}
                  >
                    <div className="scroll-mt-6 border-l-4 border-sage bg-sage/5 p-4">
                      <div className="mb-1 text-xs font-semibold text-sage">
                        {formatSectionRange(section)}
                      </div>
                      <h2 className="font-semibold text-ink">{section.title}</h2>
                      {shouldShowSectionSummary(section) ? (
                        <p className="mt-2 text-sm italic leading-6 text-muted">
                          {section.summary}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm italic leading-6 text-muted">
                          暂无章节摘要
                        </p>
                      )}
                    </div>

                    {blocks.map((block) => {
                      const isHighlighted = highlightedBlockId === block.id;

                      return (
                        <div
                          className={`scroll-mt-6 rounded-lg border p-4 transition ${
                            isHighlighted
                              ? "border-sage bg-sage/10"
                              : "border-line bg-white"
                          }`}
                          data-transcript-block-id={block.id}
                          id={block.id}
                          key={block.id}
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-semibold text-sage">
                              {block.time}
                            </span>
                            {block.speaker ? (
                              <span className="rounded-full bg-panel px-3 py-1 text-muted">
                                {block.speaker}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-sm leading-7 text-ink">
                            <MarkedText
                              text={block.text}
                              highlights={highlightsByBlockId.get(block.id) ?? []}
                              onLocate={locateGlossaryTerm}
                              onRequestExplain={triggerGlossaryExplain}
                              onFeedback={submitGlossaryFeedback}
                              activeTooltipTermId={activeTooltipTermId}
                              onTermMouseEnter={handleTermMouseEnter}
                              onTermMouseLeave={scheduleTooltipClose}
                              onTooltipMouseEnter={handleTooltipMouseEnter}
                              onTooltipMouseLeave={scheduleTooltipClose}
                            />
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ))
              : item.transcriptBlocks.map((block) => {
                  const isHighlighted = highlightedBlockId === block.id;

                  return (
                    <div
                      className={`scroll-mt-6 rounded-lg border p-4 transition ${
                        isHighlighted
                          ? "border-sage bg-sage/10"
                          : "border-line bg-white"
                      }`}
                      data-transcript-block-id={block.id}
                      id={block.id}
                      key={block.id}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
                        <span className="font-semibold text-sage">{block.time}</span>
                        {block.speaker ? (
                          <span className="rounded-full bg-panel px-3 py-1 text-muted">
                            {block.speaker}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-7 text-ink">
                        <MarkedText
                          text={block.text}
                          highlights={highlightsByBlockId.get(block.id) ?? []}
                          onLocate={locateGlossaryTerm}
                          onRequestExplain={triggerGlossaryExplain}
                          onFeedback={submitGlossaryFeedback}
                          activeTooltipTermId={activeTooltipTermId}
                          onTermMouseEnter={handleTermMouseEnter}
                          onTermMouseLeave={scheduleTooltipClose}
                          onTooltipMouseEnter={handleTooltipMouseEnter}
                          onTooltipMouseLeave={scheduleTooltipClose}
                        />
                      </p>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
