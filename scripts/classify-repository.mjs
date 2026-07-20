export const MAX_ACADEMIC_CATEGORIES = 3;
export const FALLBACK_CATEGORY = "其他计算领域";

export function classifyRepository(repo, content, rules) {
  const fields = {
    name: normalize(repo.name),
    description: normalize(repo.description),
    topics: normalize((repo.topics || []).join(" ")),
    readme: normalize(content.readme),
    paths: normalize((content.paths || []).join("\n")),
    language: normalize(repo.language),
  };

  const ranked = rules
    .map((rule, index) => ({
      name: rule.name,
      score: scoreRule(fields, rule.match || {}),
      minScore: Number(rule.minScore ?? 4),
      index,
    }))
    .filter((item) => item.name && item.score >= item.minScore)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const categories = [];
  for (const item of ranked) {
    if (!categories.includes(item.name)) categories.push(item.name);
    if (categories.length >= MAX_ACADEMIC_CATEGORIES) break;
  }

  return categories.length ? categories : [FALLBACK_CATEGORY];
}

export function repositoryCategories(repo) {
  if (Array.isArray(repo.categories) && repo.categories.length) {
    return repo.categories.slice(0, MAX_ACADEMIC_CATEGORIES);
  }
  return [repo.category || FALLBACK_CATEGORY];
}

function scoreRule(fields, match) {
  let score = 0;
  score += matchCount(fields.topics, match.topics) * 8;
  score += matchCount(fields.name, match.names) * 6;
  score += matchCount(fields.description, match.strongKeywords) * 6;
  score += matchCount(fields.readme, match.strongKeywords) * 3.5;
  score += matchCount(fields.description, match.keywords) * 4;
  score += matchCount(fields.readme, match.keywords) * 1.25;
  score += matchCount(fields.paths, match.files) * 3;
  score += matchCount(fields.language, match.languages) * 1;
  return score;
}

function matchCount(value, patterns) {
  if (!value || !Array.isArray(patterns)) return 0;
  return patterns.reduce((count, pattern) => count + (safeRegex(pattern).test(value) ? 1 : 0), 0);
}

function safeRegex(pattern) {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return /$a/;
  }
}

function normalize(value) {
  return String(value || "").toLowerCase();
}
