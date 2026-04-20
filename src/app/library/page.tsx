"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  deleteContentById,
  getFallbackLibraryData,
  getLibraryData,
} from "@/lib/data-access";
import {
  buildMindMapTree,
  buildTableRows,
  contentMatches,
  filterLibraryCategories,
  type LibraryContentItem,
  type LibraryTopic,
  type MindMapNode,
} from "@/lib/library-view-model";

const viewOptions = [
  { id: "domains", label: "知识领域" },
  { id: "table", label: "表格视图" },
  { id: "mindmap", label: "思维导图" },
] as const;

type LibraryView = (typeof viewOptions)[number]["id"];

function keywordMatchesText(value: string, keyword: string) {
  const normalizedValue = value.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();

  return (
    normalizedValue.includes(normalizedKeyword) ||
    normalizedKeyword.includes(normalizedValue)
  );
}

function topicMatchesKeyword(topic: LibraryTopic, keyword: string) {
  return (
    keywordMatchesText(topic.name, keyword) ||
    topic.topKeywords.some((topicKeyword) =>
      keywordMatchesText(topicKeyword, keyword),
    ) ||
    topic.contents.some((content) => contentMatchesKeyword(content, keyword))
  );
}

function contentMatchesKeyword(content: LibraryContentItem, keyword: string) {
  return (
    keywordMatchesText(content.title, keyword) ||
    content.topKeywords.some((contentKeyword) =>
      keywordMatchesText(contentKeyword, keyword),
    )
  );
}

function getContentHref(contentId: string) {
  return `/content/${contentId}`;
}

function isDatabaseContentId(contentId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    contentId,
  );
}

function toggleSetItem(
  setValue: Dispatch<SetStateAction<Set<string>>>,
  itemId: string,
) {
  setValue((current) => {
    const next = new Set(current);

    if (next.has(itemId)) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }

    return next;
  });
}

function MindMapView({
  tree,
  collapsedCategories,
  collapsedTopics,
  onToggleCategory,
  onToggleTopic,
}: {
  tree: MindMapNode;
  collapsedCategories: Set<string>;
  collapsedTopics: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  onToggleTopic: (topicId: string) => void;
}) {
  return (
    <div className="flex min-w-[980px] items-start gap-0 py-2">
      <div className="flex min-h-[52px] shrink-0 items-center">
        <div className="rounded-lg bg-sage px-5 py-3 text-sm font-semibold text-white shadow-sm">
          {tree.label}
        </div>
      </div>
      <div className="mt-6 h-px w-10 shrink-0 bg-line" />
      <div className="grid min-w-0 gap-5">
        {tree.children?.map((category) => (
          <MindMapCategoryBranch
            category={category}
            collapsedCategories={collapsedCategories}
            collapsedTopics={collapsedTopics}
            key={category.id}
            onToggleCategory={onToggleCategory}
            onToggleTopic={onToggleTopic}
          />
        ))}
      </div>
    </div>
  );
}

