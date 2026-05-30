export function mapToSignals({
  sleep,
  stress,
  fatigue,
  soreness,
  painScore,
  painTrend,
  painAltersMovement,
  sessionsThisWeek,
  loadVsNormal,
}) {
  // Youth-calibrated sleep mapping (teens need 8-10hrs)
  // Sleep 1/5 = severely sleep deprived = 5+ poor nights
  // Sleep 2/5 = poor sleep = 3 poor nights
  // Sleep 3/5 = average = 1 poor night
  // Sleep 4-5/5 = good/great = 0 poor nights
  const sleepNightsBelowSix =
    sleep === 1 ? 5 : sleep === 2 ? 3 : sleep === 3 ? 1 : 0

  // Fatigue mapping — more aggressive for youth
  const morningFatigue =
    fatigue === 5 ? 10 : fatigue === 4 ? 8 :
    fatigue === 3 ? 5 : fatigue === 2 ? 3 : 1

  const sessions = sessionsThisWeek ?? 0

  // Load spike detection from self-report
  // "More than usual" + high sessions = mileage spike proxy
  const mileageChangePct =
    loadVsNormal === 'more' && sessions >= 4 ? 35 :
    loadVsNormal === 'more' && sessions >= 3 ? 22 :
    loadVsNormal === 'more' ? 15 :
    loadVsNormal === 'less' ? -15 : 0

  // Hard sessions estimate from total sessions + load
  const hardSessionsThisWeek =
    loadVsNormal === 'more' ? Math.ceil(sessions * 0.6) :
    Math.ceil(sessions * 0.4)

  return {
    sleepNightsBelowSix,
    morningFatigue,
    painScore: painScore ?? 0,
    painTrend: painTrend ?? 'stable',
    painAltersMovement: painAltersMovement ?? false,
    hardSessionsThisWeek,
    mileageChangePct,
    acwr: null,
    hrvVsBaselinePct: null,
    rhrVsBaselineBpm: null,
    hasBaseline: false,
  }
}
