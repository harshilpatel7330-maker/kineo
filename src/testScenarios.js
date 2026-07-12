import { runScenarios, evaluate } from './athleteiq-engine.js'
import { calcReadiness } from './utils/readiness.js'
import { computedPainTrend, combinePainTrend } from './utils/painTrendCalculator.js'
import { classifyInjury } from './utils/injuryClassifier.js'
// Mirror of evaluateGraduationCriteria from graduationChecker.js — inline because
// graduationChecker.js imports supabaseClient.js which uses import.meta.env (Vite-only).
function evaluateGraduationCriteria(rtsRows, painLogs, hrvMetrics = []) {
  if (!rtsRows || rtsRows.length < 7) {
    return { graduated: false, reason: `Only ${rtsRows?.length ?? 0} days logged — need 7 consecutive check-in days` }
  }
  const allPainLow = rtsRows.every(r => r.pain_score <= 1)
  if (!allPainLow) {
    const worst = Math.max(...rtsRows.map(r => r.pain_score))
    return { graduated: false, reason: `Pain score reached ${worst} in last 7 days — must be ≤1 every day` }
  }
  const allStiffnessLow = rtsRows.every(r => r.morning_stiffness <= 2)
  if (!allStiffnessLow) {
    const worst = Math.max(...rtsRows.map(r => r.morning_stiffness))
    return { graduated: false, reason: `Morning stiffness reached ${worst} in last 7 days — must be ≤2 every day` }
  }
  const trend = computedPainTrend(painLogs ?? [])
  if (trend === 'worsening') {
    return { graduated: false, reason: 'Pain trend is currently worsening — continue recovery protocol' }
  }
  const withHrv = (hrvMetrics ?? []).filter(r => r.hrv_vs_baseline_pct != null)
  if (withHrv.length >= 4) {
    const passing = withHrv.filter(r => r.hrv_vs_baseline_pct >= -15).length
    if (passing < 4) {
      return {
        graduated: false,
        reason: 'Your HRV is still below your personal baseline — your body may need more recovery time before returning to full training, even though pain has resolved.',
      }
    }
  }
  return { graduated: true, reason: 'All graduation criteria met' }
}

// Mirror of the exported pure function in baselineCalculator.js — inline here
// so this test file has no Supabase dependency and runs cleanly in Node.
function computeHrvVsBaselinePct(todayHrv, priorReadings) {
  if (todayHrv == null || !priorReadings.length) return null
  const avg = priorReadings.reduce((s, v) => s + v, 0) / priorReadings.length
  return Math.round(((todayHrv - avg) / avg) * 1000) / 10
}

// Mirror of calculateHrvLoadMismatch from loadCalculator.js — inline because
// loadCalculator.js imports supabaseClient.js which uses import.meta.env
// (Vite-only), causing a TypeError when loaded in Node.js directly.
function calculateHrvLoadMismatch(joinedSessions) {
  const withHrv = joinedSessions.filter(j => j.hrv_vs_baseline_pct != null)
  if (withHrv.length < 3) return null
  const daysHrvBelow = withHrv.filter(j => j.hrv_vs_baseline_pct < -5).length
  const mostRecentAcwr = joinedSessions[0]?.acwr
  let loadFlatOrRising = mostRecentAcwr != null && mostRecentAcwr >= 0.85
  if (!loadFlatOrRising) {
    const recentTwo  = joinedSessions.slice(0, 2)
    const priorThree = joinedSessions.slice(2, 5)
    if (recentTwo.length === 2 && priorThree.length >= 1) {
      const avgRecent = (recentTwo[0].session_load + recentTwo[1].session_load) / 2
      const avgPrior  = priorThree.reduce((s, d) => s + d.session_load, 0) / priorThree.length
      if (avgPrior > 0) loadFlatOrRising = (avgRecent / avgPrior) >= 0.9
    }
  }
  return { daysHrvBelow, daysAvailable: withHrv.length, loadFlatOrRising }
}

