/**
 * AthleteIQ Rule Engine
 * Pure function — no side effects, no dependencies.
 * Works in Node.js, React Native, or any browser bundle.
 *
 * Usage:
 *   import { evaluate } from './athleteiq-engine.js';
 *   const result = evaluate(signals);
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const DECISIONS = Object.freeze({
  PUSH:     'PUSH',
  MAINTAIN: 'MAINTAIN',
  MODIFY:   'MODIFY',
  RECOVER:  'RECOVER',
});

export const CONFIDENCE = Object.freeze({
  HIGH:   'HIGH',
  MEDIUM: 'MEDIUM',
  LOW:    'LOW',
});

const SEVERITY = [
  DECISIONS.PUSH,
  DECISIONS.MAINTAIN,
  DECISIONS.MODIFY,
  DECISIONS.RECOVER,
];

// ─── Rule Definitions ─────────────────────────────────────────────────────────

const RULES = [

  // ── P1: Critical — always RECOVER ──────────────────────────────────────────

  {
    id: 'P1-pain-critical',
    priority: 'P1',
    name: 'Pain escalation',
    evaluate({ painScore, painTrend, painAltersMovement }) {
      if (painScore == null) return null;
      const critical =
        painScore >= 5 ||
        (painScore > 0 && painTrend === 'worsening') ||
        painAltersMovement === true;
      if (!critical) return null;
      const reasons = [];
      if (painScore >= 5) reasons.push(`pain score ${painScore}/10 meets stop/refer threshold`);
      if (painTrend === 'worsening') reasons.push('pain trend is worsening');
      if (painAltersMovement) reasons.push('pain is altering movement mechanics');
      return this._fire(reasons.join('; '));
    },
    action: 'No running or loading the affected area. Active recovery only (light walk, swim, mobility). Seek evaluation if no improvement in 3 days.',
    watchFor: 'Stop immediately if pain changes your walking gait or worsens overnight.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.RECOVER,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P1-load-critical',
    priority: 'P1',
    name: 'Critical load spike',
    evaluate({ acwr, mileageChangePct, painScore }) {
      if (acwr == null && mileageChangePct == null) return null;
      const acwrCritical = acwr != null && acwr > 1.5;
      const mileageCritical = mileageChangePct != null &&
                              mileageChangePct > 40 &&
                              painScore != null && painScore > 0;
      if (!acwrCritical && !mileageCritical) return null;
      const reasons = [];
      if (acwrCritical) reasons.push(`ACWR ${acwr.toFixed(2)} exceeds 1.5 high-risk threshold`);
      if (mileageCritical) reasons.push(`mileage spike of ${Math.round(mileageChangePct)}% with pain present`);
      return this._fire(reasons.join('; '));
    },
    action: 'Full deload. Easy, low-impact activity only for 5–7 days minimum. No intervals, no long runs.',
    watchFor: 'Reassess ACWR before scheduling any hard session.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.RECOVER,
               action: this.action, watchFor: this.watchFor };
    },
  },

  // ── P3: Supporting recovery signal — modifies, doesn't independently RECOVER

  {
    id: 'P3-combined-recovery',
    priority: 'P3',
    name: 'Combined recovery deficit (supporting signal)',
    evaluate({ hrvVsBaselinePct, rhrVsBaselineBpm, hasBaseline }) {
      if (!hasBaseline) return null;
      if (hrvVsBaselinePct == null || rhrVsBaselineBpm == null) return null;
      if (hrvVsBaselinePct >= -15 || rhrVsBaselineBpm <= 7) return null;
      return this._fire(
        `Supporting signal: HRV ${Math.round(hrvVsBaselinePct)}% below baseline and resting HR +${Math.round(rhrVsBaselineBpm)} bpm above baseline — both flags active, suggesting reduced recovery capacity`
      );
    },
    action: 'Your recovery markers suggest reduced capacity right now. Combined with today\'s training signals, prioritise rest, sleep, and hydration.',
    watchFor: 'If this pattern repeats for 3+ consecutive days, seek medical or sports science review even if load looks normal.',
    isSupportingSignal: true,
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor,
               isSupportingSignal: true };
    },
  },

  // ── P3: Moderate flags — MODIFY ────────────────────────────────────────────

  {
    id: 'P3-moderate-pain',
    priority: 'P3',
    name: 'Moderate pain',
    evaluate({ painScore }) {
      if (painScore == null || painScore < 3 || painScore > 4) return null;
      return this._fire(`pain score ${painScore}/10 in the modify range (3–4)`);
    },
    action: 'Avoid loads that directly aggravate the pain site. Swap running for cycling or swimming. Monitor score and trend daily.',
    watchFor: 'Escalate to RECOVER if pain rises to 5+ or trend worsens.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P3-load-spike-moderate',
    priority: 'P3',
    name: 'Moderate load spike',
    evaluate({ acwr, mileageChangePct }) {
      const acwrFlag = acwr != null && acwr >= 1.3 && acwr <= 1.5;
      const mileageFlag = mileageChangePct != null &&
                          mileageChangePct >= 20 && mileageChangePct <= 40;
      if (!acwrFlag && !mileageFlag) return null;
      const reasons = [];
      if (acwrFlag) reasons.push(`ACWR ${acwr.toFixed(2)} in caution zone (1.3–1.5)`);
      if (mileageFlag) reasons.push(`mileage up ${Math.round(mileageChangePct)}% — spike zone (20–40%)`);
      return this._fire(reasons.join('; '));
    },
    action: 'Reduce remaining weekly volume by 15–20%. Remove any interval sessions. Keep remaining runs easy.',
    watchFor: 'Check ACWR daily — avoid any further weekly volume increases.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P3-hard-session-overload',
    priority: 'P3',
    name: 'Hard session overload',
    evaluate({ hardSessionsThisWeek, hrvVsBaselinePct, sleepNightsBelowSix, hasBaseline }) {
      if (hardSessionsThisWeek == null || hardSessionsThisWeek < 3) return null;
      const recoveryFlagged =
        (hasBaseline && hrvVsBaselinePct != null && hrvVsBaselinePct < -5) ||
        (sleepNightsBelowSix != null && sleepNightsBelowSix >= 1);
      if (!recoveryFlagged) return null;
      return this._fire(
        `${hardSessionsThisWeek} hard sessions this week with recovery signal flagged`
      );
    },
    action: 'Remove at least one hard session from the remaining week. Replace with easy running or full rest.',
    watchFor: 'Do not add hard sessions until HRV and sleep signals have normalised.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P3-sleep-debt',
    priority: 'P3',
    name: 'Significant sleep debt',
    evaluate({ sleepNightsBelowSix }) {
      if (sleepNightsBelowSix == null || sleepNightsBelowSix < 3) return null;
      return this._fire(
        `${sleepNightsBelowSix} nights below 6 hrs this week — cumulative sleep debt`
      );
    },
    action: 'Swap hard sessions for easy runs or rest. Sleep is the primary intervention this week — prioritise it above training.',
    watchFor: 'If morning fatigue reaches 8+/10 despite better sleep, escalate to RECOVER.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P3-back-to-back-hard',
    priority: 'P3',
    name: 'Back-to-back hard sessions',
    evaluate({ backToBackHard }) {
      if (!backToBackHard) return null;
      return this._fire('two hard sessions on consecutive calendar days detected');
    },
    action: 'Next day must be easy or full rest. Move the next scheduled hard session at least 48 hours forward.',
    watchFor: 'Log RPE post-session — if >8 on the second day, switch to RECOVER.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P3-high-fatigue',
    priority: 'P3',
    name: 'High morning fatigue',
    evaluate({ morningFatigue }) {
      if (morningFatigue == null || morningFatigue < 8) return null;
      return this._fire(`morning fatigue ${morningFatigue}/10 — high flag`);
    },
    action: 'Downgrade today\'s session to easy. If fatigue remains ≥8 tomorrow, escalate to RECOVER.',
    watchFor: 'Persistent high fatigue (2+ days) warrants escalation regardless of other signals.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P3-rpe-easy-day',
    priority: 'P3',
    name: 'RPE high on easy day',
    evaluate({ rpeHighOnEasyDay, sessionRpe }) {
      if (!rpeHighOnEasyDay && !(sessionRpe != null && sessionRpe > 8)) return null;
      const rpeVal = sessionRpe != null ? sessionRpe : '>8';
      return this._fire(`session RPE ${rpeVal} on a planned easy day — recovery deficit signal`);
    },
    action: 'Tomorrow must be full rest or recovery. Reassess the hard session planned for the following day.',
    watchFor: 'If this pattern recurs on back-to-back easy days, schedule a full deload.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MODIFY,
               action: this.action, watchFor: this.watchFor };
    },
  },

  // ── P4: Mild flags — MAINTAIN ──────────────────────────────────────────────

  {
    id: 'P4-mild-pain',
    priority: 'P4',
    name: 'Mild stable pain',
    evaluate({ painScore, painTrend }) {
      if (painScore == null || painScore < 1 || painScore > 2) return null;
      if (painTrend === 'worsening') return null;
      return this._fire(
        `pain score ${painScore}/10 — stable or improving, monitor closely`
      );
    },
    action: 'Proceed as planned. Avoid exercises or movements that directly aggravate the site. Log location and score daily.',
    watchFor: 'Escalate to MODIFY if score rises to 3+ or trend worsens.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MAINTAIN,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P4-mild-recovery-dip',
    priority: 'P4',
    name: 'Mild recovery dip',
    evaluate({ hrvVsBaselinePct, rhrVsBaselineBpm, hasBaseline }) {
      if (!hasBaseline) return null;
      const hrvMild = hrvVsBaselinePct != null &&
                      hrvVsBaselinePct >= -15 && hrvVsBaselinePct < -5;
      const rhrMild = rhrVsBaselineBpm != null &&
                      rhrVsBaselineBpm >= 4 && rhrVsBaselineBpm <= 7;
      if (!hrvMild && !rhrMild) return null;
      if (hrvVsBaselinePct < -15 && rhrVsBaselineBpm > 7) return null;
      const reasons = [];
      if (hrvMild) reasons.push(`HRV ${Math.round(hrvVsBaselinePct)}% below baseline (mild suppression)`);
      if (rhrMild) reasons.push(`resting HR +${Math.round(rhrVsBaselineBpm)} bpm above baseline`);
      return this._fire(reasons.join('; '));
    },
    action: 'Proceed with your planned session. Avoid adding intensity or volume beyond plan.',
    watchFor: 'If both HRV and RHR flags fire on the same day, upgrade to MODIFY or RECOVER.',
    isSupportingSignal: true,
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MAINTAIN,
               action: this.action, watchFor: this.watchFor,
               isSupportingSignal: true };
    },
  },

  {
    id: 'P4-caution-load',
    priority: 'P4',
    name: 'Caution mileage increase',
    evaluate({ mileageChangePct, acwr }) {
      const mileageCaution = mileageChangePct != null &&
                             mileageChangePct >= 10 && mileageChangePct < 20;
      if (!mileageCaution) return null;
      return this._fire(
        `mileage up ${Math.round(mileageChangePct)}% — acceptable but monitor (10–20% range)`
      );
    },
    action: 'Keep the session as planned. Do not add further volume or intensity this week.',
    watchFor: 'If any pain emerges at this load level, reassess immediately.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MAINTAIN,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P4-sleep-deficit-mild',
    priority: 'P4',
    name: 'Mild sleep deficit',
    evaluate({ sleepNightsBelowSix }) {
      if (sleepNightsBelowSix == null || sleepNightsBelowSix !== 2) return null;
      return this._fire('2 nights below 6 hrs this week — early sleep debt forming');
    },
    action: 'Proceed as planned but avoid adding intensity. Prioritise sleep tonight — this is the key intervention.',
    watchFor: 'Escalate to MODIFY if a third poor night occurs.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.MAINTAIN,
               action: this.action, watchFor: this.watchFor };
    },
  },

  // ── P5: All green — PUSH ───────────────────────────────────────────────────

  {
    id: 'P5-ready-to-push',
    priority: 'P5',
    name: 'Ready to push',
    evaluate({ acwr, hrvVsBaselinePct, painScore, sleepNightsBelowSix, hasBaseline }) {
      if (!hasBaseline) return null;
      const acwrGreen = acwr != null && acwr >= 0.8 && acwr <= 1.3;
      const hrvGreen  = hrvVsBaselinePct != null && hrvVsBaselinePct >= -5;
      const painGreen = painScore === 0 || painScore == null;
      const sleepGreen = sleepNightsBelowSix === 0 || sleepNightsBelowSix == null;
      if (!acwrGreen || !hrvGreen || !painGreen || !sleepGreen) return null;
      const hrv = Math.round(hrvVsBaselinePct);
      return this._fire(
        `all systems green — ACWR ${acwr.toFixed(2)}, HRV ${hrv >= 0 ? '+' : ''}${hrv}% vs baseline, pain 0, sleep optimal`
      );
    },
    action: 'Execute the planned hard session in full. You can extend by up to 10% if legs feel good mid-session.',
    watchFor: 'Log post-session RPE — if >8 on an easy day tomorrow, take rest.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.PUSH,
               action: this.action, watchFor: this.watchFor };
    },
  },

  {
    id: 'P5-undertrained-good-signals',
    priority: 'P5',
    name: 'Undertrained with good recovery',
    evaluate({ acwr, hrvVsBaselinePct, painScore, sleepNightsBelowSix, hasBaseline }) {
      if (!hasBaseline) return null;
      const acwrLow  = acwr != null && acwr < 0.8;
      const hrvGreen = hrvVsBaselinePct != null && hrvVsBaselinePct >= -5;
      const painGreen = painScore === 0 || painScore == null;
      const sleepGreen = sleepNightsBelowSix === 0 || sleepNightsBelowSix == null;
      if (!acwrLow || !hrvGreen || !painGreen || !sleepGreen) return null;
      return this._fire(
        `ACWR ${acwr.toFixed(2)} — undertrained but recovery signals are green`
      );
    },
    action: 'Add one moderate session this week. Increase long run by up to 15%. Build gradually — do not jump ACWR above 1.0 in a single week.',
    watchFor: 'Avoid jumping load too aggressively to "catch up" — the whole-week load still matters.',
    _fire(reason) {
      return { id: this.id, priority: this.priority, name: this.name,
               reason, decision: DECISIONS.PUSH,
               action: this.action, watchFor: this.watchFor };
    },
  },

];

// ─── No-baseline handler ──────────────────────────────────────────────────────

function noBaselineResult(signals) {
  const warnings = ['No personal baseline established yet — HRV and RHR rules are disabled. Baseline forms after 7 days of logged data.'];
  const painScore = signals.painScore ?? 0;
  let decision = DECISIONS.MAINTAIN;
  let confidence = CONFIDENCE.LOW;
  const reasons = ['Insufficient baseline data — defaulting to MAINTAIN'];
  let action = 'Proceed with a moderate planned session. Establish 7 days of morning check-ins before load rules activate.';
  let watchFor = 'Log every morning check-in to build your personal baseline as quickly as possible.';

  if (painScore >= 3) {
    decision = DECISIONS.MODIFY;
    confidence = CONFIDENCE.HIGH;
    reasons[0] = `Pain ${painScore}/10 flagged even without baseline`;
    action = 'Reduce intensity and avoid aggravating movements. Pain rules apply regardless of baseline.';
    watchFor = 'Escalate to RECOVER if pain reaches 5+ or worsens.';
  }
  if (painScore >= 5) {
    decision = DECISIONS.RECOVER;
    confidence = CONFIDENCE.HIGH;
    reasons[0] = `Pain ${painScore}/10 — stop/refer threshold regardless of baseline`;
    action = 'No loading. Active recovery only. Seek evaluation if no improvement in 3 days.';
    watchFor = 'Stop if pain changes your gait.';
  }

  return {
    decision, confidence,
    rulesFired: [],
    reasons,
    action,
    watchFor,
    warnings,
  };
}

// ─── Core evaluator ───────────────────────────────────────────────────────────

export function evaluate(signals) {

  if (signals.hasBaseline === false) {
    return noBaselineResult(signals);
  }

  const warnings = [];
  const firedRules = [];

  for (const rule of RULES) {
    const result = rule.evaluate(signals);
    if (result) firedRules.push(result);
  }

  if (firedRules.length === 0) {
    return {
      decision:   DECISIONS.MAINTAIN,
      confidence: CONFIDENCE.MEDIUM,
      rulesFired: [],
      reasons:    ['No flags triggered — proceed with training plan as written'],
      action:     'Execute the training plan as written. No modifications required.',
      watchFor:   'Continue logging all signals daily.',
      warnings,
    };
  }

  let finalDecision = firedRules[0].decision;
  for (const rule of firedRules) {
    if (SEVERITY.indexOf(rule.decision) > SEVERITY.indexOf(finalDecision)) {
      finalDecision = rule.decision;
    }
  }

  // HIGH confidence requires a non-supporting P1/P2 rule — HRV/RHR
  // supporting signals alone (even though they're tagged P3 now) should
  // never independently produce HIGH confidence.
  const hasNonSupportingHighPriority = firedRules.some(
    r => (r.priority === 'P1' || r.priority === 'P2') && !r.isSupportingSignal
  );
  const priorities = firedRules.map(r => r.priority);
  let confidence = CONFIDENCE.MEDIUM;
  if (hasNonSupportingHighPriority) {
    confidence = CONFIDENCE.HIGH;
  } else if (priorities.every(p => p === 'P4' || p === 'P5')) {
    confidence = CONFIDENCE.LOW;
  }

  const keySignals = ['acwr', 'hrvVsBaselinePct', 'rhrVsBaselineBpm', 'sleepNightsBelowSix', 'painScore'];
  const missing = keySignals.filter(k => signals[k] == null);
  if (missing.length >= 3) {
    confidence = CONFIDENCE.LOW;
    warnings.push(`Missing ${missing.length} key signals (${missing.join(', ')}) — confidence downgraded.`);
  } else if (missing.length > 0) {
    warnings.push(`${missing.length} signal(s) missing (${missing.join(', ')}) — some rules may not have fired.`);
  }

  const drivingRule = firedRules.find(r => r.decision === finalDecision);

  // Order reasons: load/sleep/pain signals first (most evidence-based for
  // injury risk per the research hierarchy), HRV/RHR supporting signals
  // last (recovery context, not independent injury predictors).
  const sortedRules = [...firedRules].sort((a, b) => {
    const aSupporting = a.isSupportingSignal ? 1 : 0;
    const bSupporting = b.isSupportingSignal ? 1 : 0;
    return aSupporting - bSupporting;
  });

  return {
    decision:   finalDecision,
    confidence,
    rulesFired: sortedRules.map(({ id, priority, name, reason, decision }) =>
                  ({ id, priority, name, reason, decision })),
    reasons:    sortedRules.map(r => r.reason),
    action:     drivingRule.action,
    watchFor:   drivingRule.watchFor,
    warnings,
  };
}

// ─── Scenario runner (for testing / validation) ───────────────────────────────

export function runScenarios(scenarios) {
  return scenarios.map(scenario => {
    const result = evaluate(scenario.signals);
    const pass = result.decision === scenario.expectedDecision;
    return {
      id:       scenario.id,
      label:    scenario.label,
      expected: scenario.expectedDecision,
      actual:   result.decision,
      pass,
      confidence: result.confidence,
      reasons:    result.reasons,
      warnings:   result.warnings,
    };
  });
}