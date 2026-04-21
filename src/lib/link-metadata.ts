import "server-only";

import {
  decideTranscriptSource,
  type TranscriptSourceDecision,
} from "@/lib/source-adapters/xiaoyuzhou";

export type LinkMetadata = {
  url: string;
  canonicalUrl?: string;
  title?: string;
  siteName?: string;
  platform?: string;
  description?: string;
  author?: string;
  publishedAt?: string;
  audioUrl?: string;
  coverUrl?: string;
  durationSeconds?: number;
  transcriptSourceDecision?: TranscriptSourceDecision;
};

const requestTimeoutMs = 6000;

type XiaoyuzhouEpisodeData = {
  title?: string;
  description?: string;
  shownotes?: string;
  pubDate?: string;
  enclosure?: {
    url?: string;
  };
  duration?: number;
  media?: {
    source?: {
      url?: string;
    };
  };
  podcast?: {
    title?: string;
    author?: string;
    description?: string;
    image?: {
      picUrl?: string;
    };
    podcasters?: Array<{
      nickname?: string;
    }>;
  };
};

export function normalizeSubmittedUrl(input: string) {
  const trimmed = input.trim();
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);

  url.hash = "";

  return url.toString();
}

function getGitHubInfo(url: URL) {
  if (url.hostname !== "github.com") {
    return null;
  }

  const [owner, repo] = url.pathname.split("/").filter(Boolean);

  if (!owner || !repo) {
    return null;
  }

  return {
    owner,
    repo,
    title: `${repo} · ${owner}`,
  };
}

export function isXiaoyuzhouEpisodeUrl(inputUrl: string) {
  try {
    const url = new URL(inputUrl);

    return (
      (url.hostname === "www.xiaoyuzhoufm.com" ||
        url.hostname === "xiaoyuzhoufm.com") &&
      /^\/episode\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isXiaoyuzhouEpisode(url: URL) {
  return (
    (url.hostname === "www.xiaoyuzhoufm.com" ||
      url.hostname === "xiaoyuzhoufm.com") &&
    /^\/episode\/[^/]+\/?$/.test(url.pathname)
  );
}

function titleFromPath(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);

  if (!lastSegment) {
    return undefined;
  }

  try {
    return decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return lastSegment.replace(/[-_]+/g, " ").trim();
  }
}

export function readableTitleFromUrl(inputUrl: string) {
  try {
    const url = new URL(inputUrl);
    const githubInfo = getGitHubInfo(url);

    return githubInfo?.title ?? titleFromPath(url) ?? url.hostname;
  } catch {
    return undefined;
  }
}

export function platformFromUrl(inputUrl: string) {
  try {
    const url = new URL(inputUrl);

    if (isXiaoyuzhouEpisode(url)) {
      return "小宇宙";
    }

    return getGitHubInfo(url) ? "GitHub" : url.hostname;
  } catch {
    return undefined;
  }
}

export function authorFromUrl(inputUrl: string) {
  try {
    const url = new URL(inputUrl);

    return getGitHubInfo(url)?.owner;
  } catch {
    return undefined;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAttributes(tag: string) {
  const attributes = new Map<string, string>();
  const attributePattern =
    /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag))) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? "";

    attributes.set(name.toLowerCase(), decodeHtmlEntities(value));
  }

  return attributes;
}

function getMetaContent(html: string, names: string[]) {
  const normalizedNames = names.map((name) => name.toLowerCase());
  const metaPattern = /<meta\s+[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = metaPattern.exec(html))) {
    const attributes = parseAttributes(match[0]);
    const key = attributes.get("property") ?? attributes.get("name");

    if (key && normalizedNames.includes(key.toLowerCase())) {
      const content = attributes.get("content");

      if (content) {
        return content;
      }
    }
  }

  return undefined;
}

function getScriptContent(html: string, attributesPattern: string) {
  const scriptPattern = new RegExp(
    `<script[^>]*${attributesPattern}[^>]*>([\\s\\S]*?)<\\/script>`,
    "i",
  );
  const match = html.match(scriptPattern);

  return match?.[1]?.trim();
}

function getTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}

