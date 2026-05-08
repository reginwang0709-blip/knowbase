import type { GlossaryExplanation, GlossaryTerm } from "./mock-data";

const GENERIC_ALPHA_WORDS = new Set([
  "agent",
  "ai",
  "app",
  "assistant",
  "capability",
  "code",
  "coding",
  "company",
  "concept",
  "content",
  "feature",
  "framework",
  "function",
  "issue",
  "model",
  "open",
  "platform",
  "problem",
  "product",
  "project",
  "prompt",
  "service",
  "software",
  "solution",
  "system",
  "team",
  "token",
  "tool",
  "user",
  "workflow",
  "cloud",
]);

export const GLOSSARY_DISPLAY_POLICY_NAME =
  "v1:user_added_ready_high_confidence_plus_medium_strong_evidence";

type GlossaryDisplayCandidateSignals = {
  candidateSource?: string;
  confidence?: "high" | "medium" | "low";
  matchedSignals?: string[];
  scoreBreakdown?: {
    contextScore?: number;
    documentScore?: number;
    termhoodScore?: number;
    semanticScore?: number;
    noisePenalty?: number;
    matchedSignals?: string[];
  };
};

type GlossaryDisplayEvaluation = {
  highlightEnabled: boolean;
  displayStatus: "highlighted" | "inventory_only" | "hidden";
  displayReason?: string;
  hiddenReason?: string;
};

export function normalizeGlossaryTermText(term: string) {
  return term
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[“”"'`‘’（）()[\]{}<>《》]/g, "")
    .replace(/[\s\-—–_|｜·•,，。:：;；/\\]+/g, "")
    .replace(/(?<=\d)\.(?=\d)/g, "")
    .trim();
}

export function sanitizeGlossaryAliases(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  ).slice(0, 3);
}

export function sanitizeGlossaryExplanation(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const definition =
    typeof record.definition === "string" ? record.definition.trim() : "";
  const whyItMatters =
    typeof record.whyItMatters === "string" ? record.whyItMatters.trim() : "";
  const evidence = typeof record.evidence === "string" ? record.evidence.trim() : "";
  const aliases = sanitizeGlossaryAliases(record.aliases);

  if (!definition && !whyItMatters && !evidence && aliases.length === 0) {
    return null;
  }

  return {
    definition,
    whyItMatters,
    evidence,
    aliases,
  } satisfies GlossaryExplanation;
}

function hasEnoughGlossaryShape(term: string) {
  const trimmed = term.trim();

  if (!trimmed || trimmed.length < 2 || trimmed.length > 80) {
    return false;
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(trimmed)) {
    return false;
  }

  if (/^\d+$/.test(trimmed)) {
    return false;
  }

  return true;
}

