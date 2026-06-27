import { runScenarios } from './athleteiq-engine.js'

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
]

const results = runScenarios(scenarios)
console.log(JSON.stringify(results, null, 2))