function getCanonicalUrl(html: string, baseUrl: string) {
  const linkPattern = /<link\s+[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html))) {
    const attributes = parseAttributes(match[0]);
    const rel = attributes.get("rel");
    const href = attributes.get("href");

    if (rel?.toLowerCase().split(/\s+/).includes("canonical") && href) {
      try {
        const canonicalUrl = new URL(href, baseUrl);

        canonicalUrl.hash = "";

        return canonicalUrl.toString();
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function toIsoDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function stripHtmlTags(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(text).trim() || undefined;
}

function parseJson<T>(value: string | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function parseXiaoyuzhouEpisodeData(html: string) {
  const nextData = parseJson<{
    props?: {
      pageProps?: {
        episode?: XiaoyuzhouEpisodeData;
      };
    };
  }>(getScriptContent(html, 'id="__NEXT_DATA__"'));
  const episode = nextData?.props?.pageProps?.episode;
  const schemaEpisode = parseJson<{
    name?: string;
    description?: string;
    datePublished?: string;
    associatedMedia?: {
      contentUrl?: string;
    };
    partOfSeries?: {
      name?: string;
    };
  }>(getScriptContent(html, 'name="schema:podcast-show"'));
  const description =
    stripHtmlTags(episode?.description) ||
    stripHtmlTags(episode?.shownotes) ||
    stripHtmlTags(schemaEpisode?.description);
  const author =
    episode?.podcast?.author ||
    episode?.podcast?.podcasters?.find((podcaster) => podcaster.nickname)?.nickname;
  const durationSeconds = episode?.duration;
  const audioUrl =
    episode?.media?.source?.url ||
    episode?.enclosure?.url ||
    schemaEpisode?.associatedMedia?.contentUrl;
  const transcriptSourceDecision = decideTranscriptSource({
    candidateRoots: [nextData, schemaEpisode, episode],
    description: episode?.description,
    shownotes: episode?.shownotes,
    audioUrl,
    durationSeconds,
  });

  return {
    title: episode?.title || schemaEpisode?.name,
    description,
    publishedAt: toIsoDate(episode?.pubDate || schemaEpisode?.datePublished),
    author,
    audioUrl,
    coverUrl: episode?.podcast?.image?.picUrl,
    podcastTitle: episode?.podcast?.title || schemaEpisode?.partOfSeries?.name,
    durationSeconds,
    transcriptSourceDecision,
  };
}

function fallbackMetadata(url: string): LinkMetadata {
  try {
    const parsedUrl = new URL(url);
    const githubInfo = getGitHubInfo(parsedUrl);
    const hostname = parsedUrl.hostname;

    return {
      url,
      title: githubInfo?.title ?? titleFromPath(parsedUrl) ?? hostname,
      platform: isXiaoyuzhouEpisode(parsedUrl)
        ? "小宇宙"
        : githubInfo
          ? "GitHub"
          : hostname,
      author: githubInfo?.owner,
    };
  } catch {
    return {
      url,
    };
  }
}

export async function extractLinkMetadata(inputUrl: string): Promise<LinkMetadata> {
  let normalizedUrl: string;

  try {
    normalizedUrl = normalizeSubmittedUrl(inputUrl);
  } catch {
    return fallbackMetadata(inputUrl.trim());
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; KnowBaseBot/0.1; +https://knowbase.local)",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return fallbackMetadata(normalizedUrl);
    }

    const html = await response.text();
    const finalUrl = response.url || normalizedUrl;
    const parsedFinalUrl = new URL(finalUrl);
    const hostname = parsedFinalUrl.hostname;
    const githubInfo = getGitHubInfo(parsedFinalUrl);
    const isXiaoyuzhouEpisodePage = isXiaoyuzhouEpisode(parsedFinalUrl);
    const canonicalUrl = getCanonicalUrl(html, finalUrl);
    const siteName =
      getMetaContent(html, ["og:site_name"]) ??
      getMetaContent(html, ["application-name"]);
    const metaTitle =
      getMetaContent(html, ["og:title"]) ??
      getMetaContent(html, ["twitter:title"]) ??
      getTitle(html);
    const fallbackTitle =
      githubInfo?.title ?? titleFromPath(parsedFinalUrl) ?? hostname;
    const title =
      metaTitle && metaTitle.toLowerCase() !== hostname.toLowerCase()
        ? metaTitle
        : fallbackTitle;
    const description =
      getMetaContent(html, ["description"]) ??
      getMetaContent(html, ["og:description"]);
    const author =
      getMetaContent(html, ["article:author"]) ??
      getMetaContent(html, ["author"]) ??
      githubInfo?.owner;
    const publishedAt = toIsoDate(
      getMetaContent(html, ["article:published_time"]),
    );

    if (isXiaoyuzhouEpisodePage) {
      const episodeData = parseXiaoyuzhouEpisodeData(html);
      const sourceUrl = canonicalUrl || finalUrl;

      return {
        url: finalUrl,
        canonicalUrl: sourceUrl,
        title:
          episodeData.title ||
          metaTitle ||
          titleFromPath(parsedFinalUrl) ||
          hostname,
        siteName: "小宇宙",
        platform: "小宇宙",
        description:
          episodeData.description ||
          description ||
          episodeData.podcastTitle,
        author: episodeData.author,
        publishedAt: episodeData.publishedAt,
        audioUrl: episodeData.audioUrl || getMetaContent(html, ["og:audio"]),
        coverUrl: episodeData.coverUrl || getMetaContent(html, ["og:image"]),
        durationSeconds: episodeData.durationSeconds,
        transcriptSourceDecision: episodeData.transcriptSourceDecision,
      };
    }

    if (githubInfo) {
      return {
        url: finalUrl,
        canonicalUrl,
        title: githubInfo.title,
        siteName: "GitHub",
        platform: "GitHub",
        description,
        author: githubInfo.owner,
        publishedAt,
      };
    }

    return {
      url: finalUrl,
      canonicalUrl,
      title,
      siteName,
      platform: siteName ?? (githubInfo ? "GitHub" : hostname),
      description,
      author,
      publishedAt,
    };
  } catch {
    return fallbackMetadata(normalizedUrl);
  } finally {
    clearTimeout(timeout);
  }
}
