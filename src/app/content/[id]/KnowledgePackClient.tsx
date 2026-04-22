"use client";

import { Fragment, useMemo, useState } from "react";
import type {
  GlossaryTerm,
  KnowledgeItem,
  Section,
  TranscriptBlock,
} from "@/lib/mock-data";
import type { ReactNode } from "react";

type KnowledgePackClientProps = {
  item: KnowledgeItem;
};

type GlossaryToken = {
  term: GlossaryTerm;
  token: string;
};

type SectionTranscriptGroup = {
  section: Section;
  blocks: TranscriptBlock[];
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
};

function buildGlossaryTokens(glossaryTerms: GlossaryTerm[]) {
  const tokens = glossaryTerms.flatMap((term) => {
    const uniqueTokens = Array.from(
      new Set([term.term, ...(term.aliases ?? [])].filter(Boolean)),
    );

    return uniqueTokens.map((token) => ({ term, token }));
  });

  return tokens.sort((first, second) => second.token.length - first.token.length);
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
}: {
  label: string;
  term: GlossaryTerm;
  onLocate: (term: GlossaryTerm) => void;
}) {
  const categoryLabel = term.category ? categoryLabels[term.category] : null;

  return (
    <span className="group relative inline-block">
      <button
        className="rounded bg-sage/10 px-1 font-medium text-sage underline decoration-sage/30 underline-offset-4 transition hover:bg-sage/20"
        type="button"
        onClick={() => onLocate(term)}
      >
        {label}
      </button>
      <span className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 block w-[280px] max-w-[80vw] rounded-lg border border-line bg-white p-3 text-left text-xs leading-5 text-ink opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100">
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
        <span className="mt-2 block text-muted">{term.definition}</span>
        <span className="mt-2 block rounded-md bg-panel p-2 text-ink">
          语境：{term.contextExample}
        </span>
        <span className="mt-2 block text-[11px] font-semibold text-sage">
          点击术语可定位原文
        </span>
      </span>
    </span>
  );
}

function renderMarkedText({
  text,
  glossaryTokens,
  onLocate,
}: {
  text: string;
  glossaryTokens: GlossaryToken[];
  onLocate: (term: GlossaryTerm) => void;
}) {
  const nodes: ReactNode[] = [];
  const markedTermIds = new Set<string>();
  let cursor = 0;
  let plainIndex = 0;

  while (cursor < text.length) {
    let bestMatch: { index: number; token: GlossaryToken } | null = null;

    for (const glossaryToken of glossaryTokens) {
      if (markedTermIds.has(glossaryToken.term.id)) {
        continue;
      }

      const index = text.indexOf(glossaryToken.token, cursor);

      if (index === -1) {
        continue;
      }

      if (
        !bestMatch ||
        index < bestMatch.index ||
        (index === bestMatch.index &&
          glossaryToken.token.length > bestMatch.token.token.length)
      ) {
        bestMatch = { index, token: glossaryToken };
      }
    }

    if (!bestMatch) {
      nodes.push(
        <Fragment key={`plain-${plainIndex}`}>{text.slice(cursor)}</Fragment>,
      );
      break;
    }

    if (bestMatch.index > cursor) {
      nodes.push(
        <Fragment key={`plain-${plainIndex}`}>
          {text.slice(cursor, bestMatch.index)}
        </Fragment>,
      );
      plainIndex += 1;
    }

    const matchedText = text.slice(
      bestMatch.index,
      bestMatch.index + bestMatch.token.token.length,
    );

    nodes.push(
      <GlossaryMarker
        key={`glossary-${bestMatch.token.term.id}-${bestMatch.index}`}
        label={matchedText}
        term={bestMatch.token.term}
        onLocate={onLocate}
      />,
    );
    markedTermIds.add(bestMatch.token.term.id);
    cursor = bestMatch.index + bestMatch.token.token.length;
  }

  return nodes.length > 0 ? nodes : text;
}

export default function KnowledgePackClient({ item }: KnowledgePackClientProps) {
  const [activeNavId, setActiveNavId] = useState("content-meta");
  const [activeSectionId, setActiveSectionId] = useState(
    item.sections[0]?.id ?? "",
  );
  const [highlightedBlockId, setHighlightedBlockId] = useState("");

  const sections = useMemo(
    () => [...item.sections].sort((first, second) => first.order - second.order),
    [item.sections],
  );
  const glossaryTokens = useMemo(
    () => buildGlossaryTokens(item.glossaryTerms),
    [item.glossaryTerms],
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
    const blockId = term.evidenceBlockIds[0];

    if (!blockId) {
      return;
    }

    const relatedSection = findSectionByBlockId(blockId);
    jumpToTranscript(blockId, relatedSection?.id);
  };

  return (
    <article className="grid gap-7 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
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
          <div className="grid gap-3">
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
                            {renderMarkedText({
                              text: block.text,
                              glossaryTokens,
                              onLocate: locateGlossaryTerm,
                            })}
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
                        {renderMarkedText({
                          text: block.text,
                          glossaryTokens,
                          onLocate: locateGlossaryTerm,
                        })}
                      </p>
                    </div>
                  );
                })}
          </div>
        </section>
      </div>
    </article>
  );
}
