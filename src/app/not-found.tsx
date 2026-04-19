import Link from "next/link";

export default function NotFound() {
  return (
    <main className="kb-container">
      <section className="kb-card p-8 text-center">
        <p className="kb-label mb-3">未找到</p>
        <h1 className="text-3xl font-bold text-ink">这个知识包不存在</h1>
        <p className="mt-3 text-muted">请回到知识库查看已有内容。</p>
        <Link className="kb-button mt-6" href="/library">
          返回知识库
        </Link>
      </section>
    </main>
  );
}
