import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KnowBase",
  description: "本地 mock 知识库 MVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
