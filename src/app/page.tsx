"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createParseTask,
  getParseTaskById,
  type ParseTaskResult,
} from "@/lib/data-access";

const statusSteps = [
  "submitted",
  "detecting_source",
  "extracting_content",
  "generating_transcript",
  "generating_knowledge_pack",
  "completed",
] as const;

const statusLabels: Record<ParseTaskResult["task"]["status"], string> = {
  submitted: "已提交",
  detecting_source: "正在识别链接来源",
  extracting_content: "正在提取内容信息",
  generating_transcript: "正在生成逐字稿",
  generating_knowledge_pack: "正在生成知识包",
  completed: "已完成",
  failed: "解析失败",
};

const activeStatuses = new Set<ParseTaskResult["task"]["status"]>([
  "submitted",
  "detecting_source",
  "extracting_content",
  "generating_transcript",
  "generating_knowledge_pack",
]);

function getStepIndex(status?: ParseTaskResult["task"]["status"]) {
  if (!status) {
    return -1;
  }

  if (status === "failed") {
    return statusSteps.findIndex((step) => step === "generating_transcript");
  }

  return statusSteps.findIndex((step) => step === status);
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [taskResult, setTaskResult] = useState<ParseTaskResult | null>(null);
  const [requestError, setRequestError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (!taskResult?.task.id || !activeStatuses.has(taskResult.task.status)) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const latestTask = await getParseTaskById(taskResult.task.id);

        setTaskResult(latestTask);
        setStatusMessage(latestTask.message ?? "");
      } catch (error) {
        setStatusMessage(
          error instanceof Error ? error.message : "任务状态查询失败。",
        );
      }
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [taskResult]);

  useEffect(() => {
    const contentId = taskResult?.task.content_id;

    if (
      !taskResult ||
      taskResult.task.status !== "completed" ||
      !contentId ||
      hasNavigatedRef.current
    ) {
      return;
    }

    hasNavigatedRef.current = true;
    router.push(`/content/${contentId}`);
  }, [router, taskResult]);

  const startParsing = async () => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      return;
    }

    setIsSubmitting(true);
    setRequestError("");
    setStatusMessage("");
    setTaskResult(null);
    hasNavigatedRef.current = false;
    setSubmittedAt(
      new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date()),
    );

    try {
      const result = await createParseTask(trimmedUrl);

      setTaskResult(result);
      setStatusMessage(result.message ?? "");
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : "解析任务提交失败。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentTask = taskResult?.task;
  const isSubmitted = Boolean(currentTask || requestError);
  const currentStatus = currentTask
    ? statusLabels[currentTask.status]
    : requestError
      ? "解析失败"
      : "等待提交";
  const progress = currentTask?.progress ?? 0;
  const stepIndex = getStepIndex(currentTask?.status);
  const contentId = currentTask?.content_id ?? taskResult?.contentId ?? "";
  const canViewContent =
    currentTask?.status === "completed" && typeof contentId === "string" && contentId.length > 0;
  const isTaskRunning = currentTask ? activeStatuses.has(currentTask.status) : false;

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
              aria-label="内容链接"
              className="kb-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="粘贴文章、播客或视频链接"
              disabled={isSubmitting || isTaskRunning}
            />
            <button
              className="kb-button shrink-0"
              type="button"
              onClick={startParsing}
              disabled={isSubmitting || isTaskRunning}
            >
              生成知识包
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            首页会根据真实任务状态轮询显示进度，不再使用本地假进度。
          </p>
          <div className="mt-5">
            <Link href="/content/demo-001" className="kb-button-secondary">
              查看示例知识包
            </Link>
          </div>
        </div>

        <div className="kb-card min-h-[360px] p-6">
          {!isSubmitted ? (
            <div className="flex h-full min-h-[300px] flex-col justify-center">
              <p className="kb-label mb-3">任务状态</p>
              <h2 className="text-2xl font-semibold text-ink">
                知识包生成进度
              </h2>
              <p className="mt-4 leading-7 text-muted">
                提交链接后，你可以看到来源识别、内容提取、逐字稿生成和知识包整理的真实任务状态。
              </p>
            </div>
          ) : (
            <article>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="kb-label mb-3">解析任务</p>
                  <h2 className="text-2xl font-semibold leading-snug text-ink">
                    {currentTask?.title || "等待解析"}
                  </h2>
                </div>
                <span className="rounded-full bg-sage/10 px-3 py-1 text-xs font-semibold text-sage">
                  {currentStatus}
                </span>
              </div>

              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">链接</dt>
                  <dd className="mt-1 break-all font-medium text-ink">
                    {currentTask?.url || url.trim()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">来源平台</dt>
                  <dd className="mt-1 font-medium text-ink">
                    {currentTask?.platform || "待识别"}
                  </dd>
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

              {statusMessage ? (
                <p className="mt-4 rounded-lg bg-panel p-3 text-sm leading-6 text-muted">
                  {statusMessage}
                </p>
              ) : null}

              {requestError ? (
                <p className="mt-4 rounded-lg bg-panel p-3 text-sm leading-6 text-coral">
                  {requestError}
                </p>
              ) : null}

              {currentTask?.status === "failed" && currentTask.error_message ? (
                <p className="mt-4 rounded-lg bg-panel p-3 text-sm leading-6 text-coral">
                  {currentTask.error_message}
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
                  <li className="flex items-center gap-3 text-sm" key={step}>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        index <= stepIndex ? "bg-sage" : "bg-line"
                      }`}
                    />
                    <span
                      className={index <= stepIndex ? "text-ink" : "text-muted"}
                    >
                      {statusLabels[step]}
                    </span>
                  </li>
                ))}
              </ol>

              {canViewContent ? (
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
