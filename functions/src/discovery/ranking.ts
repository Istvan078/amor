import { toTimestampMillis } from '../shared/time';

export type DiscoveryFeedMode =
  | 'recommended'
  | 'nearby'
  | 'recentlyActive'
  | 'newProfiles';

export type DiscoveryPremiumFilters = {
  maxDistanceKm?: number;
  recentlyActiveOnly?: boolean;
  verifiedOnly?: boolean;
  minSharedInterests?: number;
};

export type DiscoveryCursor = {
  id: string;
  rankingScore?: number;
  lastActiveAtMillis?: number;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const normalizeStringListValue = (values: unknown): string[] =>
  Array.isArray(values)
    ? values
        .map((value) => String(value ?? '').trim())
        .filter((value) => !!value)
    : [];

const getDistanceKm = (
  originLat: number,
  originLon: number,
  candidateLat: number,
  candidateLon: number
) => {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(candidateLat - originLat);
  const lonDelta = toRadians(candidateLon - originLon);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(toRadians(originLat)) *
      Math.cos(toRadians(candidateLat)) *
      Math.sin(lonDelta / 2) *
      Math.sin(lonDelta / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getDistanceBetweenCoordsKm = (
  origin: unknown,
  candidate: unknown
) => {
  const originCoords =
    origin && typeof origin === 'object'
      ? (origin as Record<string, unknown>)
      : {};
  const candidateCoords =
    candidate && typeof candidate === 'object'
      ? (candidate as Record<string, unknown>)
      : {};
  const originLat = Number(originCoords.lat);
  const originLon = Number(originCoords.lon);
  const candidateLat = Number(candidateCoords.lat);
  const candidateLon = Number(candidateCoords.lon);

  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLon) ||
    !Number.isFinite(candidateLat) ||
    !Number.isFinite(candidateLon)
  ) {
    return null;
  }

  return getDistanceKm(originLat, originLon, candidateLat, candidateLon);
};

export const hasValidLocationCoords = (value: unknown) => {
  const coords =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return (
    Number.isFinite(Number(coords.lat)) &&
    Number.isFinite(Number(coords.lon))
  );
};

export const distanceKmPasses = (
  distanceKm: number | null,
  maxDistanceKm: number
) =>
  distanceKm === null ||
  !Number.isFinite(maxDistanceKm) ||
  distanceKm <= maxDistanceKm;

export const isBoostedIndexEntry = (entry: Record<string, unknown>) =>
  toTimestampMillis(entry.boostedUntil) > Date.now();

export const normalizeDiscoveryFeedMode = (
  value: unknown
): DiscoveryFeedMode => {
  if (
    value === 'nearby' ||
    value === 'recentlyActive' ||
    value === 'newProfiles'
  ) {
    return value;
  }

  return 'recommended';
};

export const normalizeDiscoveryPremiumFilters = (
  value: unknown,
  hasPremiumAccess: boolean
): DiscoveryPremiumFilters => {
  if (!hasPremiumAccess || !value || typeof value !== 'object') {
    return {};
  }

  const filters = value as Record<string, unknown>;
  const maxDistanceKm = Number(filters.maxDistanceKm);
  const minSharedInterests = Number(filters.minSharedInterests);

  return {
    ...(Number.isFinite(maxDistanceKm) && maxDistanceKm > 0
      ? { maxDistanceKm: Math.min(Math.max(maxDistanceKm, 1), 500) }
      : {}),
    ...(filters.recentlyActiveOnly === true
      ? { recentlyActiveOnly: true }
      : {}),
    ...(filters.verifiedOnly === true ? { verifiedOnly: true } : {}),
    ...(Number.isFinite(minSharedInterests) && minSharedInterests > 0
      ? { minSharedInterests: Math.min(Math.max(Math.floor(minSharedInterests), 1), 10) }
      : {}),
  };
};

export const getSharedInterestCount = (
  profile: Record<string, unknown>,
  candidate: Record<string, unknown>
) => {
  const profileInterests = new Set(
    normalizeStringListValue(profile.interests).map((interest) =>
      interest.toLowerCase()
    )
  );

  if (!profileInterests.size) {
    return 0;
  }

  return normalizeStringListValue(candidate.interests).filter((interest) =>
    profileInterests.has(interest.toLowerCase())
  ).length;
};

export const normalizePlaceText = (value: unknown) =>
  typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : '';

export const getPlaceAffinityScore = (
  originPlace: unknown,
  candidatePlace: unknown
) => {
  const origin = normalizePlaceText(originPlace);
  const candidate = normalizePlaceText(candidatePlace);

  if (!origin || !candidate) {
    return 0;
  }

  if (origin === candidate) {
    return 60;
  }

  if (
    origin.length > 2 &&
    candidate.length > 2 &&
    (origin.includes(candidate) || candidate.includes(origin))
  ) {
    return 38;
  }

  const originTokens = new Set(
    origin.split(' ').filter((token) => token.length > 2)
  );
  const sharedTokenCount = candidate
    .split(' ')
    .filter((token) => originTokens.has(token)).length;

  return Math.min(sharedTokenCount * 14, 42);
};

export const getDiscoveryRankScore = (
  feedMode: DiscoveryFeedMode,
  profile: Record<string, unknown>,
  candidate: Record<string, unknown>,
  distanceKm: number | null,
  createdAtMillis: number,
  sharedInterestCount: number,
  placeAffinityScore = 0
) => {
  const now = Date.now();
  const completeness = Math.min(
    Math.max(Number(candidate.profileCompleteness ?? 0), 0),
    100
  );
  const profileQualityScore = Math.min(
    Math.max(Number(candidate.profileQualityScore ?? completeness), 0),
    100
  );
  const moderationRiskScore = Math.min(
    Math.max(Number(candidate.moderationRiskScore ?? 0), 0),
    100
  );
  const lastActiveAtMillis = toTimestampMillis(candidate.lastActiveAt);
  const activeAgeHours = lastActiveAtMillis
    ? Math.max((now - lastActiveAtMillis) / 36e5, 0)
    : 24 * 60;
  const createdAgeHours = createdAtMillis
    ? Math.max((now - createdAtMillis) / 36e5, 0)
    : 24 * 180;
  const maxDistanceKm = Math.max(Number(profile.lookingForDistance ?? 50), 1);
  const distanceScore =
    distanceKm === null
      ? 45
      : Math.max(0, 100 - (distanceKm / maxDistanceKm) * 100);
  const activityScore = Math.max(0, 100 - Math.min(activeAgeHours, 24 * 30) / 7.2);
  const newProfileScore = Math.max(
    0,
    100 - Math.min(createdAgeHours, 24 * 45) / 10.8
  );
  const boostScore = isBoostedIndexEntry(candidate) ? 120 : 0;
  const sharedInterestScore = Math.min(sharedInterestCount, 6) * 18;
  const verificationScore = candidate.profileVerified === true ? 22 : 0;
  const riskPenalty = moderationRiskScore * 0.8;

  const baseScore =
    boostScore +
    verificationScore +
    distanceScore * 0.28 +
    activityScore * 0.24 +
    profileQualityScore * 0.26 +
    completeness * 0.12 +
    sharedInterestScore +
    placeAffinityScore +
    newProfileScore * 0.08 -
    riskPenalty;

  if (feedMode === 'nearby') {
    return baseScore + distanceScore * 0.9;
  }

  if (feedMode === 'recentlyActive') {
    return baseScore + activityScore * 1.05;
  }

  if (feedMode === 'newProfiles') {
    return baseScore + newProfileScore * 1.1;
  }

  return baseScore;
};