const scenarios = [
  {
    id: 'normal-week',
    label: 'Totally normal week, no flags',
    expectedDecision: 'PUSH',
    signals: {
      acwr: 1.0, mileageChangePct: 0, painScore: 0, painTrend: 'stable',
      hrvVsBaselinePct: 0, sleepNightsBelowSix: 0, hardSessionsThisWeek: 2,
      hasBaseline: true,
    }
  },
  {
    id: 'one-bad-sleep-night',
    label: 'One bad night of sleep, everything else fine',
    expectedDecision: 'MAINTAIN',
    signals: {
      acwr: 1.0, mileageChangePct: 0, painScore: 0, painTrend: 'stable',
      hrvVsBaselinePct: 0, sleepNightsBelowSix: 1, hardSessionsThisWeek: 2,
      hasBaseline: true,
    }
  },
  {
    id: 'harder-lifting-week',
    label: 'Lifter did 4 hard sessions, feels a bit run down',
    expectedDecision: 'MODIFY',
    signals: {
      acwr: null, mileageChangePct: null, painScore: 0, painTrend: 'stable',
      hrvVsBaselinePct: -8, sleepNightsBelowSix: 1, hardSessionsThisWeek: 4,
      hasBaseline: true,
    }
  },
  {
    id: 'runner-mileage-jump',
    label: 'Runner increased mileage 30% this week',
    expectedDecision: 'MODIFY',
    signals: {
      acwr: 1.35, mileageChangePct: 30, painScore: 0, painTrend: 'stable',
      hrvVsBaselinePct: 0, sleepNightsBelowSix: 0, hardSessionsThisWeek: 2,
      hasBaseline: true,
    }
  },
  {
    id: 'mild-shin-soreness',
    label: 'Runner reports mild shin soreness, stable',
    expectedDecision: 'MAINTAIN',
    signals: {
      acwr: 1.0, mileageChangePct: 5, painScore: 2, painTrend: 'stable',
      hrvVsBaselinePct: 0, sleepNightsBelowSix: 0, hardSessionsThisWeek: 2,
      hasBaseline: true,
    }
  },
  {
    id: 'worsening-pain',
    label: 'Pain getting worse, low score but trending up',
    expectedDecision: 'RECOVER',
    signals: {
      acwr: 1.0, mileageChangePct: 0, painScore: 2, painTrend: 'worsening',
      hrvVsBaselinePct: 0, sleepNightsBelowSix: 0, hardSessionsThisWeek: 2,
      hasBaseline: true,
    }
  },
  {
    id: 'hrv-only-dip-no-load',
    label: 'HRV/RHR dipped but load and sleep totally normal',
    expectedDecision: 'MODIFY',
    signals: {
      acwr: 1.0, mileageChangePct: 0, painScore: 0, painTrend: 'stable',
      hrvVsBaselinePct: -20, rhrVsBaselineBpm: 9, sleepNightsBelowSix: 0,
      hardSessionsThisWeek: 2, hasBaseline: true,
    }
  },
  {
    id: 'first-week-no-baseline',
    label: 'Brand new user, day 3, no baseline yet',
    expectedDecision: 'MAINTAIN',
    signals: {
      painScore: 0, hasBaseline: false,
    }
  },

  // ── New scenarios covering wired signals ───────────────────────────────────

  {
    id: 'back-to-back-hard',
    label: 'Hard session yesterday + hard session today → back_to_back_hard',
    expectedDecision: 'MODIFY',
    signals: {
      backToBackHard: true,
      painScore: 0, painTrend: 'stable',
      acwr: null, mileageChangePct: null,
      hardSessionsThisWeek: 2,
      sleepNightsBelowSix: null,
      hasBaseline: false,
    }
  },

  {
    id: 'hard-session-overload-real',
    label: '4 sessions this week, 3 hard, HRV dipped — hard session overload',
    expectedDecision: 'MODIFY',
    signals: {
      hardSessionsThisWeek: 4,
      hrvVsBaselinePct: -8,
      sleepNightsBelowSix: 1,
      painScore: 0, painTrend: 'stable',
      acwr: null, mileageChangePct: null,
      backToBackHard: false,
      hasBaseline: true,
    }
  },

  {
    id: 'rpe-high-on-easy-day',
    label: 'Planned easy session, actual RPE 8 → rpeHighOnEasyDay',
    expectedDecision: 'MODIFY',
    signals: {
      rpeHighOnEasyDay: true,
      sessionRpe: 8,
      painScore: 0, painTrend: 'stable',
      acwr: null, mileageChangePct: null,
      hardSessionsThisWeek: null,
      sleepNightsBelowSix: null,
      hasBaseline: false,
    }
  },

  {
    id: 'new-athlete-no-sessions',
    label: 'New athlete: check-ins exist, zero logged sessions → null signals, sensible fallback',
    expectedDecision: 'MAINTAIN',
    signals: {
      acwr: null,
      mileageChangePct: null,
      hardSessionsThisWeek: null,
      backToBackHard: false,
      sessionRpe: null,
      rpeHighOnEasyDay: false,
      hrvVsBaselinePct: null,
      rhrVsBaselineBpm: null,
      sleepNightsBelowSix: null,
      hasBaseline: false,
      morningFatigue: 3,
      painScore: 0, painTrend: 'stable', painAltersMovement: false,
    }
  },

  {
    id: 'acwr-computes-modify',
    label: '8+ days of sessions, ACWR 1.4 with rising mileage → MODIFY',
    expectedDecision: 'MODIFY',
    signals: {
      acwr: 1.4,
      mileageChangePct: 28,
      painScore: 0, painTrend: 'stable',
      hardSessionsThisWeek: 2,
      sleepNightsBelowSix: 0,
      backToBackHard: false,
      hasBaseline: true,
      hrvVsBaselinePct: 0,
    }
  },

  {
    id: 'baseline-threshold-below-7',
    label: '6 days wearable data: hasBaseline false — HRV/RHR rules must not fire',
    expectedDecision: 'MAINTAIN',
    signals: {
      // hasBaseline is false until day 7; wearable-gated rules must all return null
      hasBaseline: false,
      hrvVsBaselinePct: -20,   // would trigger MODIFY if hasBaseline were true
      rhrVsBaselineBpm: 9,     // same
      acwr: null, mileageChangePct: null,
      hardSessionsThisWeek: 2, sleepNightsBelowSix: 0,
      backToBackHard: false, painScore: 0, painTrend: 'stable',
    }
  },

  {
    id: 'baseline-threshold-at-7',
    label: '7 days wearable data: hasBaseline true — HRV/RHR rules now activate',
    expectedDecision: 'MODIFY',
    signals: {
      // Same signals as above, only hasBaseline changes → different decision
      hasBaseline: true,
      hrvVsBaselinePct: -20,
      rhrVsBaselineBpm: 9,
      acwr: null, mileageChangePct: null,
      hardSessionsThisWeek: 2, sleepNightsBelowSix: 0,
      backToBackHard: false, painScore: 0, painTrend: 'stable',
    }
  },

  {
    id: 'acwr-push-reachable',
    label: 'ACWR in range + HRV green + no pain + good sleep → PUSH (now reachable)',
    expectedDecision: 'PUSH',
    signals: {
      acwr: 1.05,
      mileageChangePct: 5,
      painScore: 0, painTrend: 'stable',
      hardSessionsThisWeek: 2,
      sleepNightsBelowSix: 0,
      backToBackHard: false,
      hasBaseline: true,
      hrvVsBaselinePct: 2,
    }
  },

  // Fix 2: Mileage > 40% with no pain was a silent gap (old code capped at <= 40).
  {
    id: 'mileage-spike-above-40-no-pain',
    label: 'Mileage +50% with zero pain: was silently missed, now correctly MODIFY',
    expectedDecision: 'MODIFY',
    signals: {
      acwr: null, mileageChangePct: 50, painScore: 0, painTrend: 'stable',
      hrvVsBaselinePct: null, rhrVsBaselineBpm: null, sleepNightsBelowSix: null,
      hardSessionsThisWeek: null, backToBackHard: false, hasBaseline: false,
    }
  },

  // Fix 3: hasLoggedSessions === false branch — baseline exists but no sessions
  {
    id: 'has-baseline-no-sessions',
    label: 'Baseline established, hasLoggedSessions false: MAINTAIN (decision check; confidence tested inline)',
    expectedDecision: 'MAINTAIN',
    signals: {
      acwr: null, mileageChangePct: null, hardSessionsThisWeek: null,
      backToBackHard: false, sessionRpe: null, rpeHighOnEasyDay: false,
      hrvVsBaselinePct: null, rhrVsBaselineBpm: null, sleepNightsBelowSix: null,
      hasBaseline: true, hasLoggedSessions: false,
      morningFatigue: 3, painScore: 0, painTrend: 'stable', painAltersMovement: false,
    }
  },

  // Fix 3: all three cases covered — case 3: baseline + sessions + nothing fires
  {
    id: 'has-baseline-has-sessions-no-flags',
    label: 'Baseline + sessions logged + nothing flags: original MAINTAIN/MEDIUM preserved',
    expectedDecision: 'MAINTAIN',
    signals: {
      acwr: null, mileageChangePct: null, hardSessionsThisWeek: 1,
      backToBackHard: false, sessionRpe: 5, rpeHighOnEasyDay: false,
      hrvVsBaselinePct: null, rhrVsBaselineBpm: null, sleepNightsBelowSix: 0,
      hasBaseline: true, hasLoggedSessions: true,
      morningFatigue: 3, painScore: 0, painTrend: 'stable', painAltersMovement: false,
    }
  },

  // ── P2-protocol-pain-high rule ────────────────────────────────────────────
  {
    id: 'protocol-pain-high-during',
    label: 'protocolPainDuring=6 → P2-protocol-pain-high fires, MODIFY',
    expectedDecision: 'MODIFY',
    signals: {
      protocolPainDuring: 6, protocolPainAfter: 2,
      painScore: 0, painTrend: 'stable', painAltersMovement: false,
      acwr: null, mileageChangePct: null,
      hardSessionsThisWeek: null, sleepNightsBelowSix: null,
      backToBackHard: false, hasBaseline: true,
    }
  },

  {
    id: 'protocol-pain-below-threshold',
    label: 'protocolPainDuring=3, protocolPainAfter=3 → rule absent, MAINTAIN',
    expectedDecision: 'MAINTAIN',
    signals: {
      protocolPainDuring: 3, protocolPainAfter: 3,
      painScore: 0, painTrend: 'stable', painAltersMovement: false,
      acwr: null, mileageChangePct: null,
      hardSessionsThisWeek: null, sleepNightsBelowSix: null,
      backToBackHard: false, hasBaseline: true,
      hasLoggedSessions: true,
    }
  },
]

