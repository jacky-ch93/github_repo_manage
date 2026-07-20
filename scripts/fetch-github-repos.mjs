import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_ACADEMIC_CATEGORIES,
  classifyRepository,
  repositoryCategories,
} from "./classify-repository.mjs";

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.REPO_STATS_TOKEN;
const owner = process.env.GITHUB_OWNER;
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const outputPath = process.env.OUTPUT_PATH || "data/repos.json";
const lfsScanLimit = Number(process.env.LFS_POINTER_SCAN_LIMIT || 120);
const scanLfs = process.env.SCAN_LFS !== "false";
const taxonomyRulesPath = process.env.CATEGORY_RULES_PATH || "config/academic-taxonomy.json";

if (!token) {
  console.error("Missing GITHUB_TOKEN, GH_TOKEN, or REPO_STATS_TOKEN.");
  process.exit(1);
}

const viewer = owner || (await api("/user")).login;
const taxonomyRules = await loadTaxonomyRules();
const previousRepositories = await loadPreviousRepositories();
const repositories = await collectRepositories(viewer);
const enriched = [];

for (const [index, repo] of repositories.entries()) {
  console.log(`[${index + 1}/${repositories.length}] ${repo.full_name}`);
  const content = await inspectRepositoryContent(repo);
  const categories = classifyRepository(repo, content, taxonomyRules);
  const lfs = await scanLfsPointers(repo, content.tree, previousRepositories.get(repo.name));
  enriched.push({
    name: repo.name,
    description: repo.description,
    visibility: repo.private ? "private" : "public",
    url: repo.html_url,
    category: categories[0],
    categories,
    primaryLanguage: repo.language,
    topics: repo.topics || [],
    sizeBytes: (repo.size || 0) * 1024,
    lfsBytes: lfs.bytes,
    lfsPointerCount: lfs.count,
    lfsScanStatus: lfs.status,
    stars: repo.stargazers_count || 0,
    forks: repo.forks_count || 0,
    watchers: repo.watchers_count || 0,
    openIssues: repo.open_issues_count || 0,
    archived: Boolean(repo.archived),
    disabled: Boolean(repo.disabled),
    fork: Boolean(repo.fork),
    isTemplate: Boolean(repo.is_template),
    defaultBranch: repo.default_branch,
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at,
  });
}

const data = {
  generatedAt: new Date().toISOString(),
  owner: viewer,
  classification: {
    scheme: "academic-multilabel-v1",
    maxCategories: MAX_ACADEMIC_CATEGORIES,
  },
  summary: buildSummary(enriched),
  repositories: enriched.sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0)),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Wrote ${enriched.length} repositories to ${outputPath}`);

async function collectRepositories(login) {
  const repos = [];
  let page = 1;
  while (true) {
    const chunk = await api(`/user/repos?affiliation=owner&visibility=all&sort=updated&per_page=100&page=${page}`);
    if (!chunk.length) break;
    repos.push(...chunk.filter((repo) => repo.owner?.login?.toLowerCase() === login.toLowerCase()));
    page += 1;
  }
  return repos;
}

async function inspectRepositoryContent(repo) {
  if (!repo.default_branch) return { readme: "", paths: [], tree: null };

  const [readmePayload, tree] = await Promise.all([
    apiOptional(`/repos/${repo.owner.login}/${repo.name}/readme`),
    apiOptional(`/repos/${repo.owner.login}/${repo.name}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`),
  ]);

  const readme = readmePayload?.content
    ? Buffer.from(readmePayload.content, readmePayload.encoding || "base64").toString("utf8").slice(0, 120_000)
    : "";
  const paths = Array.isArray(tree?.tree)
    ? tree.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path).slice(0, 8_000)
    : [];

  return { readme, paths, tree };
}

async function scanLfsPointers(repo, treePayload, previous) {
  if (!scanLfs) {
    return {
      bytes: previous?.lfsBytes || 0,
      count: previous?.lfsPointerCount || 0,
      status: previous ? "preserved" : "disabled",
    };
  }
  if (!repo.default_branch) return { bytes: 0, count: 0, status: "no-default-branch" };

  try {
    if (!Array.isArray(treePayload?.tree)) return { bytes: 0, count: 0, status: "no-tree" };
    const tree = treePayload.tree;

    if (!(await treeUsesLfs(repo, tree))) {
      return { bytes: 0, count: 0, status: "no-lfs-attributes" };
    }

    const candidates = tree
      .filter((entry) => entry.type === "blob" && entry.size >= 90 && entry.size <= 300)
      .slice(0, lfsScanLimit);

    let bytes = 0;
    let count = 0;
    for (const entry of candidates) {
      const blob = await api(`/repos/${repo.owner.login}/${repo.name}/git/blobs/${entry.sha}`);
      const text = Buffer.from(blob.content || "", blob.encoding || "base64").toString("utf8");
      const match = text.match(/^version https:\/\/git-lfs.github.com\/spec\/v1\n(?:oid sha256:[a-f0-9]{64}\n)?size (\d+)\n?$/m);
      if (match) {
        bytes += Number(match[1]);
        count += 1;
      }
    }

    return {
      bytes,
      count,
      status: candidates.length >= lfsScanLimit ? "partial" : "complete",
    };
  } catch (error) {
    return { bytes: 0, count: 0, status: `error:${error.status || "unknown"}` };
  }
}

async function treeUsesLfs(repo, tree) {
  const attributes = tree.filter((entry) => entry.type === "blob" && entry.path.endsWith(".gitattributes"));
  if (!attributes.length) return false;

  for (const entry of attributes) {
    const blob = await api(`/repos/${repo.owner.login}/${repo.name}/git/blobs/${entry.sha}`);
    const text = Buffer.from(blob.content || "", blob.encoding || "base64").toString("utf8");
    if (/filter=lfs/.test(text)) return true;
  }

  return false;
}

function buildSummary(repos) {
  return {
    total: repos.length,
    public: repos.filter((repo) => repo.visibility === "public").length,
    private: repos.filter((repo) => repo.visibility === "private").length,
    archived: repos.filter((repo) => repo.archived).length,
    active: repos.filter((repo) => !repo.archived).length,
    forks: repos.filter((repo) => repo.fork).length,
    sources: repos.filter((repo) => !repo.fork).length,
    templates: repos.filter((repo) => repo.isTemplate).length,
    totalSizeBytes: repos.reduce((sum, repo) => sum + repo.sizeBytes, 0),
    totalLfsBytes: repos.reduce((sum, repo) => sum + repo.lfsBytes, 0),
    categories: countBy(repos.flatMap(repositoryCategories)),
    languages: countBy(repos.map((repo) => repo.primaryLanguage || "Unknown")),
    topics: countBy(repos.flatMap((repo) => repo.topics || [])),
  };
}

async function loadTaxonomyRules() {
  try {
    const raw = await readFile(taxonomyRulesPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.categories) ? parsed.categories : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function loadPreviousRepositories() {
  try {
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw);
    return new Map((parsed.repositories || []).map((repo) => [repo.name, repo]));
  } catch (error) {
    if (error.code === "ENOENT") return new Map();
    throw error;
  }
}

async function apiOptional(route) {
  try {
    return await api(route);
  } catch (error) {
    if ([404, 409, 422].includes(error.status)) return null;
    throw error;
  }
}

function countBy(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

async function api(route) {
  const url = route.startsWith("http") ? route : `${apiBase}${route}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "github-repo-manage-dashboard",
    },
  });

  if (!res.ok) {
    const error = new Error(`GitHub API ${res.status}: ${url}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}
