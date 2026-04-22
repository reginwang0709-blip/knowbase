import type { Section, TranscriptBlock } from "@/lib/mock-data";

const transcriptCandidateKeys = new Set([
  "transcript",
  "transcripts",
  "transcription",
  "transcripttext",
  "caption",
  "captions",
  "subtitle",
  "subtitles",
  "subtitlestext",
  "segments",
  "utterances",
  "sentences",
  "逐字稿",
  "字幕",
  "转写",
  "转录",
  "文稿",
  "全文",
]);

type CandidateMatch = {
  key: string;
  text: string;
};

export type TranscriptSourceDecision = {
  source: "existing_transcript" | "asr_required" | "none";
  reason: string;
  transcriptText?: string;
  transcriptBlocks?: TranscriptBlock[];
};

type TimestampSectionSeed = {
  title: string;
  summary: string;
  startTimestamp: string;
  order: number;
};

type ShownotesSectionsDecision = {
  source: "shownotes" | "llm_fallback_required";
  reason?: string;
  sections: Section[];
};

const TIMELINE_START_MARKERS = [
  "时间线",
  "时间轴",
  "本期时间线",
  "本期目录",
  "时间戳",
  "Shownotes",
  "Show notes",
  "Timeline",
  "Chapters",
  "Timestamps",
];

const NON_TIMELINE_SECTION_MARKERS = [
  "剪辑",
  "后期",
  "主播",
  "嘉宾",
  "制作",
  "出品",
  "Staff",
  "Credits",
  "Production",
  "相关链接",
  "参考链接",
  "延伸阅读",
  "资料链接",
  "References",
  "Links",
  "Resources",
  "欢迎",
  "评论区",
  "公众号",
  "听友群",
  "加入群",
  "社群",
  "订阅",
  "收听",
  "关注我们",
  "商务合作",
  "赞助",
  "Support",
  "Subscribe",
  "Follow us",
  "Apple Podcast",
  "Spotify",
  "小宇宙",
  "喜马拉雅",
  "YouTube",
  "B站",
  "声明",
];

const TITLE_STOP_MARKERS = [
  "剪辑：",
  "剪辑:",
  "后期：",
  "后期:",
  "制作：",
  "制作:",
  "出品：",
  "出品:",
  "相关链接",
  "参考链接",
  "延伸阅读",
  "资料链接",
  "References",
  "Links",
  "Resources",
  "欢迎",
  "评论区",
  "公众号",
  "听友群",
  "加入群",
  "社群",
  "订阅",
  "收听",
  "关注我们",
  "商务合作",
  "Support",
  "Subscribe",
  "Follow us",
  "Apple Podcast",
  "Spotify",
  "小宇宙",
  "喜马拉雅",
  "YouTube",
  "B站",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function removeLinkOnlyLines(value: string) {
  return value
    .split(/\n+/)
    .filter((line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return false;
      }

      return !/^(https?:\/\/|www\.)\S+$/i.test(trimmed);
    })
    .join("\n");
}

function removeObviousNavigation(value: string) {
  return value
    .replace(/听播客，上小宇宙[！!]?/g, " ")
    .replace(/点击下载/g, " ")
    .replace(/在小宇宙打开/g, " ");
}

export function hasManyTimestamps(text: string) {
  const matches =
    text.match(
      /(?:\[\d{2}:\d{2}(?::\d{2})?\]|\b\d{2}:\d{2}(?::\d{2})?(?:\s+\S{1,12}[：:])?)/g,
    ) ?? [];

  return matches.length >= 3;
}

