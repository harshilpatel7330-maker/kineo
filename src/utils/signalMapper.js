export function mapToSignals({
  sleep, stress, fatigue, soreness,
  painScore, painTrend, painAltersMovement,
  sessionsThisWeek, loadVsNormal,
  restingHrBpm, hrvMs, sleepHours,
  baseline
}) {
  // SLEEP — use actual hours if provided (Milewski et al. 2014)
  // <7hrs significantly increases injury risk for active adults
  let sleepNightsBelowSix = 0
  if (sleepHours != null) {
    sleepNightsBelowSix =
      sleepHours < 6 ? 3 :
      sleepHours < 7 ? 2 :
      sleepHours < 7.5 ? 1 : 0
  } else {
    sleepNightsBelowSix =
      sleep === 1 ? 5 : sleep === 2 ? 3 :
      sleep === 3 ? 1 : 0
  }

  // HRV vs personal baseline
  let hrvVsBaselinePct = null
  if (hrvMs != null && baseline?.avgHrv != null) {
    hrvVsBaselinePct = ((hrvMs - baseline.avgHrv) / baseline.avgHrv) * 100
  }

  // RHR vs personal baseline
  let rhrVsBaselineBpm = null
  if (restingHrBpm != null && baseline?.avgRhr != null) {
    rhrVsBaselineBpm = restingHrBpm - baseline.avgRhr
  }

  // Data source for UI display
  const dataSource =
    (hrvMs != null || restingHrBpm != null) && baseline?.hasWearableBaseline
      ? 'wearable'
      : (hrvMs != null || restingHrBpm != null)
      ? 'wearable_no_baseline'
      : 'self_report'

  // Fatigue mapping
  const morningFatigue =
    fatigue === 5 ? 10 : fatigue === 4 ? 8 :
    fatigue === 3 ? 5 : fatigue === 2 ? 3 : 1

  // Load spike detection (Hulin et al. 2016)
  const mileageChangePct =
    loadVsNormal === 'more' && sessionsThisWeek >= 4 ? 35 :
    loadVsNormal === 'more' && sessionsThisWeek >= 3 ? 22 :
    loadVsNormal === 'more' ? 15 :
    loadVsNormal === 'less' ? -15 : 0

  const hardSessionsThisWeek =
    loadVsNormal === 'more'
      ? Math.ceil((sessionsThisWeek ?? 3) * 0.6)
      : Math.ceil((sessionsThisWeek ?? 3) * 0.4)

  return {
    sleepNightsBelowSix,
    morningFatigue,
    painScore: painScore ?? 0,
    painTrend: painTrend ?? 'stable',
    painAltersMovement: painAltersMovement ?? false,
    hardSessionsThisWeek,
    mileageChangePct,
    acwr: null,
    hrvVsBaselinePct,
    rhrVsBaselineBpm,
    hasBaseline: baseline?.hasWearableBaseline ?? false,
    dataSource,
    rawHrvMs: hrvMs,
    rawRhrBpm: restingHrBpm,
    rawSleepHours: sleepHours,
  }
}