function MindMapCategoryBranch({
  category,
  collapsedCategories,
  collapsedTopics,
  onToggleCategory,
  onToggleTopic,
}: {
  category: MindMapNode;
  collapsedCategories: Set<string>;
  collapsedTopics: Set<string>;
  onToggleCategory: (categoryId: string) => void;
  onToggleTopic: (topicId: string) => void;
}) {
  const isCollapsed = collapsedCategories.has(category.id);
  const topicCount = category.topicCount ?? category.children?.length ?? 0;
  const contentCount =
    category.contentCount ??
    category.children?.reduce(
      (total, topic) => total + (topic.children?.length ?? 0),
      0,
    ) ??
    0;

  return (
    <div className="flex items-start">
      <div className="mt-6 h-px w-6 shrink-0 bg-line" />
      <div className="flex items-start">
        <button
          className="min-w-[230px] rounded-lg border border-sage/30 bg-sage/10 px-4 py-3 text-left shadow-sm transition hover:border-sage hover:bg-sage/15"
          type="button"
          onClick={() => onToggleCategory(category.id)}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-ink">
              {isCollapsed
                ? `${category.label}（${topicCount} 个主题 / ${contentCount} 条内容）`
                : category.label}
            </span>
            <span className="text-lg font-semibold text-sage">
              {isCollapsed ? "+" : "-"}
            </span>
          </div>
          {!isCollapsed ? (
            <p className="mt-1 text-xs text-muted">
              {topicCount} 个主题 / {contentCount} 条内容
            </p>
          ) : null}
        </button>

        {!isCollapsed && category.children?.length ? (
          <>
            <div className="mt-6 h-px w-8 shrink-0 bg-line" />
            <div className="grid gap-3">
              {category.children.map((topic) => (
                <MindMapTopicBranch
                  collapsedTopics={collapsedTopics}
                  key={topic.id}
                  onToggleTopic={onToggleTopic}
                  topic={topic}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MindMapTopicBranch({
  topic,
  collapsedTopics,
  onToggleTopic,
}: {
  topic: MindMapNode;
  collapsedTopics: Set<string>;
  onToggleTopic: (topicId: string) => void;
}) {
  const isCollapsed = collapsedTopics.has(topic.id);
  const contentCount = topic.contentCount ?? topic.children?.length ?? 0;

  return (
    <div className="flex items-start">
      <button
        className="min-w-[200px] rounded-lg border border-line bg-white px-3 py-2 text-left shadow-sm transition hover:border-sage hover:bg-sage/5"
        type="button"
        onClick={() => onToggleTopic(topic.id)}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink">
            {isCollapsed ? `${topic.label}（${contentCount}）` : topic.label}
          </span>
          <span className="text-base font-semibold text-sage">
            {isCollapsed ? "+" : "-"}
          </span>
        </div>
        {!isCollapsed ? (
          <p className="mt-1 text-xs text-muted">{contentCount} 条内容</p>
        ) : null}
      </button>

      {!isCollapsed && topic.children?.length ? (
        <>
          <div className="mt-5 h-px w-7 shrink-0 bg-line" />
          <div className="grid gap-2">
            {topic.children.map((content) => (
              <Link
                className="max-w-[260px] rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium leading-5 text-ink shadow-sm transition hover:border-sage hover:text-sage"
                href={getContentHref(content.id)}
                key={content.id}
              >
                {content.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function LibraryPage() {
  const [libraryData, setLibraryData] = useState(getFallbackLibraryData);
  const [query, setQuery] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingContentId, setDeletingContentId] = useState("");
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<LibraryView>("domains");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [collapsedTopics, setCollapsedTopics] = useState<Set<string>>(
    new Set(),
  );
  const [activeKeyword, setActiveKeyword] = useState<{
    categoryId: string;
    keyword: string;
  } | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    () => libraryData.libraryCategories[0]?.id ?? "",
  );
  const detailRef = useRef<HTMLElement | null>(null);
  const { libraryCategories, recentContents, recentTopics } = libraryData;

  const refreshLibraryData = async () => {
    const data = await getLibraryData();

    setLibraryData(data);
  };

  useEffect(() => {
    let isMounted = true;

    getLibraryData().then((data) => {
      if (isMounted) {
        setLibraryData(data);
        setDeleteError("");
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const activeTopic =
    recentTopics.find((topic) => topic.id === activeTopicId) ?? null;
  const activeContentIds = useMemo(
    () => (activeTopic ? new Set(activeTopic.relatedContentIds) : null),
    [activeTopic],
  );

  const filteredCategories = useMemo(
    () =>
      filterLibraryCategories(
        libraryCategories,
        normalizedQuery,
        activeContentIds,
      ),
    [activeContentIds, libraryCategories, normalizedQuery],
  );
  const rowsForTable = useMemo(
    () => buildTableRows(filteredCategories),
    [filteredCategories],
  );
  const treeForMindMap = useMemo(
    () => buildMindMapTree(filteredCategories),
    [filteredCategories],
  );

  const filteredRecentContents = useMemo(
    () =>
      recentContents.filter((content) =>
        contentMatches(content, normalizedQuery, activeContentIds),
      ),
    [activeContentIds, normalizedQuery, recentContents],
  );

  const selectedCategory =
    filteredCategories.find((category) => category.id === selectedCategoryId) ??
    filteredCategories[0] ??
    null;

  const showClearFilter = Boolean(activeTopic || normalizedQuery);

  const selectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setActiveKeyword(null);
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  const clearFilters = () => {
    setActiveTopicId(null);
    setQuery("");
    setActiveKeyword(null);
  };

  const deleteContent = async (contentId: string) => {
    const confirmed = window.confirm(
      "确定要删除这条内容吗？删除后会从当前知识库中移除。",
    );

    if (!confirmed) {
      return;
    }

    setDeleteError("");
    setDeletingContentId(contentId);

    try {
      await deleteContentById(contentId);
      await refreshLibraryData();
    } catch {
      setDeleteError("删除失败，请稍后重试。");
    } finally {
      setDeletingContentId("");
    }
  };

  const selectCategoryKeyword = (categoryId: string, keyword: string) => {
    setSelectedCategoryId(categoryId);
    setActiveKeyword({ categoryId, keyword });
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  return (
    <main className="kb-container">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-ink">
          KnowBase
        </Link>
        <Link href="/" className="kb-button-secondary">
          新建解析
        </Link>
      </nav>

      <section className="mb-7 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-end">
        <div>
          <h1 className="text-3xl font-bold text-ink">我的知识库</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            内容会被整理进知识领域，你可以从领域、主题和最近新增内容回到具体知识包。
          </p>
        </div>
        <div>
          <input
            aria-label="搜索知识库"
            className="kb-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、关键词或分类"
          />
        </div>
      </section>

      <section className="mb-7">
        <div className="inline-flex rounded-lg border border-line bg-white p-1">
          {viewOptions.map((view) => {
            const isActive = view.id === activeView;

            return (
              <button
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "bg-sage text-white"
                    : "text-muted hover:bg-panel hover:text-ink"
                }`}
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id)}
              >
                {view.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="kb-label">最近关注</p>
          {showClearFilter ? (
            <button
              className="text-sm font-semibold text-sage hover:text-coral"
              type="button"
              onClick={clearFilters}
            >
              清除筛选
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {recentTopics.map((topic) => {
            const isActive = topic.id === activeTopicId;

            return (
              <button
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? "border-sage bg-sage text-white"
                    : "border-line bg-white text-ink hover:border-sage"
                }`}
                key={topic.id}
                type="button"
                onClick={() =>
                  setActiveTopicId((current) =>
                    current === topic.id ? null : topic.id,
                  )
                }
              >
                {topic.name}
                <span
                  className={`ml-2 ${
                    isActive ? "text-white/80" : "text-muted"
                  }`}
                >
                  {topic.contentCount} 条
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {activeView === "domains" ? (
        <>
      {deleteError ? (
        <div className="mb-5 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
          {deleteError}
        </div>
      ) : null}

      <section className="mb-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-ink">
              知识领域
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              系统会根据你已解析的播客、文章和视频内容归纳分类，并随着新增内容和你的调整持续更新。
            </p>
          </div>
          <span className="text-sm text-muted">
            {filteredCategories.length} 个分类
          </span>
        </div>

        {filteredCategories.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {filteredCategories.map((category) => {
              const isSelected = category.id === selectedCategory?.id;

              return (
                <article
                  className={`kb-card flex min-h-[270px] flex-col p-5 transition ${
                    isSelected ? "border-sage" : "hover:border-sage"
                  }`}
                  key={category.id}
                >
                  <div className="flex-1">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <h3 className="text-xl font-semibold text-ink">
                        {category.name}
                      </h3>
                    </div>
                    <p className="mb-4 text-sm text-muted">
                      内容数量：{category.contentCount} ｜ 结构置信度：
                      {Math.round(category.confidence * 100)}%
                    </p>
                    <p className="leading-7 text-muted">
                      {category.description}
                    </p>

                    <div className="mt-4 rounded-lg bg-panel p-4">
                      <p className="text-sm font-semibold text-ink">
                        二级主题（{category.topicCount}）
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {category.topKeywords.map((keyword) => (
                          <button
                            className="rounded-full bg-sage/10 px-3 py-1 text-xs font-medium text-sage transition hover:bg-sage/20 focus:outline-none focus:ring-2 focus:ring-sage focus:ring-offset-2"
                            key={keyword}
                            type="button"
                            onClick={() =>
                              selectCategoryKeyword(category.id, keyword)
                            }
                          >
                            {keyword}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg border border-sage bg-white px-5 text-sm font-semibold text-sage transition hover:bg-sage/10 focus:outline-none focus:ring-2 focus:ring-sage focus:ring-offset-2"
                    type="button"
                    onClick={() => selectCategory(category.id)}
                  >
                    查看详情
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="kb-card p-8 text-center text-muted">
            没有找到匹配的分类。
          </div>
        )}
      </section>

      <section className="mb-8 scroll-mt-6" ref={detailRef}>
        <div className="mb-4">
          <p className="kb-label mb-2">领域详情</p>
          <h2 className="text-2xl font-semibold text-ink">
            {selectedCategory ? selectedCategory.name : "暂无分类"}
          </h2>
          {selectedCategory ? (
            <>
              <p className="mt-2 max-w-3xl leading-7 text-muted">
                {selectedCategory.description}
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                这个领域目前收纳了 {selectedCategory.sourceContentCount} 条相关内容，关键词用于搜索和关联，方便你继续整理。
              </p>
            </>
          ) : null}
        </div>

        {selectedCategory ? (
          <div className="grid gap-4">
            {selectedCategory.topics.map((topic) => {
              const shouldHighlightTopic =
                activeKeyword?.categoryId === selectedCategory.id &&
                topicMatchesKeyword(topic, activeKeyword.keyword);

              return (
                <article
                  className={`kb-card p-5 transition ${
                    shouldHighlightTopic
                      ? "border-sage bg-sage/5"
                      : ""
                  }`}
                  key={topic.id}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h3
                        className={`text-lg font-semibold ${
                          shouldHighlightTopic ? "text-sage" : "text-ink"
                        }`}
                      >
                        {topic.name}
                        <span className="ml-2 text-sm font-medium text-muted">
                          （{topic.contentCount}）
                        </span>
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {topic.topKeywords.map((keyword) => (
                        <span
                          className="rounded-lg bg-panel px-2.5 py-1 text-xs text-ink"
                          key={keyword}
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {topic.contents.map((content) => {
                      const shouldHighlightContent =
                        activeKeyword?.categoryId === selectedCategory.id &&
                        contentMatchesKeyword(content, activeKeyword.keyword);

                      return (
                        <div
                          className={`rounded-lg border bg-white p-4 transition hover:border-sage ${
                            shouldHighlightContent
                              ? "border-sage bg-sage/5"
                              : "border-line"
                          }`}
                          key={content.id}
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                                <span className="rounded-full bg-sage/10 px-3 py-1 font-semibold text-sage">
                                  {content.platform}
                                </span>
                                <span className="text-muted">
                                  {content.author}
                                </span>
                              </div>
                              <h4
                                className={`font-semibold ${
                                  shouldHighlightContent
                                    ? "text-sage"
                                    : "text-ink"
                                }`}
                              >
                                {content.title}
                              </h4>
                              <p className="mt-2 line-clamp-1 text-sm leading-6 text-muted">
                                {content.summary}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-3 text-sm">
                              <time className="text-muted">
                                {content.parsedAt}
                              </time>
                              {isDatabaseContentId(content.id) ? (
                                <button
                                  className="font-semibold text-muted transition hover:text-coral"
                                  disabled={deletingContentId === content.id}
                                  type="button"
                                  onClick={() => deleteContent(content.id)}
                                >
                                  删除
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap gap-2">
                              {content.topKeywords.slice(0, 3).map((keyword) => (
                                <span
                                  className="rounded-lg bg-panel px-2.5 py-1 text-xs text-ink"
                                  key={keyword}
                                >
                                  {keyword}
                                </span>
                              ))}
                            </div>
                            <Link
                              className="text-sm font-semibold text-sage hover:text-coral"
                              href={getContentHref(content.id)}
                            >
                              查看知识包
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="kb-card p-8 text-center text-muted">
            暂无可展开的领域详情。
          </div>
        )}
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-ink">最近新增内容</h2>
        </div>

        {filteredRecentContents.length > 0 ? (
          <div className="grid gap-3">
            {filteredRecentContents.map((content) => (
              <article
                className="kb-card block p-4 transition hover:border-sage"
                key={content.id}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-full bg-coral/10 px-3 py-1 font-semibold text-coral">
                        {content.platform}
                      </span>
                      <span className="text-muted">{content.categoryPath}</span>
                    </div>
                    <h3 className="font-semibold text-ink">{content.title}</h3>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <time className="text-muted">{content.parsedAt}</time>
                    {isDatabaseContentId(content.id) ? (
                      <button
                        className="font-semibold text-muted transition hover:text-coral"
                        disabled={deletingContentId === content.id}
                        type="button"
                        onClick={() => deleteContent(content.id)}
                      >
                        删除
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {content.topKeywords.slice(0, 3).map((keyword) => (
                      <span
                        className="rounded-lg bg-panel px-2.5 py-1 text-xs text-ink"
                        key={keyword}
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                  <Link
                    className="text-sm font-semibold text-sage hover:text-coral"
                    href={getContentHref(content.id)}
                  >
                    查看知识包
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="kb-card p-8 text-center text-muted">
            没有找到匹配的最近新增内容。
          </div>
        )}
      </section>
        </>
      ) : null}

      {activeView === "table" ? (
        <section>
          {deleteError ? (
            <div className="mb-5 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-medium text-coral">
              {deleteError}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-ink">表格视图</h2>
              <p className="mt-2 text-sm text-muted">
                按内容查看知识包，适合快速检索、筛选和回看。
              </p>
            </div>
            <span className="text-sm text-muted">{rowsForTable.length} 条内容</span>
          </div>

          {rowsForTable.length > 0 ? (
            <div className="kb-card overflow-x-auto p-0">
              <table className="min-w-[980px] text-left text-sm">
                <thead className="bg-panel text-xs font-semibold text-muted">
                  <tr>
                    <th className="px-4 py-3">标题</th>
                    <th className="px-4 py-3">来源</th>
                    <th className="px-4 py-3">作者</th>
                    <th className="px-4 py-3">所属领域</th>
                    <th className="px-4 py-3">所属主题</th>
                    <th className="px-4 py-3">Top 关键词</th>
                    <th className="px-4 py-3">解析时间</th>
                    <th className="px-4 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rowsForTable.map((row) => (
                    <tr className="align-top hover:bg-sage/5" key={row.id}>
                      <td className="max-w-[260px] px-4 py-4 font-semibold text-ink">
                        {row.title}
                      </td>
                      <td className="px-4 py-4 text-muted">{row.platform}</td>
                      <td className="px-4 py-4 text-muted">{row.author}</td>
                      <td className="px-4 py-4 text-ink">{row.categoryName}</td>
                      <td className="px-4 py-4 text-ink">{row.topicName}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {row.topKeywords.slice(0, 3).map((keyword) => (
                            <span
                              className="rounded-full bg-sage/10 px-2 py-1 text-xs font-medium text-sage"
                              key={`${row.id}-${keyword}`}
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-muted">
                        {row.parsedAt}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex items-center gap-3">
                          <Link
                            className="font-semibold text-sage hover:text-coral"
                            href={getContentHref(row.id)}
                          >
                            查看知识包
                          </Link>
                          {isDatabaseContentId(row.id) ? (
                            <button
                              className="font-semibold text-muted transition hover:text-coral"
                              disabled={deletingContentId === row.id}
                              type="button"
                              onClick={() => deleteContent(row.id)}
                            >
                              删除
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="kb-card p-8 text-center text-muted">
              没有找到匹配的内容
            </div>
          )}
        </section>
      ) : null}

      {activeView === "mindmap" ? (
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-ink">思维导图</h2>
              <p className="mt-2 text-sm text-muted">
                按层级查看知识领域、二级主题和内容之间的结构。
              </p>
            </div>
            <span className="text-sm text-muted">
              {filteredCategories.length} 个知识领域
            </span>
          </div>

          {filteredCategories.length > 0 ? (
            <div className="kb-card overflow-x-auto p-6">
              <div className="min-w-[980px]">
                <MindMapView
                  collapsedCategories={collapsedCategories}
                  collapsedTopics={collapsedTopics}
                  onToggleCategory={(categoryId) =>
                    toggleSetItem(setCollapsedCategories, categoryId)
                  }
                  onToggleTopic={(topicId) =>
                    toggleSetItem(setCollapsedTopics, topicId)
                  }
                  tree={treeForMindMap}
                />
              </div>
            </div>
          ) : (
            <div className="kb-card p-8 text-center text-muted">
              没有可展示的知识结构
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
