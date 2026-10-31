/**
 * Explainable matching: score a request and offer by shared tags + category.
 * This is deterministic and deliberately avoids sensitive personal profiling.
 */
export function scoreMatch(request, offer) {
  const requestTags = new Set((request.tags || []).map(x => String(x).toLowerCase()));
  const sharedTags = [...new Set((offer.tags || []).map(x => String(x).toLowerCase()))].filter(x => requestTags.has(x));
  const sameCategory = Boolean(request.category && offer.category && request.category === offer.category);
  return { score: sharedTags.length + (sameCategory ? 1 : 0), sharedTags, sameCategory };
}
export function findMatches(requests, offers, limit = 3) {
  return requests.filter(r => r.status !== 'Closed').map(request => ({
    requestId: request.id,
    matches: offers.map(offer => ({ offerId: offer.id, ...scoreMatch(request, offer) }))
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score || a.offerId.localeCompare(b.offerId))
      .slice(0, limit)
  })).filter(row => row.matches.length > 0);
}
