const RECOMMENDATIONS = {
  PUSH: { label: 'Full Training', color: 'green', bgColor: '#22C55E', emoji: '💪' },
  MAINTAIN: { label: 'Moderate Training', color: 'blue', bgColor: '#3B82F6', emoji: '🏃' },
  MODIFY: { label: 'Deload Session', color: 'amber', bgColor: '#F59E0B', emoji: '🔄' },
  RECOVER: { label: 'Recovery Day', color: 'red', bgColor: '#EF4444', emoji: '😴' },
}

export function mapRecommendation(decision) {
  return RECOMMENDATIONS[decision] ?? RECOMMENDATIONS.MAINTAIN
}
