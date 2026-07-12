function isoToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weeksUntil(dateISO) {
  const diffMs = new Date(dateISO + 'T00:00:00') - new Date(isoToday() + 'T00:00:00')
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7))
}

export function getTrainingPhase({ goalType, goalDate } = {}) {
  if (!goalType) return null

  if (goalType === 'fitness') {
    return {
      phase: 'consistency',
      phaseLabel: 'Building Consistency',
      weekNumber: null,
      weeksRemaining: null,
      description: 'Building a consistent training habit',
      focus: 'Hit your weekly session target. Consistency over the next 4–8 weeks builds the habit that makes everything else possible.',
    }
  }

  if (!goalDate) {
    return {
      phase: 'ongoing',
      phaseLabel: 'Ongoing Training',
      weekNumber: null,
      weeksRemaining: null,
      description: 'Training without a specific deadline',
      focus: 'Keep logging sessions and check-ins — your recommendations will get more personalised over time.',
    }
  }

  const weeksToGoal = weeksUntil(goalDate)
  const weeksRemaining = Math.max(0, weeksToGoal)

  if (goalType === 'race') {
    const weekNumber = Math.max(1, Math.min(20, 20 - weeksToGoal + 1))
    if (weeksToGoal > 8) {
      return {
        phase: 'base', phaseLabel: 'Base Building', weekNumber, weeksRemaining,
        description: 'Building your aerobic foundation',
        focus: 'Keep effort easy, prioritise consistency over intensity. This phase is about time on feet, not speed.',
      }
    }
    if (weeksToGoal > 4) {
      return {
        phase: 'build', phaseLabel: 'Build Phase', weekNumber, weeksRemaining,
        description: 'Adding quality work to your base',
        focus: 'Introduce one quality session per week (tempo or intervals). Keep remaining runs easy. Watch your weekly mileage — stay within 10% increases.',
      }
    }
    if (weeksToGoal > 2) {
      return {
        phase: 'peak', phaseLabel: 'Peak Training', weekNumber, weeksRemaining,
        description: 'Your highest training load',
        focus: 'This is your hardest training block. Prioritise sleep and nutrition. Flag any pain immediately — this is when overuse injuries are most common.',
      }
    }
    if (weeksToGoal > 0) {
      return {
        phase: 'taper', phaseLabel: 'Taper Week', weekNumber, weeksRemaining,
        description: 'Taper before your race',
        focus: 'Reduce volume, keep intensity. Trust your training — the work is done. Sleep and hydration are your priority.',
      }
    }
    return {
      phase: 'race', phaseLabel: 'Race Week', weekNumber, weeksRemaining: 0,
      description: "It's race week",
      focus: "Protect your legs. Short easy runs only. No new food, shoes, or routines. Rest is training now.",
    }
  }

  if (goalType === 'strength') {
    const weekNumber = Math.max(1, Math.min(12, 12 - weeksToGoal + 1))
    if (weeksToGoal > 6) {
      return {
        phase: 'accumulation', phaseLabel: 'Accumulation Phase', weekNumber, weeksRemaining,
        description: 'Building volume and work capacity',
        focus: 'Higher volume, moderate intensity. Build work capacity and muscle. Keep RPE at 7–8, avoid grinding near-max sets.',
      }
    }
    if (weeksToGoal > 3) {
      return {
        phase: 'intensification', phaseLabel: 'Intensification Phase', weekNumber, weeksRemaining,
        description: 'Reducing volume, increasing intensity',
        focus: 'Reduce volume, increase intensity. More sets near 85–95% of max. Recovery between sessions is critical now.',
      }
    }
    if (weeksToGoal > 1) {
      return {
        phase: 'peak', phaseLabel: 'Peak / Competition Prep', weekNumber, weeksRemaining,
        description: 'Peaking for your goal',
        focus: 'Peaking for your goal. Heavy singles and doubles. Sleep and nutrition are your biggest levers right now.',
      }
    }
    return {
      phase: 'taper', phaseLabel: 'Final Week', weekNumber, weeksRemaining: Math.max(0, weeksToGoal),
      description: 'Final week before your goal',
      focus: 'Light technique work only. No new PRs this week. Arrive at your goal fresh.',
    }
  }

  return null
}
