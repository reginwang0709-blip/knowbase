"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createParseTask } from "@/lib/data-access";

const statusSteps = [
  "已提交",
  "正在识别链接来源",
  "正在提取内容信息",
  "正在生成逐字稿",
  "正在生成知识包",
  "已完成",
];

const defaultUrl = "https://www.xiaoyuzhoufm.com/episode/demo-001";
const fallbackContentId = "demo-001";

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState(defaultUrl);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [submittedAt, setSubmittedAt] = useState("");
  const [contentId, setContentId] = useState(fallbackContentId);
  const [isParseRequestDone, setIsParseRequestDone] = useState(false);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (!isSubmitted || stepIndex >= statusSteps.length - 1) {
      return;
    }

    const timer = window.setTimeout(() => {
      setStepIndex((current) => current + 1);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [isSubmitted, stepIndex]);

  useEffect(() => {
    if (
      !isSubmitted ||
      !isParseRequestDone ||
      hasNavigatedRef.current ||
      stepIndex < statusSteps.length - 1
    ) {
      return;
    }

    hasNavigatedRef.current = true;
    router.push(`/content/${contentId}`);
  }, [
    contentId,
    isParseRequestDone,
    isSubmitted,
    router,
    stepIndex,
  ]);

  const progress = Math.round(((stepIndex + 1) / statusSteps.length) * 100);
  const currentStatus = statusSteps[stepIndex];

  const startParsing = async () => {
    setSubmittedAt(
      new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    );
    setIsSubmitted(true);
    setStepIndex(0);
    setContentId(fallbackContentId);
    setIsParseRequestDone(false);
    setIsUsingFallback(false);
    hasNavigatedRef.current = false;

    try {
      const result = await createParseTask(url);

      setContentId(result.contentId);
    } catch {
      setContentId(fallbackContentId);
      setIsUsingFallback(true);
    } finally {
      setIsParseRequestDone(true);
    }
  };

  return (
    <main className="kb-container">
      <nav className="mb-10 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-ink">
          KnowBase
        </Link>
        <Link href="/library" className="kb-button-secondary">
          进入知识库
        </Link>
      </nav>

      <section className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
        <div className="pt-8">
          <p className="kb-label mb-4">链接生成知识包</p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
            把播客、文章和视频整理成可回看的知识库
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted">
            粘贴一个链接，系统会提取内容、生成逐字稿与结构化知识包，并自动沉淀到你的知识库中。
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <input
              aria-label="小宇宙链接"
              className="kb-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="粘贴小宇宙、YouTube 或网页链接"
              disabled={isSubmitted && !isParseRequestDone}
            />
            <button
              className="kb-button shrink-0"
              type="button"
              onClick={startParsing}
              disabled={isSubmitted && !isParseRequestDone}
            >
              生成知识包
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            当前为本地演示版本，处理进度和结果使用 mock 数据。
          </p>
        </div>

        <div className="kb-card min-h-[360px] p-6">
          {!isSubmitted ? (
            <div className="flex h-full min-h-[300px] flex-col justify-center">
              <p className="kb-label mb-3">任务状态</p>
              <h2 className="text-2xl font-semibold text-ink">
                知识包生成进度
              </h2>
              <p className="mt-4 leading-7 text-muted">
                提交链接后，你可以看到来源识别、内容提取、逐字稿生成和知识包整理的完整进度。
              </p>
              <p className="mt-3 leading-7 text-muted">
                生成完成后，可以直接进入知识包或回到知识库继续管理。
              </p>
            </div>
          ) : (
            <article>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="kb-label mb-3">解析任务</p>
                  <h2 className="text-2xl font-semibold leading-snug text-ink">
                    从个人知识库到行动系统：如何让信息真正复用
                  </h2>
                </div>
                <span className="rounded-full bg-sage/10 px-3 py-1 text-xs font-semibold text-sage">
                  {currentStatus}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">链接</dt>
                  <dd className="mt-1 break-all font-medium text-ink">{url}</dd>
                </div>
                <div>
                  <dt className="text-muted">来源平台</dt>
                  <dd className="mt-1 font-medium text-ink">小宇宙</dd>
                </div>
                <div>
                  <dt className="text-muted">提交时间</dt>
                  <dd className="mt-1 font-medium text-ink">{submittedAt}</dd>
                </div>
                <div>
                  <dt className="text-muted">状态</dt>
                  <dd className="mt-1 font-medium text-ink">{currentStatus}</dd>
                </div>
              </dl>
              {isUsingFallback ? (
                <p className="mt-4 rounded-lg bg-panel p-3 text-sm leading-6 text-muted">
                  当前使用演示内容，生成完成后会打开 demo 知识包。
                </p>
              ) : null}

              <div className="mt-7">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">解析进度</span>
                  <span className="text-muted">{progress}%</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-panel">
                  <div
                    className="h-full rounded-full bg-coral transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <ol className="mt-6 space-y-3">
                {statusSteps.map((step, index) => (
                  <li
                    className="flex items-center gap-3 text-sm"
                    key={step}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        index <= stepIndex ? "bg-sage" : "bg-line"
                      }`}
                    />
                    <span
                      className={index <= stepIndex ? "text-ink" : "text-muted"}
                    >
                      {step}
                    </span>
                  </li>
                ))}
              </ol>

              {currentStatus === "已完成" ? (
                <Link className="kb-button mt-8" href={`/content/${contentId}`}>
                  查看知识包
                </Link>
              ) : null}
            </article>
          )}
        </div>
      </section>
    </main>
  );
}
