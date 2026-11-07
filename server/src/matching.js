// Explainable matching between a support request and a skill offer.
// Every point comes with a plain-language reason so people can see why a match was suggested.
export const WEIGHTS = { sameCategory: 40, perSharedSkill: 20, maxSkillPoints: 40, urgent: 10, availability: 10 }
export const MIN_SUGGESTION_SCORE = 40

const RELATED = { education: ['technology', 'mentoring'], technology: ['education'], community: ['environment', 'events'], environment: ['community'], wellbeing: ['community'], mentoring: ['education'] }

export function scoreMatch(request, offer) {
  const reasons = []
  let score = 0
  if (request.category && request.category === offer.category) { score += WEIGHTS.sameCategory; reasons.push({ points: WEIGHTS.sameCategory, text: `Same category (${request.category})` }) }
  else if ((RELATED[request.category] || []).includes(offer.category)) { score += WEIGHTS.sameCategory / 2; reasons.push({ points: WEIGHTS.sameCategory / 2, text: `Related categories (${request.category} ↔ ${offer.category})` }) }
  const skills = new Set((offer.skills || []).map((s) => s.toLowerCase()))
  const shared = (request.tags || []).filter((t) => skills.has(t.toLowerCase()))
  if (shared.length) {
    const pts = Math.min(WEIGHTS.maxSkillPoints, shared.length * WEIGHTS.perSharedSkill)
    score += pts; reasons.push({ points: pts, text: `Shared skill${shared.length > 1 ? 's' : ''}: ${shared.join(', ')}` })
  }
  if (score > 0 && request.urgency === 'high') { score += WEIGHTS.urgent; reasons.push({ points: WEIGHTS.urgent, text: 'Request is marked urgent' }) }
  if (score > 0 && request.when && offer.availability && request.when === offer.availability) { score += WEIGHTS.availability; reasons.push({ points: WEIGHTS.availability, text: `Both prefer ${request.when}` }) }
  return { score: Math.min(100, score), reasons }
}

/** All request/offer pairs at or above the threshold, excluding self-matches and blocked pairs. */
export function suggest(requests, offers, { isBlocked = () => false, min = MIN_SUGGESTION_SCORE } = {}) {
  const out = []
  for (const r of requests) for (const o of offers) {
    if (r.authorId === o.authorId || isBlocked(r.authorId, o.authorId)) continue
    const m = scoreMatch(r, o)
    if (m.score >= min) out.push({ requestId: r.id, offerId: o.id, ...m })
  }
  return out.sort((a, b) => b.score - a.score)
}
