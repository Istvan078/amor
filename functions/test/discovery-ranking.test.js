const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getDiscoveryRankScore,
  getDistanceBetweenCoordsKm,
  getSharedInterestCount,
  normalizeDiscoveryFeedMode,
  normalizeDiscoveryPremiumFilters,
} = require('../lib/src/discovery/ranking');

test('premium discovery filters are ignored without premium and clamped with premium', () => {
  assert.deepEqual(
    normalizeDiscoveryPremiumFilters(
      {
        maxDistanceKm: 900,
        recentlyActiveOnly: true,
        verifiedOnly: true,
        minSharedInterests: 99,
      },
      false
    ),
    {}
  );

  assert.deepEqual(
    normalizeDiscoveryPremiumFilters(
      {
        maxDistanceKm: 900,
        recentlyActiveOnly: true,
        verifiedOnly: true,
        minSharedInterests: 99,
      },
      true
    ),
    {
      maxDistanceKm: 500,
      recentlyActiveOnly: true,
      verifiedOnly: true,
      minSharedInterests: 10,
    }
  );
});

test('ranking helpers normalize feed mode, distance, and shared interests', () => {
  assert.equal(normalizeDiscoveryFeedMode('nearby'), 'nearby');
  assert.equal(normalizeDiscoveryFeedMode('unexpected'), 'recommended');

  const distanceKm = getDistanceBetweenCoordsKm(
    { lat: 47.4979, lon: 19.0402 },
    { lat: 47.4979, lon: 19.0402 }
  );

  assert.equal(distanceKm, 0);
  assert.equal(
    getSharedInterestCount(
      { interests: ['Coffee', 'Hiking', 'Music'] },
      { interests: ['coffee', 'music', 'films'] }
    ),
    2
  );
});

test('ranking rewards boost, verification, quality, activity, and shared interests', () => {
  const profile = {
    lookingForDistance: 50,
    interests: ['coffee', 'hiking'],
  };
  const now = Date.now();
  const strongCandidate = {
    boostedUntil: new Date(now + 10 * 60 * 1000).toISOString(),
    profileCompleteness: 95,
    profileQualityScore: 92,
    moderationRiskScore: 0,
    lastActiveAt: new Date(now - 5 * 60 * 1000).toISOString(),
    profileVerified: true,
    interests: ['coffee', 'hiking'],
  };
  const weakCandidate = {
    profileCompleteness: 35,
    profileQualityScore: 30,
    moderationRiskScore: 80,
    lastActiveAt: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
    profileVerified: false,
    interests: [],
  };

  const strongScore = getDiscoveryRankScore(
    'recommended',
    profile,
    strongCandidate,
    5,
    now - 24 * 60 * 60 * 1000,
    2
  );
  const weakScore = getDiscoveryRankScore(
    'recommended',
    profile,
    weakCandidate,
    45,
    now - 100 * 24 * 60 * 60 * 1000,
    0
  );

  assert.ok(strongScore > weakScore);
});