// ── Baseline isolation test (no engine, pure math) ────────────────────────
// 6 prior days at 65ms HRV, then a 7th day check-in at 40ms.
// The comparison must use the 6-day prior average (65), not a 7-day
// average that includes today's own reading (which would be 61.4ms → -34.9%).
const PRIOR_HRV = [65, 65, 65, 65, 65, 65]
const TODAY_HRV = 40
const selfInclusiveAvg = Math.round(([...PRIOR_HRV, TODAY_HRV].reduce((s, v) => s + v, 0) / 7) * 10) / 10  // 61.4
const computedPct = computeHrvVsBaselinePct(TODAY_HRV, PRIOR_HRV)
const selfInclusivePct = computeHrvVsBaselinePct(TODAY_HRV, [...PRIOR_HRV, TODAY_HRV])

const baselineIsolationTest = {
  id:    'pre-today-baseline-isolation',
  label: '6 prior days HRV ≈ 65ms, 7th day = 40ms — comparison excludes today',
  expected: 'hrv_vs_baseline_pct ≈ -38.5%',
  actual:   `hrv_vs_baseline_pct = ${computedPct}%`,
  selfInclusiveWouldBe: `${selfInclusivePct}% (wrong — against avg ${selfInclusiveAvg}ms)`,
  pass: Math.abs(computedPct - (-38.5)) < 0.1,
}

// ── Cold-start regression test ────────────────────────────────────────────
// This code path has broken twice. Lock it in: a brand-new athlete with zero
// check-ins, zero training_sessions, and no baseline row must get the
// cold-start message (MAINTAIN, LOW confidence) — not the generic
// "nothing concerning, execute as planned" message.
const COLD_START_SIGNALS = {
  hasBaseline: false,
  acwr: null, mileageChangePct: null,
  hardSessionsThisWeek: null, backToBackHard: false,
  sessionRpe: null, rpeHighOnEasyDay: false,
  hrvVsBaselinePct: null, rhrVsBaselineBpm: null, sleepNightsBelowSix: null,
  morningFatigue: 3,
  painScore: 0, painTrend: 'stable', painAltersMovement: false,
}
const coldStartResult = evaluate(COLD_START_SIGNALS)
const COLD_START_ACTION = 'Proceed with a moderate planned session. Establish 7 days of morning check-ins before load rules activate.'
const GENERIC_ACTION    = 'Execute the training plan as written. No modifications required.'
const coldStartTest = {
  id:    'cold-start-no-baseline-no-flags',
  label: 'Brand-new athlete: zero check-ins, zero sessions, no baseline — must show cold-start message not generic',
  pass:
    coldStartResult.decision    === 'MAINTAIN' &&
    coldStartResult.confidence  === 'LOW'      &&
    coldStartResult.action      === COLD_START_ACTION,
  decision:   coldStartResult.decision,
  confidence: coldStartResult.confidence,
  action:     coldStartResult.action,
  wrongActionWouldBe: GENERIC_ACTION,
}

// ── hasLoggedSessions confidence tests (Fix 3) ───────────────────────────
// The scenarios array above checks decision only; these check confidence + copy.
const NO_SESSIONS_SIGNALS = {
  acwr: null, mileageChangePct: null, hardSessionsThisWeek: null,
  backToBackHard: false, sessionRpe: null, rpeHighOnEasyDay: false,
  hrvVsBaselinePct: null, rhrVsBaselineBpm: null, sleepNightsBelowSix: null,
  hasBaseline: true, hasLoggedSessions: false,
  morningFatigue: 3, painScore: 0, painTrend: 'stable', painAltersMovement: false,
}
const noSessionsResult = evaluate(NO_SESSIONS_SIGNALS)
const noSessionsTest = {
  id:    'no-sessions-low-confidence',
  label: 'hasBaseline + no sessions: MAINTAIN/LOW, not the generic MEDIUM message',
  pass:
    noSessionsResult.decision   === 'MAINTAIN' &&
    noSessionsResult.confidence === 'LOW'      &&
    noSessionsResult.action !== 'Execute the training plan as written. No modifications required.',
  decision:   noSessionsResult.decision,
  confidence: noSessionsResult.confidence,
  action:     noSessionsResult.action,
}

const HAS_SESSIONS_NO_FLAGS_SIGNALS = {
  acwr: null, mileageChangePct: null, hardSessionsThisWeek: 1,
  backToBackHard: false, sessionRpe: 5, rpeHighOnEasyDay: false,
  hrvVsBaselinePct: null, rhrVsBaselineBpm: null, sleepNightsBelowSix: 0,
  hasBaseline: true, hasLoggedSessions: true,
  morningFatigue: 3, painScore: 0, painTrend: 'stable', painAltersMovement: false,
}
const hasSessionsNoFlagsResult = evaluate(HAS_SESSIONS_NO_FLAGS_SIGNALS)
const GENERIC_NO_FLAGS_ACTION  = 'Execute the training plan as written. No modifications required.'
const hasSessionsNoFlagsTest = {
  id:    'sessions-exist-no-flags-medium-confidence',
  label: 'Baseline + sessions + nothing flags: original MAINTAIN/MEDIUM message preserved',
  pass:
    hasSessionsNoFlagsResult.decision   === 'MAINTAIN' &&
    hasSessionsNoFlagsResult.confidence === 'MEDIUM'   &&
    hasSessionsNoFlagsResult.action     === GENERIC_NO_FLAGS_ACTION,
  decision:   hasSessionsNoFlagsResult.decision,
  confidence: hasSessionsNoFlagsResult.confidence,
}

// ── Cumulative fatigue pattern tests (Fix 4) ─────────────────────────────
// Mirrors the fixed avgFatigue logic from baselineCalculator.js:
// returns null for weeks with < 4 entries so NaN never propagates.
function _avgFatigue(week) {
  if (week.length < 4) return null
  return week.reduce((sum, d) => sum + (d.fatigue ?? 3), 0) / week.length
}
function _computeHasPattern(data) {
  const w1 = _avgFatigue(data.slice(0, 7))
  const w2 = _avgFatigue(data.slice(7, 14))
  const w3 = _avgFatigue(data.slice(14, 21))
  return [w1, w2, w3].filter(w => w != null && w >= 3.5).length >= 3
}
const HIGH_ROW = { fatigue: 5 }

const cumFatigueA = {
  id:    'cumulative-fatigue-10-checkins',
  label: '10 check-ins all fatigue=5: hasPattern false — weeks 2 and 3 have < 4 entries',
  pass:  _computeHasPattern(Array(10).fill(HIGH_ROW)) === false,
}
const cumFatigueB = {
  id:    'cumulative-fatigue-21-checkins',
  label: '21 check-ins all fatigue=5, full weeks: hasPattern true',
  pass:  _computeHasPattern(Array(21).fill(HIGH_ROW)) === true,
}
const cumFatigueC = {
  id:    'cumulative-fatigue-18-checkins-week3-has-4',
  label: '18 check-ins (week3 = 4 entries, meets 4-day minimum): hasPattern true',
  pass:  _computeHasPattern(Array(18).fill(HIGH_ROW)) === true,
}

