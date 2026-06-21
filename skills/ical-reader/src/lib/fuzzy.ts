// Very small, local-only fuzzy scoring utilities.
// We deliberately keep this lightweight and dependency-free.

export interface FuzzyEventFields {
  summary?: string | null;
  location?: string | null;
  description?: string | null;
}

export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, prev + 1, dp[j - 1] + cost);
      prev = tmp;
    }
    dp[0] = i;
  }
  return dp[n];
}

export function fuzzyScore(query: string, fields: FuzzyEventFields): number {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return 0;

  const summaryTokens = tokenize(fields.summary);
  const locationTokens = tokenize(fields.location);
  const descTokens = tokenize(fields.description);

  const jacSummary = jaccard(qTokens, summaryTokens);
  const jacLocation = jaccard(qTokens, locationTokens);
  const jacDesc = jaccard(qTokens, descTokens);

  // Simple edit-distance component on the joined strings.
  const joinedSummary = summaryTokens.join(" ");
  const joinedQuery = qTokens.join(" ");
  const lev = joinedSummary && joinedQuery ? levenshtein(joinedSummary, joinedQuery) : 0;
  const levNorm = joinedSummary.length + joinedQuery.length > 0
    ? 1 - lev / (joinedSummary.length + joinedQuery.length)
    : 0;

  // Weighted combination: summary > location > description.
  const score =
    jacSummary * 0.6 +
    jacLocation * 0.2 +
    jacDesc * 0.1 +
    levNorm * 0.1;

  return score;
}
