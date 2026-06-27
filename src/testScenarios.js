import { runScenarios } from './athleteiq-engine.js'

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

const results = [...runScenarios(scenarios), baselineIsolationTest]
console.log(JSON.stringify(results, null, 2))