// ── ACWR 1.3 boundary (Fix 1) ─────────────────────────────────────────────
// Stronger than the decision-only check: also asserts P5-ready-to-push is
// absent from rulesFired. If the strict-bound fix ever regresses, both
// P3 and P5 would fire and this test fails even though the decision stays
// MODIFY (because severity escalation masks the contradiction).
const ACWR_BOUNDARY_SIGNALS = {
  acwr: 1.3, mileageChangePct: 0, painScore: 0, painTrend: 'stable',
  hrvVsBaselinePct: 2, sleepNightsBelowSix: 0, hardSessionsThisWeek: 1,
  backToBackHard: false, hasBaseline: true,
}
const acwrBoundaryResult = evaluate(ACWR_BOUNDARY_SIGNALS)
const acwrBoundaryTest = {
  id:    'acwr-boundary-1.3-only-modify',
  label: 'ACWR exactly 1.3: decision MODIFY AND P5-ready-to-push absent from rulesFired',
  pass:
    acwrBoundaryResult.decision === 'MODIFY' &&
    !acwrBoundaryResult.rulesFired.some(r => r.id === 'P5-ready-to-push'),
  decision:   acwrBoundaryResult.decision,
  rulesFired: acwrBoundaryResult.rulesFired.map(r => r.id),
}

// ── calcReadiness missing-field (Fix 5) ──────────────────────────────────
// Asserts the shared function returns a real number when a field is
// undefined — defaults (fatigue=3) must kick in, not propagate NaN.
// Dashboard, History, and Recommendation all import this shared function;
// grep confirms no local redefinition exists in any of them.
const PARTIAL_CHECKIN = { sleep: 4, stress: 2, fatigue: undefined, soreness: 3 }
const readinessMissingFieldResult = calcReadiness(PARTIAL_CHECKIN)
const readinessMissingFieldTest = {
  id:    'calc-readiness-missing-field',
  label: 'calcReadiness({ sleep:4, stress:2, fatigue:undefined, soreness:3 }) is a real number, not NaN',
  pass:  typeof readinessMissingFieldResult === 'number' && !isNaN(readinessMissingFieldResult),
  result: readinessMissingFieldResult,
}

// ── Part A: Computed pain trend tests ─────────────────────────────────────

// Neutral signals used as the non-pain baseline for engine call in A1
const PAIN_NEUTRAL = {
  acwr: null, mileageChangePct: null, hardSessionsThisWeek: null,
  backToBackHard: false, sessionRpe: null, rpeHighOnEasyDay: false,
  hrvVsBaselinePct: null, rhrVsBaselineBpm: null, sleepNightsBelowSix: null,
  hasBaseline: true, hasLoggedSessions: true, morningFatigue: 3,
  painAltersMovement: false,
}

// A1: self='stable', logs [4,3,2,2] — delta=(3.5)-(2.0)=1.5 >= 1.0 → worsening
// Combined: worsening > stable → 'worsening'. Engine with painScore=3 +
// painTrend='worsening' → P1-pain-critical fires (any pain+worsening=RECOVER).
const A1_HISTORY = [
  { pain_score: 4, date: '2026-06-27' },
  { pain_score: 3, date: '2026-06-26' },
  { pain_score: 2, date: '2026-06-25' },
  { pain_score: 2, date: '2026-06-24' },
]
const A1_computed = computedPainTrend(A1_HISTORY)
const A1_combined = combinePainTrend('stable', A1_computed)
const A1_engine   = evaluate({ ...PAIN_NEUTRAL, painScore: 3, painTrend: A1_combined })
const ptA1 = {
  id:    'pain-trend-computed-worsening-overrides-stable',
  label: 'self=stable, logs [4,3,2,2] delta=1.5: computed=worsening, combined=worsening, P1-pain-critical fires (RECOVER)',
  pass:
    A1_computed === 'worsening' &&
    A1_combined === 'worsening' &&
    A1_engine.decision === 'RECOVER' &&
    A1_engine.rulesFired.some(r => r.id === 'P1-pain-critical'),
  computed: A1_computed, combined: A1_combined,
  decision: A1_engine.decision,
  rulesFired: A1_engine.rulesFired.map(r => r.id),
}

// A2: self='worsening', flat logs [3,3,3,3] — delta=0 → computed='stable'
// combined: self rank 2 (worsening) >= computed rank 1 (stable) → 'worsening' preserved
const A2_HISTORY = [
  { pain_score: 3, date: '2026-06-27' },
  { pain_score: 3, date: '2026-06-26' },
  { pain_score: 3, date: '2026-06-25' },
  { pain_score: 3, date: '2026-06-24' },
]
const A2_computed = computedPainTrend(A2_HISTORY)
const A2_combined = combinePainTrend('worsening', A2_computed)
const ptA2 = {
  id:    'pain-trend-self-worsening-wins-over-flat',
  label: 'self=worsening, flat logs (delta=0): computed=stable, self-report wins, final=worsening',
  pass:  A2_computed === 'stable' && A2_combined === 'worsening',
  computed: A2_computed, combined: A2_combined,
}

// A3: Only 1 pain_log entry — computedPainTrend returns null (< 2 needed)
// combinePainTrend(null) returns self-report unchanged
const A3_HISTORY = [{ pain_score: 3, date: '2026-06-27' }]
const A3_computed = computedPainTrend(A3_HISTORY)
const A3_combined = combinePainTrend('improving', A3_computed)
const ptA3 = {
  id:    'pain-trend-single-entry-returns-null',
  label: 'Only 1 pain_log entry: computed=null, self-report=improving returned unchanged',
  pass:  A3_computed === null && A3_combined === 'improving',
  computed: A3_computed, combined: A3_combined,
}

// A4: self='stable', logs show small drop — delta=-1.0 (doesn't clear -2.0 bar)
// computed stays 'stable', not 'improving' — confirms higher bar for improving
const A4_HISTORY = [
  { pain_score: 2, date: '2026-06-27' },
  { pain_score: 2, date: '2026-06-26' },
  { pain_score: 3, date: '2026-06-25' },
  { pain_score: 3, date: '2026-06-24' },
]
// delta = avg(2,2) - avg(3,3) = 2.0 - 3.0 = -1.0: inside (-2.0, 1.0) → 'stable'
const A4_computed = computedPainTrend(A4_HISTORY)
const A4_combined = combinePainTrend('stable', A4_computed)
const ptA4 = {
  id:    'pain-trend-small-drop-stays-stable',
  label: 'delta=-1.0 (< -2.0 bar for improving): computed=stable, final=stable — improving bar holds',
  pass:  A4_computed === 'stable' && A4_combined === 'stable',
  computed: A4_computed, combined: A4_combined,
}

// A5: self='improving', logs also show real drop — delta=-2.5 clears the -2.0 bar
// computed='improving', combined rank tie (self=0, computed=0) → 'improving' returned
const A5_HISTORY = [
  { pain_score: 1, date: '2026-06-27' },
  { pain_score: 1, date: '2026-06-26' },
  { pain_score: 3, date: '2026-06-25' },
  { pain_score: 4, date: '2026-06-24' },
]
// delta = avg(1,1) - avg(3,4) = 1.0 - 3.5 = -2.5 → 'improving'
const A5_computed = computedPainTrend(A5_HISTORY)
const A5_combined = combinePainTrend('improving', A5_computed)
const ptA5 = {
  id:    'pain-trend-real-drop-reaches-improving',
  label: 'self=improving, delta=-2.5 clears bar: computed=improving, final=improving confirmed reachable',
  pass:  A5_computed === 'improving' && A5_combined === 'improving',
  computed: A5_computed, combined: A5_combined,
}

