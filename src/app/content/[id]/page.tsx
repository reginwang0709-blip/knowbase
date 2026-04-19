import Link from "next/link";
import { notFound } from "next/navigation";
import { getKnowledgeItemById } from "@/lib/mock-data";
import KnowledgePackClient from "./KnowledgePackClient";

type ContentPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ContentPage({ params }: ContentPageProps) {
  const { id } = await params;
  const item = getKnowledgeItemById(id);

  if (!item) {
    notFound();
  }

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

      <KnowledgePackClient item={item} />
    </main>
  );
}
