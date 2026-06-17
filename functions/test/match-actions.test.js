const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildLikeMatchParts,
  buildPassMatchParts,
  buildRemoveMatchParts,
  buildRewindMatchParts,
  normalizeMatchParts,
} = require('../lib/src/matching/match-actions');
const { buildMutualMatchParts } = require('../lib/src/matching/mutual-match');

test('normalizes missing and invalid match parts to uid arrays', () => {
  assert.deepEqual(
    normalizeMatchParts({
      matches: ['match-1', null, 3],
      liked: 'not-an-array',
      notLiked: ['pass-1'],
      superLiked: ['super-1', undefined],
    }),
    {
      matches: ['match-1'],
      liked: [],
      notLiked: ['pass-1'],
      superLiked: ['super-1'],
    }
  );
});

test('like and super-like remove previous pass state and dedupe ids', () => {
  const current = {
    matches: [],
    liked: ['candidate-a'],
    notLiked: ['candidate-a', 'candidate-b'],
    superLiked: [],
  };

  assert.deepEqual(buildLikeMatchParts(current, 'candidate-a'), {
    matches: [],
    liked: ['candidate-a'],
    notLiked: ['candidate-b'],
    superLiked: [],
  });

  assert.deepEqual(buildLikeMatchParts(current, 'candidate-b', true), {
    matches: [],
    liked: ['candidate-a', 'candidate-b'],
    notLiked: ['candidate-a'],
    superLiked: ['candidate-b'],
  });
});

test('pass, rewind, remove, and mutual match keep match state consistent', () => {
  const current = {
    matches: ['candidate-a'],
    liked: ['candidate-a', 'candidate-b'],
    notLiked: ['candidate-c'],
    superLiked: ['candidate-a'],
  };

  assert.deepEqual(buildPassMatchParts(current, 'candidate-a'), {
    matches: ['candidate-a'],
    liked: ['candidate-b'],
    notLiked: ['candidate-c', 'candidate-a'],
    superLiked: [],
  });

  assert.deepEqual(buildRewindMatchParts(current, 'candidate-c'), {
    matches: ['candidate-a'],
    liked: ['candidate-a', 'candidate-b'],
    notLiked: [],
    superLiked: ['candidate-a'],
  });

  assert.deepEqual(buildRemoveMatchParts(current, 'candidate-a'), {
    matches: [],
    liked: ['candidate-b'],
    notLiked: ['candidate-c', 'candidate-a'],
    superLiked: [],
  });

  assert.deepEqual(buildMutualMatchParts(current, 'candidate-b'), {
    matches: ['candidate-a', 'candidate-b'],
    liked: ['candidate-a'],
    notLiked: ['candidate-c'],
    superLiked: ['candidate-a'],
  });
});
