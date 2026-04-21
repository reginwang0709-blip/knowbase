import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getKnowledgeItemById } from "@/lib/data-access";
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
  const item = await getKnowledgeItemById(id, await getRequestBaseUrl());

  if (!item) {
    notFound();
  }

  const displayItem = {
    ...item,
    author: item.author || "未识别",
    publishedAt: item.publishedAt || "未识别",
    summary: item.summary || "暂未提取到网页摘要。",
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