// ── Part B: HRV-load mismatch rule tests ─────────────────────────────────
// Tests use pre-computed hrvLoadMismatch objects (no DB) — the rule reads
// the signal object, so we can test the evaluate() path directly.

const HRV_MISMATCH_BASE = {
  hasBaseline: true, hasLoggedSessions: true,
  acwr: 1.0, mileageChangePct: null, hardSessionsThisWeek: 2,
  backToBackHard: false, sessionRpe: 6, rpeHighOnEasyDay: false,
  hrvVsBaselinePct: -7, rhrVsBaselineBpm: 3, sleepNightsBelowSix: 0,
  morningFatigue: 3, painScore: 0, painTrend: 'stable', painAltersMovement: false,
}

// B1: 3 of 4 HRV days below -5, load flat (ACWR 1.0 ≥ 0.85) → rule fires, MODIFY
const B1_result = evaluate({
  ...HRV_MISMATCH_BASE,
  hrvLoadMismatch: { daysHrvBelow: 3, daysAvailable: 4, loadFlatOrRising: true },
})
const ptB1 = {
  id:    'hrv-load-mismatch-fires-modify',
  label: 'daysHrvBelow=3, loadFlatOrRising=true: P3-hrv-load-mismatch fires, decision MODIFY',
  pass:
    B1_result.decision === 'MODIFY' &&
    B1_result.rulesFired.some(r => r.id === 'P3-hrv-load-mismatch'),
  decision:   B1_result.decision,
  rulesFired: B1_result.rulesFired.map(r => r.id),
}

// B2: same HRV pattern, loadFlatOrRising=false (athlete already backing off)
// → rule must NOT fire — do not pile on someone already reducing load
const B2_result = evaluate({
  ...HRV_MISMATCH_BASE,
  hrvLoadMismatch: { daysHrvBelow: 3, daysAvailable: 4, loadFlatOrRising: false },
})
const ptB2 = {
  id:    'hrv-load-mismatch-skips-when-load-dropping',
  label: 'daysHrvBelow=3 but loadFlatOrRising=false: rule absent — athlete already backing off',
  pass:  !B2_result.rulesFired.some(r => r.id === 'P3-hrv-load-mismatch'),
  decision:   B2_result.decision,
  rulesFired: B2_result.rulesFired.map(r => r.id),
}

// B3: hrvLoadMismatch=null (< 3 sessions have HRV data) → rule silently skips, no error
const B3_result = evaluate({ ...HRV_MISMATCH_BASE, hrvLoadMismatch: null })
const ptB3 = {
  id:    'hrv-load-mismatch-null-no-error',
  label: 'hrvLoadMismatch=null (thin data): rule absent, no error thrown',
  pass:  !B3_result.rulesFired.some(r => r.id === 'P3-hrv-load-mismatch'),
  decision:   B3_result.decision,
  rulesFired: B3_result.rulesFired.map(r => r.id),
}

// B4: both P3-combined-recovery and P3-hrv-load-mismatch fire simultaneously
// P3-combined-recovery fires when: hrvVsBaselinePct < -15 AND rhrVsBaselineBpm > 7
// Both return MODIFY → decision stays MODIFY, both in rulesFired
const B4_result = evaluate({
  ...HRV_MISMATCH_BASE,
  hrvVsBaselinePct: -20, rhrVsBaselineBpm: 9,
  hrvLoadMismatch: { daysHrvBelow: 3, daysAvailable: 4, loadFlatOrRising: true },
})
const ptB4 = {
  id:    'hrv-load-mismatch-coexists-with-combined-recovery',
  label: 'P3-combined-recovery + P3-hrv-load-mismatch both fire: both in rulesFired, MODIFY decision, no conflict',
  pass:
    B4_result.decision === 'MODIFY' &&
    B4_result.rulesFired.some(r => r.id === 'P3-combined-recovery') &&
    B4_result.rulesFired.some(r => r.id === 'P3-hrv-load-mismatch') &&
    B4_result.reasons.length === 2,
  decision:   B4_result.decision,
  rulesFired: B4_result.rulesFired.map(r => r.id),
  reasonCount: B4_result.reasons.length,
}

// ── calculateHrvLoadMismatch pure-function tests (Fix B refactor) ─────────
// Uses the exact joined-session shape the wrapper produces after its DB join.

// B_a: "already backing off" — loads [150,100,400,440,350], ACWR 0.62.
// ACWR < 0.85, ratio = 125/396.67 = 0.315 < 0.90 → loadFlatOrRising false.
const B_A_SESSIONS = [
  { date: '2026-06-27', session_load: 150, acwr: 0.62, hrv_vs_baseline_pct: -8  },
  { date: '2026-06-26', session_load: 100, acwr: null,  hrv_vs_baseline_pct: -10 },
  { date: '2026-06-24', session_load: 400, acwr: null,  hrv_vs_baseline_pct: -7  },
  { date: '2026-06-23', session_load: 440, acwr: null,  hrv_vs_baseline_pct: -6  },
  { date: '2026-06-22', session_load: 350, acwr: null,  hrv_vs_baseline_pct: -3  },
]
const B_A_result = calculateHrvLoadMismatch(B_A_SESSIONS)
const ptB_a = {
  id:    'hrv-load-mismatch-pure-backing-off',
  label: 'loads [150,100,400,440,350] ACWR=0.62: loadFlatOrRising must be false (athlete already reducing load)',
  pass:  B_A_result !== null && B_A_result.loadFlatOrRising === false,
  result: B_A_result,
}

// B_b: "sustained load, HRV struggling" — loads flat/rising [380,410,400,390,350],
// ACWR 1.0 ≥ 0.85 → loadFlatOrRising true immediately. 3 of 5 HRV below -5.
const B_B_SESSIONS = [
  { date: '2026-06-27', session_load: 380, acwr: 1.0,  hrv_vs_baseline_pct: -8  },
  { date: '2026-06-26', session_load: 410, acwr: null,  hrv_vs_baseline_pct: -12 },
  { date: '2026-06-24', session_load: 400, acwr: null,  hrv_vs_baseline_pct: -9  },
  { date: '2026-06-23', session_load: 390, acwr: null,  hrv_vs_baseline_pct: -3  },
  { date: '2026-06-22', session_load: 350, acwr: null,  hrv_vs_baseline_pct: -2  },
]
const B_B_result = calculateHrvLoadMismatch(B_B_SESSIONS)
const ptB_b = {
  id:    'hrv-load-mismatch-pure-sustained-load',
  label: 'loads flat/rising [380,410,400,390,350] ACWR=1.0: loadFlatOrRising true, daysHrvBelow >= 3',
  pass:  B_B_result !== null && B_B_result.loadFlatOrRising === true && B_B_result.daysHrvBelow >= 3,
  result: B_B_result,
}