export function cleanTranscriptLikeText(text: string) {
  return removeObviousNavigation(removeLinkOnlyLines(stripHtml(text)))
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(text: string, maxLength = 200) {
  const normalized = text.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function normalizeTimestamp(raw: string) {
  const parts = raw.split(":").map((part) => part.trim());

  if (parts.some((part) => !/^\d+$/.test(part))) {
    return "";
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;

    return `${minutes.padStart(2, "0")}:${seconds.padStart(2, "0")}`;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;

    return [hours, minutes, seconds]
      .map((part) => part.padStart(2, "0"))
      .join(":");
  }

  return "";
}

function timestampToSeconds(value?: string) {
  if (!value) {
    return null;
  }

  const normalized = normalizeTimestamp(value);

  if (!normalized) {
    return null;
  }

  const parts = normalized.split(":").map((part) => Number(part));

  if (parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

function normalizeSpeakerLabel(speaker: string) {
  const trimmed = speaker.trim();

  if (!trimmed) {
    return "";
  }

  if (/^说话人(?:\s*\d+)?$/.test(trimmed)) {
    return "说话人";
  }

  return trimmed;
}

function cleanSectionDelimiterText(value: string) {
  return value
    .replace(/^[\-\-—–:：·•\s]+/, "")
    .replace(/[\-\-—–:：·•\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMarkerRegex(markers: string[]) {
  return new RegExp(`(?:${markers.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i");
}

function findTimelineStartIndex(text: string) {
  const patterns = [
    /(?:^|[\n\s])(?:本期时间线|本期目录|时间线|时间轴|时间戳)\s*[:：]/i,
    /(?:^|[\n\s])(?:Shownotes|Show notes|Timeline|Chapters|Timestamps)\s*[:：]/i,
    /(?:^|\n)\s*(?:本期时间线|本期目录|时间线|时间轴|时间戳|Shownotes|Show notes|Timeline|Chapters|Timestamps)\b/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);

    if (match && typeof match.index === "number") {
      return match.index + match[0].length;
    }
  }

  return -1;
}

function buildTimestampLineRegex() {
  return /^\s*(?:\[(\d{2}:\d{2}(?::\d{2})?)\]|(\d{2}:\d{2}(?::\d{2})?))(?:\s*[-—–:：｜|]\s*|\s+)(.+?)\s*$/;
}

function isHighConfidenceTimestampLine(line: string) {
  const pattern = buildTimestampLineRegex();

  if (pattern.test(line.trim())) {
    return true;
  }

  return /\b\d{2}:\d{2}(?::\d{2})?(?:\s*[-—–:：｜|]\s*|\s+)\S+/.test(line.trim());
}

function findFirstHighConfidenceTimestampLineIndex(lines: string[]) {
  return lines.findIndex((line) => isHighConfidenceTimestampLine(line));
}

export function extractTimelineRegionFromShownotes(text: string) {
  const normalized = stripHtml(text).replace(/\r\n/g, "\n");
  const stopRegex = buildMarkerRegex(NON_TIMELINE_SECTION_MARKERS);
  const startIndex = findTimelineStartIndex(normalized);
  const lines = normalized.split("\n");
  const fallbackStartLineIndex = findFirstHighConfidenceTimestampLineIndex(lines);

  let focused =
    startIndex >= 0
      ? normalized.slice(startIndex)
      : fallbackStartLineIndex >= 0
        ? lines.slice(fallbackStartLineIndex).join("\n")
        : normalized;

  if (!focused.trim()) {
    return normalized;
  }

  focused = focused.replace(/^[\s:：\-—–|｜]+/, "");
  const focusedLines = focused.split("\n");
  const keptLines: string[] = [];
  const timestampPattern = buildTimestampLineRegex();

  for (const rawLine of focusedLines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const hasTimestamp = timestampPattern.test(line) || isHighConfidenceTimestampLine(line);
    const stopMatch = stopRegex.exec(line);

    if (stopMatch && !hasTimestamp) {
      break;
    }

    keptLines.push(line);
  }

  const keptText = keptLines.join("\n").trim();

  if (keptText) {
    return keptText;
  }

  const stopMatch = stopRegex.exec(focused);

  if (stopMatch && stopMatch.index > 0) {
    return focused.slice(0, stopMatch.index).trim() || normalized;
  }

  return focused.trim() || normalized;
}

function trimAtOperationalMarkers(value: string) {
  let result = value;

  for (const marker of TITLE_STOP_MARKERS) {
    const index = result.indexOf(marker);

    if (index > 0) {
      result = result.slice(0, index);
    }
  }

  return result.trim();
}

function stripObviousNonTitleContent(value: string) {
  return trimAtOperationalMarkers(
    value
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/\bwww\.\S+/gi, " ")
      .replace(/\S+@\S+\.\S+/g, " ")
      .replace(/#[^\s#]+/g, " ")
      .replace(/@[\p{L}\p{N}_-]+/gu, " ")
      .replace(/[【】[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function cleanSectionTitle(rawTitle: string) {
  const cleaned = stripObviousNonTitleContent(rawTitle)
    .replace(/^\d{2}:\d{2}(?::\d{2})?\s*/, "")
    .replace(/^[[\]()（）]+/, "");
  const normalized = cleanSectionDelimiterText(cleaned);
  const firstSentenceMatch = normalized.match(/^(.{12,}?[。.!！?？])/);
  const firstSentence = firstSentenceMatch?.[1]?.trim() || normalized;

  return truncateSectionTitle(cleanSectionDelimiterText(firstSentence), 42);
}

export function cleanSectionSummary(rawText: string, title: string) {
  const cleaned = stripObviousNonTitleContent(rawText);
  const firstSentenceMatch = cleaned.match(/^(.{12,}?[。.!！?？])/);
  const sentenceLimited = firstSentenceMatch?.[1]?.trim() || cleaned;
  const normalized = cleanSectionDelimiterText(sentenceLimited);

  if (!normalized) {
    return title;
  }

  if (normalized.length <= 120) {
    return normalized;
  }

  return truncateText(normalized, 120);
}

function isHighlyRepeatedTitle(title: string, previousTitle?: string) {
  if (!previousTitle) {
    return false;
  }

  const normalized = title.replace(/\s+/g, "");
  const previous = previousTitle.replace(/\s+/g, "");

  return normalized === previous || normalized.includes(previous) || previous.includes(normalized);
}

function cleanSectionDescription(value: string) {
  const withoutMarkers = trimAtOperationalMarkers(
    value
      .replace(/\s+/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
      .replace(/[【】[\]]/g, " ")
      .trim(),
  );
  const firstSentenceMatch = withoutMarkers.match(/^(.{12,}?[。.!！?？])/);
  const sentenceLimited = firstSentenceMatch?.[1]?.trim() || withoutMarkers;

  return cleanSectionDelimiterText(sentenceLimited);
}

function truncateSectionTitle(value: string, maxLength = 42) {
  if (value.length <= maxLength) {
    return value;
  }

  const separators = ["，", "。", ";", "；", "｜", "|", "-", "—", "–"];

  for (const separator of separators) {
    const index = value.indexOf(separator);

    if (index >= 12 && index <= maxLength) {
      return value.slice(0, index).trim();
    }
  }

  return `${value.slice(0, maxLength).trimEnd()}…`;
}

function isOperationalOnlyTitle(title: string) {
  const normalized = title.replace(/\s+/g, "");

  if (!normalized || normalized.length < 2) {
    return true;
  }

  if (/^(剪辑|主播|嘉宾|制作|相关链接|参考链接|延伸阅读|欢迎|评论区|公众号|听友群|加入群|订阅|收听|商务合作|声明)/.test(normalized)) {
    return true;
  }

  if (/^(https?:\/\/|www\.|\S+@\S+\.\S+)/i.test(normalized)) {
    return true;
  }

  const linkLikeChars = (title.match(/[/:.?=&%@#]/g) ?? []).length;

  return linkLikeChars > Math.max(4, Math.floor(title.length / 4));
}

function cleanTimestampSectionEntry(value: string, previousTitle?: string) {
  const rawDescription = cleanSectionDescription(value);
  const title = cleanSectionTitle(rawDescription);
  const summary = cleanSectionSummary(rawDescription, title);

  if (isOperationalOnlyTitle(title) || isHighlyRepeatedTitle(title, previousTitle)) {
    return null;
  }

  return {
    title,
    summary,
  };
}

function isLikelyFillerOnly(text: string) {
  const normalized = text.replace(/[,.!?，。！？、~…\s]/g, "");

  return /^(嗯|呃|额|啊)+$/.test(normalized);
}

function cleanTranscriptBlockText(text: string) {
  const cleaned = text
    .replace(
      /(^|[\s，。！？、,!?])(?:嗯+|呃+|额+|啊+)(?:[.。…~]*)?(?=$|[\s，。！？、,!?])/g,
      "$1",
    )
    .replace(/([，。！？、,!?])\1+/g, "$1")
    .replace(/^[，。！？、,!?；;：:]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  return isLikelyFillerOnly(cleaned) ? "" : cleaned;
}

export function extractTimestampSectionsFromText(text: string): TimestampSectionSeed[] {
  const sourceText = extractTimelineRegionFromShownotes(text).replace(/\r\n/g, "\n");
  const lines = sourceText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const matches: TimestampSectionSeed[] = [];
  const pattern = buildTimestampLineRegex();

  for (const line of lines) {
    const match = line.match(pattern);

    if (!match) {
      continue;
    }

    const startTimestamp = normalizeTimestamp(match[1] ?? match[2] ?? "");
    const cleanedEntry = cleanTimestampSectionEntry(
      match[3] ?? "",
      matches.at(-1)?.title,
    );

    if (!startTimestamp || !cleanedEntry) {
      continue;
    }

    matches.push({
      title: cleanedEntry.title,
      summary: cleanedEntry.summary,
      startTimestamp,
      order: matches.length + 1,
    });
  }

  if (matches.length >= 3) {
    return matches;
  }

  const inlineSource = sourceText
    .replace(/\s+/g, " ")
    .replace(/时间线[:：]/g, " 时间线： ")
    .trim();
  const inlinePattern =
    /(?:^|[\s（(])(?:\[(\d{2}:\d{2}(?::\d{2})?)\]|(\d{2}:\d{2}(?::\d{2})?))(?:\s*[-—–:：]\s*|\s+)([\s\S]*?)(?=(?:\s+(?:\[\d{2}:\d{2}(?::\d{2})?\]|\d{2}:\d{2}(?::\d{2})?)(?:\s*[-—–:：]\s*|\s+))|$)/g;
  const inlineMatches: TimestampSectionSeed[] = [];

  for (const match of inlineSource.matchAll(inlinePattern)) {
    const startTimestamp = normalizeTimestamp(match[1] ?? match[2] ?? "");
    const cleanedEntry = cleanTimestampSectionEntry(
      match[3] ?? "",
      inlineMatches.at(-1)?.title,
    );

    if (!startTimestamp || !cleanedEntry) {
      continue;
    }

    inlineMatches.push({
      title: cleanedEntry.title,
      summary: cleanedEntry.summary,
      startTimestamp,
      order: inlineMatches.length + 1,
    });
  }

  return inlineMatches.length >= 3 ? inlineMatches : [];
}

export function isUsableShownotesSections(sections: Section[]) {
  if (sections.length < 3) {
    return false;
  }

  const titles = sections.map((section) => section.title.trim()).filter(Boolean);

  if (titles.length < 3) {
    return false;
  }

  const withTimestampCount = sections.filter((section) => Boolean(section.startTimestamp)).length;
  const averageTitleLength =
    titles.reduce((sum, title) => sum + title.length, 0) / titles.length;
  const operationalTitleCount = titles.filter((title) => isOperationalOnlyTitle(title)).length;
  const noisyTitleCount = titles.filter(
    (title) =>
      /https?:\/\/|www\.|\S+@\S+\.\S+|公众号|听友群|欢迎|评论区|订阅|收听/i.test(title) ||
      title.length > 48,
  ).length;

  if (withTimestampCount < Math.max(3, Math.floor(sections.length * 0.7))) {
    return false;
  }

  if (averageTitleLength > 34) {
    return false;
  }

  if (operationalTitleCount > 0) {
    return false;
  }

  if (noisyTitleCount > Math.floor(sections.length / 4)) {
    return false;
  }

  return true;
}

export function getShownotesSectionsDecision(
  text: string,
  transcriptBlocks: TranscriptBlock[],
): ShownotesSectionsDecision {
  const sectionSeeds = extractTimestampSectionsFromText(text);

  if (sectionSeeds.length === 0) {
    return {
      source: "llm_fallback_required",
      reason: "shownotes_sections_empty",
      sections: [],
    };
  }

  const sections = sectionSeeds.map((section, index) => {
    const nextSection = sectionSeeds[index + 1];
    const startBlockId = findClosestBlockIdByTimestamp(
      transcriptBlocks,
      section.startTimestamp,
      index,
    );
    const endBlockId =
      findClosestBlockIdByTimestamp(
        transcriptBlocks,
        nextSection?.startTimestamp,
        Math.min(index + 1, transcriptBlocks.length - 1),
      ) || undefined;

    return {
      id: `section-${String(index + 1).padStart(3, "0")}`,
      title: section.title,
      summary: section.summary || section.title,
      order: index + 1,
      startBlockId,
      endBlockId,
      startTimestamp: section.startTimestamp,
      endTimestamp: nextSection?.startTimestamp,
    };
  });

  if (!isUsableShownotesSections(sections)) {
    return {
      source: "llm_fallback_required",
      reason: "shownotes_sections_unusable",
      sections,
    };
  }

  return {
    source: "shownotes",
    sections,
  };
}

function findClosestBlockIdByTimestamp(
  blocks: TranscriptBlock[],
  timestamp?: string,
  fallbackIndex = 0,
) {
  if (!blocks.length) {
    return "";
  }

  const targetSeconds = timestampToSeconds(timestamp);

  if (targetSeconds === null) {
    return blocks[Math.min(fallbackIndex, blocks.length - 1)]?.id ?? "";
  }

  let closestBlock = blocks[0];
  let smallestDiff = Number.POSITIVE_INFINITY;

  for (const block of blocks) {
    const blockSeconds = timestampToSeconds(block.time);

    if (blockSeconds === null) {
      continue;
    }

    const diff = Math.abs(blockSeconds - targetSeconds);

    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestBlock = block;
    }
  }

  return closestBlock?.id ?? blocks[Math.min(fallbackIndex, blocks.length - 1)]?.id ?? "";
}

export function buildSectionsFromTimestampDirectory(
  text: string,
  transcriptBlocks: TranscriptBlock[],
): Section[] {
  const decision = getShownotesSectionsDecision(text, transcriptBlocks);

  if (decision.source !== "shownotes") {
    return [];
  }

  return decision.sections;
}

function shouldMergeBlocks(current: TranscriptBlock, next: TranscriptBlock) {
  const currentSpeaker = normalizeSpeakerLabel(current.speaker);
  const nextSpeaker = normalizeSpeakerLabel(next.speaker);
  const sameSpeaker =
    currentSpeaker === nextSpeaker ||
    !currentSpeaker ||
    !nextSpeaker;

  if (!sameSpeaker) {
    return false;
  }

  const combinedLength = `${current.text} ${next.text}`.trim().length;

  if (combinedLength > 280) {
    return false;
  }

  const currentSeconds = timestampToSeconds(current.time);
  const nextSeconds = timestampToSeconds(next.time);

  if (
    currentSeconds !== null &&
    nextSeconds !== null &&
    Math.abs(nextSeconds - currentSeconds) > 45
  ) {
    return false;
  }

  if (/^[一二三四五六七八九十0-9]+[.、]/.test(next.text)) {
    return false;
  }

  return true;
}

export function postProcessTranscriptBlocks(blocks: TranscriptBlock[]) {
  const cleanedBlocks = blocks
    .map((block) => ({
      ...block,
      speaker: block.speaker.trim(),
      text: cleanTranscriptBlockText(block.text),
    }))
    .filter((block) => block.text.length > 0);

  if (cleanedBlocks.length === 0) {
    return [];
  }

  const mergedBlocks: TranscriptBlock[] = [];

  for (const block of cleanedBlocks) {
    const previous = mergedBlocks.at(-1);

    if (!previous || !shouldMergeBlocks(previous, block)) {
      mergedBlocks.push({
        ...block,
      });
      continue;
    }

    previous.text = `${previous.text} ${block.text}`.replace(/\s+/g, " ").trim();

    if (!previous.speaker && block.speaker) {
      previous.speaker = block.speaker;
    }
  }

  return mergedBlocks.map((block, index) => ({
    id: `t-${String(index + 1).padStart(3, "0")}`,
    time: block.time,
    speaker: block.speaker,
    text: block.text,
  }));
}

export function transcriptTextToTranscriptBlocks(text: string): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  const normalizedText = text
    .replace(/\r\n/g, "\n")
    .replace(/\[(\d{2}:\d{2}(?::\d{2})?)\]/g, "\n[$1] ")
    .trim();
  const segments = normalizedText
    .split(/\n(?=(?:\[\d{2}:\d{2}(?::\d{2})?\]|\d{2}:\d{2}(?::\d{2})?\s))/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(
      /^(?:\[(\d{2}:\d{2}(?::\d{2})?)\]|(\d{2}:\d{2}(?::\d{2})?))(?:\s+([^\s:：]{1,20})[：:])?\s*([\s\S]+)$/,
    );

    if (!match) {
      continue;
    }

    const timestamp = normalizeTimestamp(match[1] ?? match[2] ?? "");
    const speaker = (match[3] ?? "").trim();
    const content = cleanTranscriptLikeText(match[4] ?? "");

    if (!timestamp || !content) {
      continue;
    }

    blocks.push({
      id: `xyy-existing-${blocks.length + 1}`,
      time: timestamp,
      speaker,
      text: content,
    });
  }

  if (blocks.length > 0) {
    return blocks;
  }

  const fallbackText = cleanTranscriptLikeText(text);

  if (!fallbackText) {
    return [];
  }

  const paragraphs = fallbackText
    .split(/(?<=[。！？!?])\s+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (paragraphs.length > 0 ? paragraphs : [fallbackText]).map(
    (paragraph, index) => ({
      id: `xyy-existing-${index + 1}`,
      time: "00:00",
      speaker: "",
      text: paragraph,
    }),
  );
}

export function isTranscriptLongEnough(text: string, durationSeconds?: number) {
  const cleanText = cleanTranscriptLikeText(text);
  const timestampWeighted = hasManyTimestamps(cleanText);

  if (!cleanText) {
    return false;
  }

  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    const durationMinutes = durationSeconds / 60;
    let minChars =
      durationMinutes < 10
        ? Math.max(800, durationMinutes * 100)
        : Math.max(1500, durationMinutes * 120);

    if (timestampWeighted) {
      minChars *= 0.5;
    }

    return cleanText.length >= minChars;
  }

  return cleanText.length >= (timestampWeighted ? 1200 : 3000);
}

function collectTranscriptCandidates(
  value: unknown,
  matches: CandidateMatch[],
  visited: WeakSet<object>,
) {
  if (typeof value === "string") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTranscriptCandidates(item, matches, visited);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (visited.has(value)) {
    return;
  }

  visited.add(value);

  for (const [key, fieldValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();

    if (transcriptCandidateKeys.has(normalizedKey)) {
      if (typeof fieldValue === "string") {
        const cleanText = cleanTranscriptLikeText(fieldValue);

        if (cleanText) {
          matches.push({
            key,
            text: cleanText,
          });
        }
      } else if (Array.isArray(fieldValue)) {
        const flattenedText = fieldValue
          .flatMap((item) => {
            if (typeof item === "string") {
              return [item];
            }

            if (isRecord(item)) {
              return Object.values(item)
                .filter((nestedValue): nestedValue is string => typeof nestedValue === "string")
                .map((nestedValue) => nestedValue);
            }

            return [];
          })
          .join("\n");
        const cleanText = cleanTranscriptLikeText(flattenedText);

        if (cleanText) {
          matches.push({
            key,
            text: cleanText,
          });
        }
      }
    }

    collectTranscriptCandidates(fieldValue, matches, visited);
  }
}

export function decideTranscriptSource({
  candidateRoots,
  description,
  shownotes,
  audioUrl,
  durationSeconds,
}: {
  candidateRoots: unknown[];
  description?: string;
  shownotes?: string;
  audioUrl?: string;
  durationSeconds?: number;
}): TranscriptSourceDecision {
  const matches: CandidateMatch[] = [];
  const visited = new WeakSet<object>();

  for (const root of candidateRoots) {
    collectTranscriptCandidates(root, matches, visited);
  }

  const candidate = matches.find((match) =>
    isTranscriptLongEnough(match.text, durationSeconds),
  );

  if (candidate) {
    return {
      source: "existing_transcript",
      reason: `existing ${candidate.key} found and long enough`,
      transcriptText: candidate.text,
    };
  }

  if (matches.length > 0) {
    return {
      source: audioUrl ? "asr_required" : "none",
      reason: "existing transcript too short",
    };
  }

  if ((description && cleanTranscriptLikeText(description)) || (shownotes && cleanTranscriptLikeText(shownotes))) {
    return {
      source: audioUrl ? "asr_required" : "none",
      reason: audioUrl
        ? "only description or shownotes found"
        : "only description or shownotes found and no audioUrl",
    };
  }

  if (audioUrl) {
    return {
      source: "asr_required",
      reason: "no transcript found but audioUrl is available",
    };
  }

  return {
    source: "none",
    reason: "no transcript found and no audioUrl",
  };
}
