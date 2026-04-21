import type { TranscriptBlock } from "@/lib/mock-data";

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