// B_c: fewer than 3 sessions have valid HRV → function returns null.
const B_C_SESSIONS = [
  { date: '2026-06-27', session_load: 380, acwr: 1.0,  hrv_vs_baseline_pct: -8  },
  { date: '2026-06-26', session_load: 410, acwr: null,  hrv_vs_baseline_pct: null },
  { date: '2026-06-24', session_load: 400, acwr: null,  hrv_vs_baseline_pct: null },
  { date: '2026-06-23', session_load: 390, acwr: null,  hrv_vs_baseline_pct: -3  },
  { date: '2026-06-22', session_load: 350, acwr: null,  hrv_vs_baseline_pct: null },
]
const B_C_result = calculateHrvLoadMismatch(B_C_SESSIONS)
const ptB_c = {
  id:    'hrv-load-mismatch-pure-thin-hrv-data',
  label: 'Only 2 of 5 sessions have HRV data: function returns null (insufficient data)',
  pass:  B_C_result === null,
  result: B_C_result,
}

// ── UTC-8 late-night check-in date-consistency scenario ──────────────────────
// Scenario: UTC-8 user checks in at 11 pm local (= 07:00 UTC next day).
//
// Before the fix: toISOString() returned the UTC date, so all three tables
// (checkins, recovery_metrics, training_sessions) wrote the UTC "next day"
// date — internally consistent but a calendar day ahead of the user's clock.
//
// After the fix: all three functions use getFullYear/getMonth/getDate (local
// parts), so they all write the same local date string. The critical invariant:
//   checkins.date == recovery_metrics.date == training_sessions.date
// for any row produced during the same check-in/session submission.
//
// This test confirms:
// (a) The engine back-to-back-hard rule fires correctly when both today and
//     yesterday sessions are marked hard. The engine reads `backToBackHard`
//     as a pre-computed boolean signal (from computeAndPersistLoadMetrics,
//     which uses dateOffsetISO(sessionDate, -1) — correct because sessionDate
//     is now a local date and dateOffsetISO arithmetic is timezone-neutral).
// (b) calculateHrvLoadMismatch produces the expected result for a UTC-8 user's
//     session history stored with local-clock dates. The pure function only
//     compares date strings for .in() joins; no clock is touched here.

// (a) Engine: back-to-back hard fires — signals reflect local-clock dates
// (today = "2026-06-27", yesterday = "2026-06-26", both RPE ≥ 7)
const UTC8_B2B_result = evaluate({
  ...HRV_MISMATCH_BASE,
  backToBackHard:       true,
  hardSessionsThisWeek: 4,
  sessionRpe:           8,
  acwr:                 1.1,
  hrvLoadMismatch:      null,
})
const utc8BackToBackTest = {
  id:    'utc-8-late-checkin-back-to-back-fires',
  label: 'UTC-8 user 11 pm local: backToBackHard=true signals flow through engine correctly (P3-back-to-back-hard fires)',
  pass:  UTC8_B2B_result.rulesFired.some(r => r.id === 'P3-back-to-back-hard'),
  decision:   UTC8_B2B_result.decision,
  rulesFired: UTC8_B2B_result.rulesFired.map(r => r.id),
}

// (b) HRV-load mismatch with local-clock session dates.
// Dates "2026-06-27" → "2026-06-23" represent what LogSession and
// updateRecoveryMetrics now write for a UTC-8 user at 11 pm local.
// Recovery_metrics rows for these dates would have matching date strings,
// so the in-memory join in computeHrvLoadMismatch produces correct pairs.
// ACWR 1.1 ≥ 0.85 → loadFlatOrRising true; 4 of 5 days HRV below -5.
const UTC8_HRV_SESSIONS = [
  { date: '2026-06-27', session_load: 420, acwr: 1.1,  hrv_vs_baseline_pct: -9  },
  { date: '2026-06-26', session_load: 410, acwr: null,  hrv_vs_baseline_pct: -7  },
  { date: '2026-06-25', session_load: 400, acwr: null,  hrv_vs_baseline_pct: -8  },
  { date: '2026-06-24', session_load: 390, acwr: null,  hrv_vs_baseline_pct: -6  },
  { date: '2026-06-23', session_load: 350, acwr: null,  hrv_vs_baseline_pct: -2  },
]
const UTC8_HRV_result = calculateHrvLoadMismatch(UTC8_HRV_SESSIONS)
const utc8HrvMismatchTest = {
  id:    'utc-8-late-checkin-hrv-mismatch-consistent',
  label: 'UTC-8 user 11 pm local: calculateHrvLoadMismatch with local-clock dates → loadFlatOrRising true, daysHrvBelow=4',
  pass:  UTC8_HRV_result !== null && UTC8_HRV_result.loadFlatOrRising === true && UTC8_HRV_result.daysHrvBelow === 4,
  result: UTC8_HRV_result,
}

// ── pain_logs write test ──────────────────────────────────────────────────────
// Now that CheckIn.jsx inserts a pain_logs row on every submission, computedPainTrend
// receives real history instead of always getting []. Two sub-cases:
//
// ptPL1 — "improving recovery": scores [0,0,0,2,3] descending (most-recent first,
//   matching signalMapper's ORDER BY date DESC).
//   split = ceil(5/2) = 3 → recent=[0,0,0], earlier=[2,3]
//   avg(recent)=0, avg(earlier)=(2+3)/2=2.5, delta=0-2.5=-2.5
//   delta ≤ -2.0 → 'improving'
const PL1_HISTORY = [
  { pain_score: 0, date: '2026-06-28' },
  { pain_score: 0, date: '2026-06-27' },
  { pain_score: 0, date: '2026-06-26' },
  { pain_score: 2, date: '2026-06-25' },
  { pain_score: 3, date: '2026-06-24' },
]
const ptPL1_result = computedPainTrend(PL1_HISTORY)
const ptPL1 = {
  id:    'pain-logs-write-improving-recovery',
  label: 'pain_logs [0,0,0,2,3] desc: delta=-2.5 clears -2.0 bar, not null, reads improving',
  pass:  ptPL1_result !== null && ptPL1_result === 'improving',
  result: ptPL1_result,
}

// ptPL2 — "worsening onset": scores [3,2,0,0,0] descending (recent days hurt,
//   earlier days were fine).
//   split = ceil(5/2) = 3 → recent=[3,2,0], earlier=[0,0]
//   avg(recent)=(3+2+0)/3=1.667, avg(earlier)=0, delta=1.667-0=1.667
//   delta ≥ 1.0 → 'worsening'
const PL2_HISTORY = [
  { pain_score: 3, date: '2026-06-28' },
  { pain_score: 2, date: '2026-06-27' },
  { pain_score: 0, date: '2026-06-26' },
  { pain_score: 0, date: '2026-06-25' },
  { pain_score: 0, date: '2026-06-24' },
]
const ptPL2_result = computedPainTrend(PL2_HISTORY)
const ptPL2 = {
  id:    'pain-logs-write-worsening-onset',
  label: 'pain_logs [3,2,0,0,0] desc: delta=2.5 ≥ 1.0, not null, reads worsening',
  pass:  ptPL2_result !== null && ptPL2_result === 'worsening',
  result: ptPL2_result,
}

// ── classifyInjury tests ──────────────────────────────────────────────────────

function injuryTest(id, label, signals, expectedId, expectedConf) {
  const result = classifyInjury(signals)
  const passId   = result?.injuryId === expectedId || (result === null && expectedId === null)
  const passConf = expectedConf == null || result?.confidence === expectedConf
  return { id, label, pass: passId && passConf, result }
}

