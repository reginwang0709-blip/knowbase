import Link from "next/link";
import { headers } from "next/headers";
import {
  ContentFetchError,
  getKnowledgeItemById,
} from "@/lib/data-access";
import type { KnowledgeItem } from "@/lib/mock-data";
import { truncateText } from "@/lib/source-adapters/xiaoyuzhou";
import KnowledgePackClient from "./KnowledgePackClient";

type ContentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

async function getRequestBaseUrl() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");

  if (!host) {
    return undefined;
  }

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

export default async function ContentPage({ params }: ContentPageProps) {
  const { id } = await params;
  let item: KnowledgeItem | undefined;
  let pageError: ContentFetchError | null = null;

  try {
    item = await getKnowledgeItemById(id, await getRequestBaseUrl());
  } catch (error) {
    pageError =
      error instanceof ContentFetchError
        ? error
        : new ContentFetchError("内容加载失败，请稍后重试。", 500);
  }

  if (!item || pageError) {
    const title = pageError?.status === 404 ? "内容不存在" : "内容加载失败";
    const description =
      pageError?.status === 404
        ? "这个知识包不存在，或者还没有生成完成。"
        : pageError?.message || "暂时无法加载这个知识包。";

    return (
      <main className="kb-container">
        <nav className="mb-8 flex items-center justify-between">
          <Link href="/library" className="kb-button-secondary">
            返回知识库
          </Link>
          <Link href="/" className="text-xl font-bold text-ink">
            KnowBase
          </Link>
        </nav>

        <section className="kb-card p-8">
          <p className="kb-label mb-3">知识包状态</p>
          <h1 className="text-3xl font-semibold text-ink">{title}</h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/" className="kb-button">
              返回首页
            </Link>
            <Link href="/content/demo-001" className="kb-button-secondary">
              查看示例知识包
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const displayItem = {
    ...item,
    author: item.author || "未识别",
    publishedAt: item.publishedAt || "未识别",
    summary: truncateText(item.summary || "暂未提取到网页摘要。", 200),
  };

  return (
    <main className="kb-container">
      <nav className="mb-8 flex items-center justify-between">
        <Link href="/library" className="kb-button-secondary">
          返回知识库
        </Link>
        <Link href="/" className="text-xl font-bold text-ink">
          KnowBase
        </Link>
      </nav>

      <KnowledgePackClient item={displayItem} />
    </main>
  );
}
