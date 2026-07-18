const state = {
  repos: [],
  filtered: [],
  summary: null,
};

const els = {
  updatedAt: document.querySelector("#updatedAt"),
  totalRepos: document.querySelector("#totalRepos"),
  publicRepos: document.querySelector("#publicRepos"),
  privateRepos: document.querySelector("#privateRepos"),
  totalSize: document.querySelector("#totalSize"),
  lfsSize: document.querySelector("#lfsSize"),
  ownerName: document.querySelector("#ownerName"),
  taxonomy: document.querySelector("#taxonomy"),
  languageBars: document.querySelector("#languageBars"),
  repoList: document.querySelector("#repoList"),
  searchInput: document.querySelector("#searchInput"),
  visibilityFilter: document.querySelector("#visibilityFilter"),
  languageFilter: document.querySelector("#languageFilter"),
  categoryFilter: document.querySelector("#categoryFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  clearFilters: document.querySelector("#clearFilters"),
  activeFilters: document.querySelector("#activeFilters"),
  resultCount: document.querySelector("#resultCount"),
};

const collator = new Intl.Collator("zh-CN", { sensitivity: "base" });

init();

async function init() {
  try {
    const res = await fetch("./data/repos.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`数据加载失败: ${res.status}`);
    const data = await res.json();
    state.repos = data.repositories || [];
    state.summary = data.summary || buildSummary(state.repos);
    renderSummary(data);
    renderFilters();
    applyFilters();
    bindEvents();
  } catch (error) {
    els.repoList.innerHTML = `<article class="repo-card"><div><div class="repo-title"><strong>无法加载数据</strong></div><p class="repo-desc">${escapeHtml(error.message)}</p></div></article>`;
  }
}

function bindEvents() {
  [els.searchInput, els.visibilityFilter, els.languageFilter, els.categoryFilter, els.sortSelect].forEach((el) => {
    el.addEventListener("input", applyFilters);
  });
  els.clearFilters.addEventListener("click", clearFilters);
  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.searchInput.value) {
      els.searchInput.value = "";
      applyFilters();
    }
  });
}

function renderSummary(data) {
  const summary = state.summary;
  els.updatedAt.textContent = `更新于 ${formatDateTime(data.generatedAt)}`;
  els.ownerName.textContent = data.owner ? `@${data.owner}` : "GitHub";
  els.totalRepos.textContent = number(summary.total);
  els.publicRepos.textContent = number(summary.public);
  els.privateRepos.textContent = number(summary.private);
  els.totalSize.textContent = formatBytes(summary.totalSizeBytes);
  els.lfsSize.textContent = formatBytes(summary.totalLfsBytes);
  renderTaxonomy(summary);
  renderLanguageBars(summary.languages);
}

