import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, findMatches } from '../src/matching.js';

test('scores shared tags and category transparently', () => {
  const result = scoreMatch({ category: 'Learning', tags: ['Math', 'study'] }, { category: 'Learning', tags: ['math', 'coding'] });
  assert.equal(result.score, 2);
  assert.deepEqual(result.sharedTags, ['math']);
  assert.equal(result.sameCategory, true);
});

test('returns no match when there are no shared signals', () => {
  assert.equal(scoreMatch({ category: 'Community', tags: ['garden'] }, { category: 'Technology', tags: ['coding'] }).score, 0);
});

test('findMatches sorts highest score first and excludes closed requests', () => {
  const requests = [{ id: 'r1', category: 'Learning', tags: ['study', 'math'], status: 'Open' }, { id: 'r2', tags: ['art'], status: 'Closed' }];
  const offers = [{ id: 'o1', category: 'Learning', tags: ['study'] }, { id: 'o2', category: 'Learning', tags: ['study', 'math'] }];
  const result = findMatches(requests, offers);
  assert.equal(result.length, 1);
  assert.equal(result[0].matches[0].offerId, 'o2');
});

test('limits returned matches to requested count', () => {
  const result = findMatches([{ id: 'r', tags: ['help'] }], [1,2,3,4].map(n => ({ id: `o${n}`, tags: ['help'] })), 2);
  assert.equal(result[0].matches.length, 2);
});