function extractAlphaWords(term: string) {
  return term
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isGenericWordPhrase(term: string) {
  const words = extractAlphaWords(term);

  if (words.length === 0 || words.length > 3) {
    return false;
  }

  return words.every((word) => GENERIC_ALPHA_WORDS.has(word));
}

function looksLikeGlossaryFragment(term: string) {
  const trimmed = term.trim();
  const alphaWords = extractAlphaWords(trimmed);
  const hasChinese = /[\u4e00-\u9fff]/.test(trimmed);

  if (alphaWords.length >= 5 && !hasChinese) {
    return true;
  }

  if (/^[a-z][a-z0-9]+(?:\s+[a-z0-9]+)+$/.test(trimmed)) {
    return true;
  }

  if (/[,:;，。；：]$/.test(trimmed)) {
    return true;
  }

  return false;
}

function looksLikeNoiseTerm(term: GlossaryTerm) {
  if (!hasEnoughGlossaryShape(term.term)) {
    return true;
  }

  if (looksLikeGlossaryFragment(term.term)) {
    return true;
  }

  if (isGenericWordPhrase(term.term)) {
    return true;
  }

  const normalized = normalizeGlossaryTermText(term.term);

  if (!normalized || normalized.length < 2) {
    return true;
  }

  return false;
}

function hasStrongDisplayEvidence(
  term: GlossaryTerm,
  signals?: GlossaryDisplayCandidateSignals,
) {
  const matchedSignals = [
    ...(signals?.matchedSignals ?? []),
    ...(signals?.scoreBreakdown?.matchedSignals ?? []),
  ];
  const uniqueSignals = new Set(matchedSignals.filter(Boolean));
  const contextScore = signals?.scoreBreakdown?.contextScore ?? 0;
  const documentScore = signals?.scoreBreakdown?.documentScore ?? 0;
  const termhoodScore = signals?.scoreBreakdown?.termhoodScore ?? 0;
  const semanticScore = signals?.scoreBreakdown?.semanticScore ?? 0;

  return (
    term.occurrenceCount >= 2 ||
    documentScore >= 1.2 ||
    termhoodScore >= 1.2 ||
    contextScore >= 1 ||
    semanticScore >= 1 ||
    uniqueSignals.size >= 2
  );
}

export function evaluateGlossaryDisplayEligibility(
  term: GlossaryTerm,
  signals?: GlossaryDisplayCandidateSignals,
): GlossaryDisplayEvaluation {
  const source = term.source || "auto";
  const explanationStatus = term.explanationStatus ?? "pending";
  const confidence = term.confidence ?? signals?.confidence;
  const noisePenalty = signals?.scoreBreakdown?.noisePenalty ?? 0;
  const noiseDetected = looksLikeNoiseTerm(term) || noisePenalty >= 1.5;

  if (term.userFeedback === "hidden" || term.displayStatus === "hidden") {
    return {
      highlightEnabled: false,
      displayStatus: "hidden",
      hiddenReason: term.hiddenReason || "user_feedback",
    };
  }

  if (term.isStarred) {
    return {
      highlightEnabled: true,
      displayStatus: "highlighted",
      displayReason: "user_starred",
    };
  }

  if (source === "user_added") {
    return {
      highlightEnabled: true,
      displayStatus: "highlighted",
      displayReason: "user_added",
    };
  }

  if (noiseDetected) {
    return {
      highlightEnabled: false,
      displayStatus: "inventory_only",
      hiddenReason: "noise_or_fragment",
    };
  }

  if (explanationStatus === "ready") {
    return {
      highlightEnabled: true,
      displayStatus: "highlighted",
      displayReason: "ready_explanation",
    };
  }

  if (confidence === "high") {
    return {
      highlightEnabled: true,
      displayStatus: "highlighted",
      displayReason: "high_confidence_auto",
    };
  }

  if (confidence === "medium" && hasStrongDisplayEvidence(term, signals)) {
    return {
      highlightEnabled: true,
      displayStatus: "highlighted",
      displayReason: "medium_confidence_strong_evidence",
    };
  }

  if (confidence === "low") {
    return {
      highlightEnabled: false,
      displayStatus: "inventory_only",
      hiddenReason: "low_confidence_inventory_only",
    };
  }

  return {
    highlightEnabled: false,
    displayStatus: "inventory_only",
    hiddenReason:
      confidence === "medium"
        ? "medium_confidence_needs_stronger_evidence"
        : "not_display_eligible",
  };
}

export function normalizeGlossaryTermRecord(
  term: GlossaryTerm,
  contentId?: string,
): GlossaryTerm {
  const explanation = sanitizeGlossaryExplanation(term.explanation) ?? {
    definition: term.definition?.trim() ?? "",
    whyItMatters: "",
    evidence: term.contextExample?.trim() ?? "",
    aliases: sanitizeGlossaryAliases(term.aliases),
  };
  const explanationStatus =
    term.explanationStatus ??
    (explanation.definition || explanation.whyItMatters || explanation.evidence
      ? "ready"
      : "pending");
  const normalizedTerm =
    typeof term.normalizedTerm === "string" && term.normalizedTerm.trim()
      ? term.normalizedTerm.trim()
      : normalizeGlossaryTermText(term.term);
  const blockId = term.blockId || term.firstEvidenceBlockId || term.evidenceBlockIds[0] || "";
  const evidenceSnippet =
    term.evidenceSnippet?.trim() ||
    explanation.evidence ||
    term.contextExample?.trim() ||
    "";
  const display = evaluateGlossaryDisplayEligibility({
    ...term,
    source: term.source || "auto",
    explanationStatus,
    normalizedTerm,
    evidenceSnippet,
  });

  return {
    ...term,
    termId: term.termId || term.id,
    contentId: term.contentId || contentId,
    normalizedTerm,
    aliases: explanation.aliases,
    definition: explanation.definition,
    contextExample: explanation.evidence,
    source: term.source || "auto",
    evidenceSnippet,
    blockId,
    firstEvidenceBlockId: term.firstEvidenceBlockId || blockId,
    explanationStatus,
    explanation,
    highlightEnabled: term.highlightEnabled ?? display.highlightEnabled,
    displayStatus: term.displayStatus ?? display.displayStatus,
    displayReason: term.displayReason ?? display.displayReason,
    hiddenReason: term.hiddenReason ?? display.hiddenReason,
    isStarred: term.isStarred === true,
    userFeedback:
      term.userFeedback === "starred" ||
      term.userFeedback === "hidden" ||
      term.userFeedback === "incorrect" ||
      term.userFeedback === "user_rejected" ||
      term.userFeedback === "not_needed" ||
      term.userFeedback === "none"
        ? term.userFeedback
        : undefined,
    feedbackUpdatedAt:
      typeof term.feedbackUpdatedAt === "string" && term.feedbackUpdatedAt.trim()
        ? term.feedbackUpdatedAt
        : undefined,
    createdAt: term.createdAt || new Date().toISOString(),
    updatedAt: term.updatedAt || new Date().toISOString(),
  };
}

export function normalizeGlossaryTermsArray(value: unknown, contentId?: string) {
  if (!Array.isArray(value)) {
    return [] as GlossaryTerm[];
  }

  return value
    .filter(
      (item): item is GlossaryTerm =>
        Boolean(item) &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as GlossaryTerm).id === "string" &&
        typeof (item as GlossaryTerm).term === "string" &&
        Array.isArray((item as GlossaryTerm).evidenceBlockIds),
    )
    .map((term) => normalizeGlossaryTermRecord(term, contentId));
}

export function buildGlossaryExplanationPreview(term: GlossaryTerm) {
  const explanation = sanitizeGlossaryExplanation(term.explanation);
  return {
    definition: explanation?.definition || term.definition || "",
    whyItMatters: explanation?.whyItMatters || "",
    evidence: explanation?.evidence || term.contextExample || term.evidenceSnippet || "",
    aliases: explanation?.aliases || sanitizeGlossaryAliases(term.aliases),
  };
}

export function isGlossaryTermHighlightEnabled(term: GlossaryTerm) {
  return term.highlightEnabled === true || term.displayStatus === "highlighted";
}

export function isValidUserGlossarySelection(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (trimmed.length > 80) {
    return false;
  }

  if (/^[\p{P}\p{S}\s]+$/u.test(trimmed)) {
    return false;
  }

  return true;
}
