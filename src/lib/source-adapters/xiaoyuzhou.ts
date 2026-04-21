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
  startTimestamp: string;
  order: number;
};

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

function cleanSectionTitle(value: string) {
  return value
    .replace(/^[\-\-—–:：·•\s]+/, "")
    .replace(/[\-\-—–:：·•\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
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

function buildTimestampLineRegex() {
  return /^\s*(?:\[(\d{2}:\d{2}(?::\d{2})?)\]|(\d{2}:\d{2}(?::\d{2})?))(?:\s*[-—–:：]\s*|\s+)(.+?)\s*$/;
}

export function extractTimestampSectionsFromText(text: string): TimestampSectionSeed[] {
  const sourceText = stripHtml(text).replace(/\r\n/g, "\n");
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
    const title = cleanSectionTitle(match[3] ?? "");

    if (!startTimestamp || !title) {
      continue;
    }

    matches.push({
      title,
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
    const title = cleanSectionTitle(match[3] ?? "");

    if (!startTimestamp || !title) {
      continue;
    }

    inlineMatches.push({
      title,
      startTimestamp,
      order: inlineMatches.length + 1,
    });
  }

  return inlineMatches.length >= 3 ? inlineMatches : [];
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
  const sectionSeeds = extractTimestampSectionsFromText(text);

  if (sectionSeeds.length === 0) {
    return [];
  }

  return sectionSeeds.map((section, index) => {
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
      summary: section.title,
      order: index + 1,
      startBlockId,
      endBlockId,
      startTimestamp: section.startTimestamp,
      endTimestamp: nextSection?.startTimestamp,
    };
  });
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