// CI1: No location → always null
const CI1 = injuryTest('ci-no-location', 'No location → null',
  { painLocation: null, painScore: 3, painTrend: 'stable' }, null)

// CI2: Location set but score 0 → null (no pain)
const CI2 = injuryTest('ci-score-zero', 'Location set, score 0 → null',
  { painLocation: 'shin', painScore: 0, painTrend: 'stable' }, null)

// CI3: Shin + score 7 → stress-fracture-risk (high)
const CI3 = injuryTest('ci-stress-fracture-high-score', 'Shin score 7 → stress-fracture-risk high',
  { painLocation: 'shin', painScore: 7, painTrend: 'stable', mileageChangePct: 10, acwr: 1.0, workoutType: 'run', hardSessionsThisWeek: 3 },
  'stress-fracture-risk', 'high')

// CI4: Shin + score 4 + worsening → stress-fracture-risk
const CI4 = injuryTest('ci-stress-fracture-worsening', 'Shin score 4 worsening → stress-fracture-risk',
  { painLocation: 'shin', painScore: 4, painTrend: 'worsening', mileageChangePct: 25, acwr: 1.35, workoutType: 'run', hardSessionsThisWeek: 4 },
  'stress-fracture-risk', 'high')

// CI5: Shin + score 3 + run + high ACWR → shin-splints high
const CI5 = injuryTest('ci-shin-splints-high', 'Shin score 3 + run + ACWR 1.4 → shin-splints high',
  { painLocation: 'shin', painScore: 3, painTrend: 'stable', mileageChangePct: null, acwr: 1.4, workoutType: 'run', hardSessionsThisWeek: 2 },
  'shin-splints', 'high')

// CI6: Shin + score 2, strength, no load spike → shin-splints moderate
const CI6 = injuryTest('ci-shin-splints-moderate', 'Shin score 2 + strength + no spike → shin-splints moderate',
  { painLocation: 'shin', painScore: 2, painTrend: 'stable', mileageChangePct: 5, acwr: 1.0, workoutType: 'strength', hardSessionsThisWeek: 1 },
  'shin-splints', 'moderate')

// CI7: Shin + score 1 with a load spike → shin-splints low
// (stress-fracture check passes since score < 4; HIGH check fails since score < 2; LOW fires)
const CI7 = injuryTest('ci-shin-splints-low', 'Shin score 1 → shin-splints low',
  { painLocation: 'shin', painScore: 1, painTrend: 'stable', mileageChangePct: 30, acwr: 1.4, workoutType: 'run', hardSessionsThisWeek: 3 },
  'shin-splints', 'low')

// CI8: Heel + score 3 + run → plantar-fasciitis high
const CI8 = injuryTest('ci-plantar-fasciitis-high', 'Heel score 3 + run → plantar-fasciitis high',
  { painLocation: 'heel', painScore: 3, painTrend: 'stable', mileageChangePct: null, acwr: 1.1, workoutType: 'run', hardSessionsThisWeek: 2 },
  'plantar-fasciitis', 'high')

// CI9: Outer knee + score 3 + run + high load → it-band high
const CI9 = injuryTest('ci-it-band-high', 'Outer knee score 3 + run + ACWR 1.3 → it-band high',
  { painLocation: 'knee-outer', painScore: 3, painTrend: 'stable', mileageChangePct: 20, acwr: 1.3, workoutType: 'run', hardSessionsThisWeek: 3 },
  'it-band', 'high')

// CI10: Other location + score 4 → unclassified low
const CI10 = injuryTest('ci-unclassified', 'Other location score 4 → unclassified low',
  { painLocation: 'other', painScore: 4, painTrend: 'stable', mileageChangePct: null, acwr: null, workoutType: null, hardSessionsThisWeek: null },
  'unclassified', 'low')

// ── Respiratory rate rule tests ───────────────────────────────────────────────
// The rule fires when respiratoryRate is >= 15% above respiratoryRateBaseline.

const RESP_BASE_SIGNALS = {
  hasBaseline: true, hasLoggedSessions: true,
  acwr: 1.0, mileageChangePct: null, hardSessionsThisWeek: 2,
  backToBackHard: false, sessionRpe: 6, rpeHighOnEasyDay: false,
  hrvVsBaselinePct: -3, rhrVsBaselineBpm: 2, sleepNightsBelowSix: 0,
  morningFatigue: 3, painScore: 0, painTrend: 'stable', painAltersMovement: false,
}

// RR1: respiratoryRate 20% above baseline → rule fires, MODIFY
const RR1_result = evaluate({
  ...RESP_BASE_SIGNALS,
  respiratoryRate: 19.2,         // 20% above
  respiratoryRateBaseline: 16.0,
})
const ptRR1 = {
  id:    'resp-rate-elevated-fires',
  label: 'respRate=19.2, baseline=16.0 (20% above): P3-respiratory-rate-elevated fires, MODIFY',
  pass:
    RR1_result.decision === 'MODIFY' &&
    RR1_result.rulesFired.some(r => r.id === 'P3-respiratory-rate-elevated'),
  decision:   RR1_result.decision,
  rulesFired: RR1_result.rulesFired.map(r => r.id),
}

// RR2: respiratoryRate 10% above baseline → below 15% threshold, rule does NOT fire
const RR2_result = evaluate({
  ...RESP_BASE_SIGNALS,
  respiratoryRate: 17.6,         // 10% above
  respiratoryRateBaseline: 16.0,
})
const ptRR2 = {
  id:    'resp-rate-below-threshold',
  label: 'respRate=17.6, baseline=16.0 (10% above): below threshold — rule absent',
  pass:  !RR2_result.rulesFired.some(r => r.id === 'P3-respiratory-rate-elevated'),
  decision:   RR2_result.decision,
  rulesFired: RR2_result.rulesFired.map(r => r.id),
}

// RR3: respiratoryRate null → rule silently skips
const RR3_result = evaluate({
  ...RESP_BASE_SIGNALS,
  respiratoryRate: null,
  respiratoryRateBaseline: 16.0,
})
const ptRR3 = {
  id:    'resp-rate-null-no-fire',
  label: 'respiratoryRate=null: rule absent, no error',
  pass:  !RR3_result.rulesFired.some(r => r.id === 'P3-respiratory-rate-elevated'),
  decision:   RR3_result.decision,
}

// RR4: baseline null → rule silently skips (can't compute % without baseline)
const RR4_result = evaluate({
  ...RESP_BASE_SIGNALS,
  respiratoryRate: 19.2,
  respiratoryRateBaseline: null,
})
const ptRR4 = {
  id:    'resp-rate-no-baseline-no-fire',
  label: 'respiratoryRateBaseline=null: rule absent (no baseline to compare against)',
  pass:  !RR4_result.rulesFired.some(r => r.id === 'P3-respiratory-rate-elevated'),
  decision:   RR4_result.decision,
}

// ── Graduation criteria tests ─────────────────────────────────────────────────
// evaluateGraduationCriteria is a pure function — no DB needed.
// rtsRows: { pain_score, morning_stiffness }[]  (last 7, descending)
// painLogs: { pain_score, date }[]              (last 14, descending)

