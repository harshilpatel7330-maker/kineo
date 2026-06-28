import { runScenarios, evaluate } from './athleteiq-engine.js'
import { calcReadiness } from './utils/readiness.js'

// Mirror of the exported pure function in baselineCalculator.js — inline here
// so this test file has no Supabase dependency and runs cleanly in Node.
function computeHrvVsBaselinePct(todayHrv, priorReadings) {
  if (todayHrv == null || !priorReadings.length) return null
  const avg = priorReadings.reduce((s, v) => s + v, 0) / priorReadings.length
  return Math.round(((todayHrv - avg) / avg) * 1000) / 10
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
]
console.log(JSON.stringify(results, null, 2))