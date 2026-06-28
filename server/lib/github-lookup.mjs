const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text);
}

export function findGitHubRepoRefs(text) {
  if (typeof text !== "string" || !/(github|仓库|repo|开源项目|项目)/iu.test(text)) {
    return [];
  }

  const refs = new Map();
  const patterns = [
    /(?:https?:\/\/)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})(?:\.git)?/giu,
    /\b([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})(?:\.git)?\b/gu,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const owner = match[1];
      const repo = match[2]?.replace(/(?:\.git)?[).,，。；;:：!?！？]+$/u, "");
      if (!owner || !repo || repo.includes("/")) {
        continue;
      }
      refs.set(`${owner}/${repo}`.toLowerCase(), { owner, repo });
      if (refs.size >= 3) {
        return [...refs.values()];
      }
    }
  }
  return [...refs.values()];
}

export async function fetchGitHubRepoLookup(ref, options) {
  const baseUrl = (options.githubApiBaseUrl ?? DEFAULT_GITHUB_API_BASE_URL).replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ChisaTalk-Server",
      },
    });
    if (response.status === 404) {
      return {
        fullName: `${ref.owner}/${ref.repo}`,
        exists: false,
        note: "GitHub API 返回 404，公开仓库未找到。",
      };
    }
    if (!response.ok) {
      return {
        fullName: `${ref.owner}/${ref.repo}`,
        exists: null,
        note: `GitHub API 返回 HTTP ${response.status}，无法精确核验。`,
      };
    }
    const payload = await readJsonResponse(response);
    return {
      fullName:
        isRecord(payload) && typeof payload.full_name === "string"
          ? payload.full_name
          : `${ref.owner}/${ref.repo}`,
      exists: true,
      htmlUrl: isRecord(payload) && typeof payload.html_url === "string" ? payload.html_url : null,
      private: isRecord(payload) && typeof payload.private === "boolean" ? payload.private : null,
      archived: isRecord(payload) && typeof payload.archived === "boolean" ? payload.archived : null,
      pushedAt: isRecord(payload) && typeof payload.pushed_at === "string" ? payload.pushed_at : null,
    };
  } catch (error) {
    return {
      fullName: `${ref.owner}/${ref.repo}`,
      exists: null,
      note: `GitHub API 请求失败：${error instanceof Error ? error.message : "unknown error"}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildGitHubLookupSystemMessage(text, options) {
  const refs = findGitHubRepoRefs(text);
  if (refs.length === 0) {
    return null;
  }
  const lookups = await Promise.all(refs.map((ref) => fetchGitHubRepoLookup(ref, options)));
  const lines = lookups.map((lookup) => {
    if (lookup.exists === true) {
      return [
        `- ${lookup.fullName}: 存在`,
        lookup.htmlUrl ? `链接 ${lookup.htmlUrl}` : null,
        typeof lookup.private === "boolean" ? `private=${lookup.private}` : null,
        typeof lookup.archived === "boolean" ? `archived=${lookup.archived}` : null,
        lookup.pushedAt ? `pushed_at=${lookup.pushedAt}` : null,
      ]
        .filter(Boolean)
        .join("，");
    }
    if (lookup.exists === false) {
      return `- ${lookup.fullName}: 不存在，${lookup.note}`;
    }
    return `- ${lookup.fullName}: 无法核验，${lookup.note}`;
  });
  return [
    "GitHub 精确仓库查询结果（由 ChisaTalk Server 通过 GitHub API 实时核验）：",
    ...lines,
    "回答 GitHub 仓库是否存在时，以上精确查询结果优先于通用网页搜索结果。",
  ].join("\n");
}