function renderTaxonomy(summary) {
  const groups = [
    ["可见性", { Public: summary.public, Private: summary.private }],
    ["业务分类", summary.categories],
    ["状态", { Active: summary.active, Archived: summary.archived }],
    ["类型", { Source: summary.sources, Fork: summary.forks, Template: summary.templates }],
  ];

  els.taxonomy.innerHTML = groups
    .map(([title, values]) => {
      const entries = Array.isArray(values) ? values : Object.entries(values).map(([name, count]) => ({ name, count }));
      return `
        <div class="taxonomy-group">
          <b>${escapeHtml(title)}</b>
          <div class="chip-row">
            ${entries.slice(0, 12).map((item) => `<span class="taxonomy-chip">${escapeHtml(item.name)} <em>${number(item.count)}</em></span>`).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderLanguageBars(languages) {
  const max = Math.max(...languages.map((item) => item.count), 1);
  els.languageBars.innerHTML = languages
    .slice(0, 10)
    .map((item) => {
      const width = Math.round((item.count / max) * 100);
      return `
        <div class="bar-row">
          <span class="bar-label" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span></span>
          <span class="bar-count">${number(item.count)}</span>
        </div>
      `;
    })
    .join("");
}

function renderFilters() {
  const languages = unique(state.repos.map((repo) => repo.primaryLanguage || "Unknown")).sort(collator.compare);
  const categories = unique(state.repos.map((repo) => repo.category || "Uncategorized")).sort(collator.compare);
  els.languageFilter.innerHTML = `<option value="all">全部语言</option>${languages
    .map((language) => `<option value="${escapeHtml(language)}">${escapeHtml(language)}</option>`)
    .join("")}`;
  els.categoryFilter.innerHTML = `<option value="all">全部分类</option>${categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("")}`;
}

function applyFilters() {
  const query = els.searchInput.value.trim().toLowerCase();
  const visibility = els.visibilityFilter.value;
  const language = els.languageFilter.value;
  const category = els.categoryFilter.value;
  const sort = els.sortSelect.value;

  state.filtered = state.repos
    .filter((repo) => {
      const haystack = [repo.name, repo.description, repo.primaryLanguage, repo.category, ...(repo.topics || [])].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) &&
        (visibility === "all" || repo.visibility === visibility) &&
        (language === "all" || (repo.primaryLanguage || "Unknown") === language) &&
        (category === "all" || (repo.category || "Uncategorized") === category);
    })
    .sort((a, b) => sortRepos(a, b, sort));

  renderFilterState({ query, visibility, language, category, sort });
  renderRepos();
}

function renderRepos() {
  els.resultCount.textContent = `${number(state.filtered.length)} 个结果`;

  if (!state.filtered.length) {
    els.repoList.innerHTML = `<div class="empty-state"><strong>没有匹配的仓库</strong><p>调整搜索或筛选条件后再试。</p></div>`;
    return;
  }

  els.repoList.innerHTML = state.filtered
    .map((repo) => `
      <article class="repo-card">
        <div class="repo-main">
          <div class="repo-title">
            <a href="${escapeHtml(repo.url)}" target="_blank" rel="noreferrer">${escapeHtml(repo.name)}<span class="external-arrow" aria-hidden="true">↗</span></a>
            <span class="ri-badge ${repo.visibility === "private" ? "danger" : "success"}">${escapeHtml(repo.visibility)}</span>
            ${repo.archived ? '<span class="ri-badge warning">archived</span>' : ""}
            ${repo.fork ? '<span class="ri-badge info">fork</span>' : ""}
          </div>
          <p class="repo-desc">${escapeHtml(repo.description || "无描述")}</p>
          <div class="repo-meta">
            <span class="language" style="--language-color:${languageColor(repo.primaryLanguage)}">${escapeHtml(repo.primaryLanguage || "Unknown")}</span>
            <span>${escapeHtml(repo.category || "Uncategorized")}</span>
            <span>★ ${number(repo.stars)}</span>
            <span>⑂ ${number(repo.forks)}</span>
            <span>更新 ${formatDate(repo.pushedAt)}</span>
            ${(repo.topics || []).slice(0, 5).map((topic) => `<span class="repo-topic">#${escapeHtml(topic)}</span>`).join("")}
          </div>
        </div>
        <div class="repo-stats">
          <span class="repo-stat"><strong>${formatBytes(repo.sizeBytes)}</strong>仓库大小</span>
          <span class="repo-stat"><strong>${formatBytes(repo.lfsBytes)}</strong>LFS 指针</span>
        </div>
      </article>
    `)
    .join("");
}

function renderFilterState({ query, visibility, language, category, sort }) {
  const filters = [];
  if (query) filters.push(`搜索 “${query}”`);
  if (visibility !== "all") filters.push(visibility);
  if (language !== "all") filters.push(language);
  if (category !== "all") filters.push(category);
  if (sort !== "pushed") filters.push(`排序 ${els.sortSelect.selectedOptions[0].textContent}`);

  els.activeFilters.innerHTML = filters.length
    ? `<span class="filter-summary">已应用：${filters.map(escapeHtml).join(" / ")}</span>`
    : "";
  els.clearFilters.disabled = filters.length === 0;
}

function clearFilters() {
  els.searchInput.value = "";
  els.visibilityFilter.value = "all";
  els.languageFilter.value = "all";
  els.categoryFilter.value = "all";
  els.sortSelect.value = "pushed";
  applyFilters();
  els.searchInput.focus();
}

function languageColor(language) {
  const colors = {
    JavaScript: "#d7a900",
    TypeScript: "#315fc4",
    Python: "#367c99",
    HTML: "#c85a3b",
    CSS: "#7f55b3",
    "C++": "#b84f6a",
    C: "#69727f",
    "C#": "#4e8b48",
    Java: "#b6632a",
    Ruby: "#a83e38",
    Go: "#16859a",
    Matlab: "#c46c2d",
    Cython: "#896f2c",
    Prolog: "#966333",
    Unknown: "#a5ada8",
  };
  return colors[language || "Unknown"] || "#6b756f";
}

function sortRepos(a, b, sort) {
  if (sort === "size") return b.sizeBytes - a.sizeBytes;
  if (sort === "lfs") return b.lfsBytes - a.lfsBytes;
  if (sort === "name") return collator.compare(a.name, b.name);
  return new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0);
}

function buildSummary(repos) {
  const languages = countBy(repos.map((repo) => repo.primaryLanguage || "Unknown"));
  const topics = countBy(repos.flatMap((repo) => repo.topics || []));
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
    categories: countBy(repos.map((repo) => repo.category || "Uncategorized")),
    languages,
    topics,
  };
}

function countBy(values) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatBytes(bytes = 0) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes) || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function number(value = 0) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
