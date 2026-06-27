/**
 * Converts technical engine reason strings into plain-English
 * explanations a non-expert athlete can understand at a glance.
 * Falls back to the original string if no pattern matches, so
 * nothing ever disappears even if a new reason type gets added
 * to the engine later.
 */

const TRANSLATIONS = [
    {
      match: /ACWR ([\d.]+) (in caution zone|exceeds)/,
      translate: (m) =>
        `Your training load has increased noticeably compared to your recent average — this is the kind of jump that's linked to higher injury risk if it continues.`
    },
    {
      match: /mileage (up|spike of) ([\d.]+)%/,
      translate: (m) =>
        `You've increased your training volume by about ${m[2]}% this week — a bigger jump than usual.`
    },
    {
      match: /pain score (\d+)\/10.*stop\/refer threshold/,
      translate: (m) =>
        `You reported significant pain (${m[1]}/10) — this is high enough that it's worth backing off completely and getting it checked if it doesn't improve soon.`
    },
    {
      match: /pain score (\d+)\/10 in the modify range/,
      translate: (m) =>
        `You reported moderate pain (${m[1]}/10) — worth easing off the affected area while keeping an eye on it.`
    },
    {
      match: /pain score (\d+)\/10.*stable or improving/,
      translate: (m) =>
        `You noted some mild discomfort (${m[1]}/10), but it's stable or getting better — just keep monitoring it.`
    },
    {
      match: /pain trend is worsening/,
      translate: () =>
        `The pain you're reporting has been getting worse, not better — that trend matters more than the number itself, and it's a clear signal to back off.`
    },
    {
      match: /pain is altering movement mechanics/,
      translate: () =>
        `You mentioned this pain is changing how you move — that's an important warning sign worth taking seriously.`
    },
    {
      match: /HRV ([+-]?\d+)% below baseline \(mild suppression\)/,
      translate: (m) =>
        `Your recovery marker (HRV) is a bit below your personal normal today — nothing alarming on its own, just a sign you might not be fully recovered.`
    },
    {
      match: /Supporting signal: HRV ([+-]?\d+)% below baseline and resting HR \+?(\d+) bpm/,
      translate: (m) =>
        `Two of your recovery markers — HRV and resting heart rate — are both off from your normal range today. Together, that's a stronger signal that your body hasn't fully bounced back yet.`
    },
    {
      match: /(\d+) hard sessions this week with recovery signal flagged/,
      translate: (m) =>
        `You've had ${m[1]} hard sessions this week, and your recovery markers suggest you're starting to accumulate fatigue.`
    },
    {
      match: /(\d+) nights below 6 hrs this week/,
      translate: (m) =>
        `You've had ${m[1]} nights of short sleep this week — sleep debt like this is one of the clearest predictors of injury risk, so it's worth prioritizing.`
    },
    {
      match: /session RPE (\d+) on a planned easy day/,
      translate: (m) =>
        `Your effort came out at RPE ${m[1]} on a session planned to be easy — when easy days feel that hard it's usually a sign of accumulated fatigue your body hasn't cleared yet.`
    },
    {
      match: /two hard sessions on consecutive calendar days/,
      translate: () =>
        `You trained hard two days in a row without a break between — back-to-back hard sessions raise injury risk if they keep happening.`
    },
    {
      match: /morning fatigue (\d+)\/10/,
      translate: (m) =>
        `You're reporting high fatigue (${m[1]}/10) this morning — your body is asking for an easier day.`
    },
    {
      match: /all systems green/,
      translate: () =>
        `Everything looks good today — your training load, recovery, and pain levels are all in a healthy range.`
    },
    {
      match: /undertrained but recovery signals are green/,
      translate: () =>
        `Your training load has actually been a bit light recently, and your recovery looks great — there's room to add a bit more.`
    },
    {
      match: /Insufficient baseline data/,
      translate: () =>
        `Kineo is still learning your personal patterns — recommendations get more precise after about a week of daily check-ins.`
    },
    {
      match: /No flags triggered/,
      translate: () =>
        `Nothing concerning stood out today, so stick with your planned session.`
    },
  ]
  
  export function translateReason(reason) {
    for (const { match, translate } of TRANSLATIONS) {
      const m = reason.match(match)
      if (m) return translate(m)
    }
    // No pattern matched — fall back to the original, unchanged
    return reason
  }
  
  export function translateReasons(reasons) {
    return reasons.map(r => ({
      plain: translateReason(r),
      technical: r,
    }))
  }