function makeRtsRows(n, overrides = []) {
  return Array.from({ length: n }, (_, i) => ({
    pain_score:        0,
    morning_stiffness: 1,
    ...overrides[i],
  }))
}

// GRAD1: 7 days, all pain ≤ 1 and stiffness ≤ 2, trend improving → graduated true
const GRAD1_rows = makeRtsRows(7)
const GRAD1_logs = [
  { pain_score: 0, date: '2026-07-05' },
  { pain_score: 0, date: '2026-07-04' },
  { pain_score: 0, date: '2026-07-03' },
  { pain_score: 1, date: '2026-07-02' },
  { pain_score: 2, date: '2026-07-01' },
]
const GRAD1_result = evaluateGraduationCriteria(GRAD1_rows, GRAD1_logs)
const ptGRAD1 = {
  id:    'graduation-7-days-all-qualifying',
  label: '7 days, pain ≤1, stiffness ≤2, trend improving → graduated: true',
  pass:  GRAD1_result.graduated === true,
  result: GRAD1_result,
}

// GRAD2: Only 6 rows → graduated false (need 7)
const GRAD2_rows = makeRtsRows(6)
const GRAD2_result = evaluateGraduationCriteria(GRAD2_rows, GRAD1_logs)
const ptGRAD2 = {
  id:    'graduation-6-days-not-enough',
  label: '6 qualifying days → graduated: false (need 7)',
  pass:  GRAD2_result.graduated === false,
  result: GRAD2_result,
}

// GRAD3: 7 rows but one pain_score: 3 → graduated false
const GRAD3_rows = makeRtsRows(7, [{ pain_score: 3, morning_stiffness: 1 }])
const GRAD3_result = evaluateGraduationCriteria(GRAD3_rows, GRAD1_logs)
const ptGRAD3 = {
  id:    'graduation-pain-score-too-high',
  label: '7 days but pain_score=3 on one day → graduated: false (must be ≤1)',
  pass:  GRAD3_result.graduated === false,
  result: GRAD3_result,
}

// GRAD4: 7 rows but morning_stiffness: 4 on one day → graduated false
const GRAD4_rows = makeRtsRows(7, [{ pain_score: 0, morning_stiffness: 4 }])
const GRAD4_result = evaluateGraduationCriteria(GRAD4_rows, GRAD1_logs)
const ptGRAD4 = {
  id:    'graduation-stiffness-too-high',
  label: '7 days but morning_stiffness=4 on one day → graduated: false (must be ≤2)',
  pass:  GRAD4_result.graduated === false,
  result: GRAD4_result,
}

// GRAD5: 7 qualifying rows + 5 HRV readings all >= -15 → graduated: true
const GRAD5_rows = makeRtsRows(7)
const GRAD5_hrv = [
  { hrv_vs_baseline_pct: -5  },
  { hrv_vs_baseline_pct: -10 },
  { hrv_vs_baseline_pct: -3  },
  { hrv_vs_baseline_pct: -14 },
  { hrv_vs_baseline_pct:  2  },
]
const GRAD5_result = evaluateGraduationCriteria(GRAD5_rows, GRAD1_logs, GRAD5_hrv)
const ptGRAD5 = {
  id:    'graduation-hrv-all-passing',
  label: '7 qualifying check-ins + 5 HRV readings all >= -15 → graduated: true',
  pass:  GRAD5_result.graduated === true,
  result: GRAD5_result,
}

// GRAD6: 7 qualifying rows + 5 HRV readings but only 2 >= -15 → graduated: false (HRV)
const GRAD6_hrv = [
  { hrv_vs_baseline_pct: -20 },
  { hrv_vs_baseline_pct: -18 },
  { hrv_vs_baseline_pct: -16 },
  { hrv_vs_baseline_pct:  -5 },
  { hrv_vs_baseline_pct:  -3 },
]
const GRAD6_result = evaluateGraduationCriteria(GRAD5_rows, GRAD1_logs, GRAD6_hrv)
const ptGRAD6 = {
  id:    'graduation-hrv-too-low',
  label: '7 qualifying check-ins + 5 HRV readings only 2 >= -15 → graduated: false (HRV suppressed)',
  pass:  GRAD6_result.graduated === false && GRAD6_result.reason.includes('HRV'),
  result: GRAD6_result,
}

// GRAD7: 7 qualifying rows + only 2 HRV readings → graduated: true (criterion skipped)
const GRAD7_hrv = [
  { hrv_vs_baseline_pct: -20 },
  { hrv_vs_baseline_pct: -25 },
]
const GRAD7_result = evaluateGraduationCriteria(GRAD5_rows, GRAD1_logs, GRAD7_hrv)
const ptGRAD7 = {
  id:    'graduation-hrv-insufficient-data',
  label: '7 qualifying check-ins + only 2 HRV readings → graduated: true (criterion skipped, < 4 readings)',
  pass:  GRAD7_result.graduated === true,
  result: GRAD7_result,
}

// ptGC1: MAINTAIN (case 3) with goalContext → action includes goalName
const GC1_signals = {
  hasBaseline: true, hasLoggedSessions: true,
  painScore: 0, acwr: null, mileageChangePct: 5,
  hrvVsBaselinePct: -3, rhrVsBaselineBpm: 2, sleepNightsBelowSix: 0,
}
const GC1_goal = { goalType: 'race', goalName: 'Half Marathon', goalDate: '2026-10-01', goalWeeklyVolume: 30 }
const GC1_result = evaluate(GC1_signals, GC1_goal)
const ptGC1 = {
  id:    'goal-context-maintain',
  label: 'MAINTAIN (case 3) + goal context → action mentions goalName',
  pass:  GC1_result.decision === 'MAINTAIN' && GC1_result.action.includes('Half Marathon'),
  result: GC1_result,
}

// ptGC2: MODIFY + goalContext → goal name absent from action (MODIFY action is untouched)
const GC2_signals = { ...GC1_signals, painScore: 4 }
const GC2_result = evaluate(GC2_signals, GC1_goal)
const ptGC2 = {
  id:    'goal-context-modify',
  label: 'MODIFY + goal context → goal name absent from action (goal context does not override MODIFY)',
  pass:  GC2_result.decision === 'MODIFY' && !GC2_result.action.includes('Half Marathon'),
  result: GC2_result,
}

const results = [
  ...runScenarios(scenarios),
  baselineIsolationTest,
  coldStartTest,
  noSessionsTest,
  hasSessionsNoFlagsTest,
  cumFatigueA,
  cumFatigueB,
  cumFatigueC,
  acwrBoundaryTest,
  readinessMissingFieldTest,
  ptA1,
  ptA2,
  ptA3,
  ptA4,
  ptA5,
  ptB1,
  ptB2,
  ptB3,
  ptB4,
  ptB_a,
  ptB_b,
  ptB_c,
  utc8BackToBackTest,
  utc8HrvMismatchTest,
  ptPL1,
  ptPL2,
  CI1, CI2, CI3, CI4, CI5, CI6, CI7, CI8, CI9, CI10,
  ptRR1, ptRR2, ptRR3, ptRR4,
  ptGRAD1, ptGRAD2, ptGRAD3, ptGRAD4,
  ptGRAD5, ptGRAD6, ptGRAD7,
  ptGC1, ptGC2,
]
console.log(JSON.stringify(results, null, 2))