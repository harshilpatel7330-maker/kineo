// TREND_RANK: higher = more severe
const TREND_RANK = { worsening: 2, stable: 1, improving: 0 }

// painHistory: { pain_score, date }[] sorted descending by date.
// Splits into recent (first floor(n/2) entries) and earlier (remaining).
// Returns null when fewer than 2 entries — not enough to establish a trend.
export function computedPainTrend(painHistory) {
  if (!painHistory || painHistory.length < 2) return null
  const n     = painHistory.length
  const split = Math.ceil(n / 2)
  const recent  = painHistory.slice(0, split)
  const earlier = painHistory.slice(split)
  if (recent.length === 0) return null
  const avg   = arr => arr.reduce((s, r) => s + r.pain_score, 0) / arr.length
  const delta = avg(recent) - avg(earlier)
  if (delta >= 1.0)  return 'worsening'
  if (delta <= -2.0) return 'improving'
  return 'stable'
}

// Returns the more severe of the two trend signals.
// If computedTrend is null, selfReportedTrend is returned unchanged.
// Missing/undefined selfReportedTrend is treated as 'stable' for ranking.
export function combinePainTrend(selfReportedTrend, computedTrend) {
  if (computedTrend == null) return selfReportedTrend ?? 'stable'
  const selfRank     = TREND_RANK[selfReportedTrend] ?? TREND_RANK.stable
  const computedRank = TREND_RANK[computedTrend]     ?? TREND_RANK.stable
  if (selfRank >= computedRank) return selfReportedTrend ?? 'stable'
  return computedTrend
}
