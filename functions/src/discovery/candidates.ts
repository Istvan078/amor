import * as admin from 'firebase-admin';
import * as express from 'express';

import { getNearbyGeoBuckets } from './geohash';
import {
  DiscoveryCursor,
  DiscoveryFeedMode,
  distanceKmPasses,
  getDiscoveryRankScore,
  getDistanceBetweenCoordsKm,
  getPlaceAffinityScore,
  getSharedInterestCount,
  hasValidLocationCoords,
  normalizeDiscoveryFeedMode,
  normalizeDiscoveryPremiumFilters,
} from './ranking';
import {
  normalizeMatchParts,
  normalizeUidList,
} from '../matching/match-actions';
import { normalizeLookingForAgeRange } from '../shared/age-range';
import { toTimestampMillis } from '../shared/time';

export type AuthenticatedDiscoveryRequest = express.Request & {
  user?: admin.auth.DecodedIdToken;
};

type RegisterDiscoverCandidatesOptions = {
  verifyToken: express.RequestHandler;
  getRequestedActionUid: (
    req: AuthenticatedDiscoveryRequest,
    requestedUid: unknown
  ) => string | null;
  getPremiumDiscoveryAccess: (
    db: admin.firestore.Firestore,
    uid: string
  ) => Promise<boolean>;
  defaultLocationFallbackFeedMode: DiscoveryFeedMode;
};

const parseDiscoveryCursor = (value: unknown): DiscoveryCursor | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    const cursor = JSON.parse(value) as Partial<DiscoveryCursor>;

    if (typeof cursor.id === 'string' && cursor.id) {
      return {
        id: cursor.id,
        ...(Number.isFinite(Number(cursor.rankingScore))
          ? { rankingScore: Number(cursor.rankingScore) }
          : {}),
        ...(Number.isFinite(Number(cursor.lastActiveAtMillis))
          ? { lastActiveAtMillis: Number(cursor.lastActiveAtMillis) }
          : {}),
      };
    }
  } catch {
    return {
      id: value,
    };
  }

  return null;
};

const serializeDiscoveryCursor = (
  snapshot: admin.firestore.QueryDocumentSnapshot,
  rankedCursor: boolean
) => {
  if (!rankedCursor) {
    return snapshot.id;
  }

  const data = snapshot.data() as Record<string, unknown>;
  const rankingScore = Number(data.rankingScore ?? 0);
  const lastActiveAtMillis = toTimestampMillis(data.lastActiveAt);

  return JSON.stringify({
    id: snapshot.id,
    rankingScore: Number.isFinite(rankingScore) ? rankingScore : 0,
    lastActiveAtMillis,
  });
};

const normalizeGenderValue = (value: unknown) => {
  if (value === 'man' || value === 'Ferfi') {
    return 'man';
  }

  if (value === 'woman' || value === 'No') {
    return 'woman';
  }

  if (value === 'other' || value === 'Egyeb') {
    return 'other';
  }

  return '';
};

const normalizeSexualOrientationValue = (value: unknown) => {
  const normalizedValue = typeof value === 'string' ? value : '';

  return [
    'heterosexual',
    'gay',
    'lesbian',
    'bisexual',
    'asexual',
    'demisexual',
    'pansexual',
    'queer',
    'questioning',
    'aromantic',
    'omnisexual',
  ].includes(normalizedValue)
    ? normalizedValue
    : '';
};

const getSingleGenderPreferenceFromOrientation = (
  profile: Record<string, unknown>
) => {
  const orientation = normalizeSexualOrientationValue(profile.sexualOrientation);
  const gender = normalizeGenderValue(profile.gender);

  if (orientation === 'heterosexual') {
    if (gender === 'man') {
      return 'woman';
    }

    if (gender === 'woman') {
      return 'man';
    }
  }

  if (orientation === 'gay') {
    if (gender === 'man' || gender === 'woman') {
      return gender;
    }
  }

  if (orientation === 'lesbian') {
    return 'woman';
  }

  return '';
};

const getGenderPreference = (profile: Record<string, unknown>) =>
  normalizeGenderValue(profile.lookingForGender) ||
  getSingleGenderPreferenceFromOrientation(profile);

export const registerDiscoverCandidatesRoute = (
  app: express.Express,
  options: RegisterDiscoverCandidatesOptions
) => {
  app.post(
    '/discoverCandidates',
    options.verifyToken,
    async (req: AuthenticatedDiscoveryRequest, res: express.Response) => {
      const { uid, startAfter } = req.body;
      const myUid = options.getRequestedActionUid(req, uid);
      const resultLimit = Math.min(Math.max(Number(req.body.limit ?? 20), 1), 20);
      const cursor = parseDiscoveryCursor(startAfter);
      const feedMode = normalizeDiscoveryFeedMode(req.body.feedMode);

      if (!myUid) {
        res.sendStatus(403);
        return;
      }

      try {
        const db = admin.firestore();
        const profileSnapshot = await db.collection('users').doc(myUid).get();

        if (!profileSnapshot.exists) {
          res.sendStatus(404);
          return;
        }

        const profile = profileSnapshot.data() ?? {};
        const hasPremiumAccess = await options.getPremiumDiscoveryAccess(db, myUid);
        const premiumFilters = normalizeDiscoveryPremiumFilters(
          req.body.premiumFilters,
          hasPremiumAccess
        );
        const requestCoords =
          req.body.currentLocCoords && typeof req.body.currentLocCoords === 'object'
            ? (req.body.currentLocCoords as Record<string, unknown>)
            : {};
        const requestHasCoords =
          Number.isFinite(Number(requestCoords.lat)) &&
          Number.isFinite(Number(requestCoords.lon));
        const requestedLocationFallback = req.body.locationFallback === true;
        const currentLocCoords =
          !requestedLocationFallback && requestHasCoords
            ? {
              lat: Number(requestCoords.lat),
              lon: Number(requestCoords.lon),
            }
            : !requestedLocationFallback
              ? profile.currentLocCoords
              : null;
        const hasUsableLocation = hasValidLocationCoords(currentLocCoords);
        const fallbackPlace =
          typeof req.body.fallbackPlace === 'string' && req.body.fallbackPlace.trim()
            ? req.body.fallbackPlace.trim()
            : typeof profile.currentPlace === 'string'
              ? profile.currentPlace.trim()
              : '';
        const effectiveFeedMode =
          hasUsableLocation || feedMode !== 'nearby'
            ? feedMode
            : options.defaultLocationFallbackFeedMode;
        const matchParts = normalizeMatchParts(profile.matchParts);
        const excludedUids = new Set([
          myUid,
          ...matchParts.matches,
          ...matchParts.liked,
          ...matchParts.notLiked,
          ...normalizeUidList(profile.blockedUsers),
          ...normalizeUidList(profile.reportedUsers),
        ]);
        const lookingForGender = getGenderPreference(profile);
        const profileGender = normalizeGenderValue(profile.gender);
        const preferredAge = normalizeLookingForAgeRange(profile.lookingForAge);
        const lowerAge = preferredAge.lower;
        const upperAge = preferredAge.upper;
        const profileDistanceKm = Number(profile.lookingForDistance ?? 50);
        const maxDistanceKm = Number.isFinite(premiumFilters.maxDistanceKm)
          ? Number(premiumFilters.maxDistanceKm)
          : profileDistanceKm;
        const activeThresholdMillis = Date.now() - 1000 * 60 * 60 * 24 * 7;
        const geoBuckets = hasUsableLocation
          ? getNearbyGeoBuckets(currentLocCoords, maxDistanceKm)
          : [];
        const useGeoBucketQuery = geoBuckets.length > 0;
        const scanLimit = Math.min(
          resultLimit * (useGeoBucketQuery ? 3 : 5),
          useGeoBucketQuery ? 60 : 100
        );
        const legacyFallbackScanLimit = Math.min(resultLimit * 5, 100);
        const canUseRankedCursor =
          !cursor ||
          (
            Number.isFinite(Number(cursor.rankingScore)) &&
            Number.isFinite(Number(cursor.lastActiveAtMillis))
          );
        const buildCandidateQuery = (
          limitCount: number,
          geoBucketFilter: string[] = [],
          useRankedOrder = true
        ) => {
          let queryRef: admin.firestore.Query = db
            .collection('matchIndex')
            .where('isVisible', '==', true)
            .where('isBanned', '==', false)
            .where('profileCompleted', '==', true)
            .where('hasPhoto', '==', true);

          if (geoBucketFilter.length) {
            queryRef = queryRef.where('geoBucket', 'in', geoBucketFilter);
          }

          if (lookingForGender) {
            queryRef = queryRef.where('gender', '==', lookingForGender);
          }

          if (useRankedOrder) {
            queryRef = queryRef
              .orderBy('rankingScore', 'desc')
              .orderBy('lastActiveAt', 'desc')
              .orderBy(admin.firestore.FieldPath.documentId());

            if (
              cursor?.id &&
              Number.isFinite(Number(cursor.rankingScore)) &&
              Number.isFinite(Number(cursor.lastActiveAtMillis))
            ) {
              queryRef = queryRef.startAfter(
                Number(cursor.rankingScore),
                admin.firestore.Timestamp.fromMillis(
                  Number(cursor.lastActiveAtMillis)
                ),
                cursor.id
              );
            }
          } else {
            queryRef = queryRef.orderBy(admin.firestore.FieldPath.documentId());

            if (cursor?.id) {
              queryRef = queryRef.startAfter(cursor.id);
            }
          }

          return queryRef.limit(limitCount);
        };

        const fetchCandidateDocs = async (
          limitCount: number,
          geoBucketFilter: string[] = []
        ) => {
          if (canUseRankedCursor) {
            try {
              const rankedSnapshot = await buildCandidateQuery(
                limitCount,
                geoBucketFilter,
                true
              ).get();

              return {
                docs: rankedSnapshot.docs,
                ranked: true,
              };
            } catch (error) {
              console.warn(
                'Ranked discovery query failed. Falling back to legacy cursor.',
                error
              );
            }
          }

          const legacySnapshot = await buildCandidateQuery(
            limitCount,
            geoBucketFilter,
            false
          ).get();

          return {
            docs: legacySnapshot.docs,
            ranked: false,
          };
        };

        let activeScanLimit = scanLimit;
        let candidateSnapshotResult = await fetchCandidateDocs(
          scanLimit,
          useGeoBucketQuery ? geoBuckets : []
        );
        let snapshotDocs = candidateSnapshotResult.docs;
        let usedRankedQuery = candidateSnapshotResult.ranked;

        if (useGeoBucketQuery && snapshotDocs.length === 0) {
          activeScanLimit = legacyFallbackScanLimit;
          candidateSnapshotResult = await fetchCandidateDocs(legacyFallbackScanLimit);
          snapshotDocs = candidateSnapshotResult.docs;
          usedRankedQuery = candidateSnapshotResult.ranked;
        } else if (usedRankedQuery && snapshotDocs.length === 0 && !cursor) {
          candidateSnapshotResult = await fetchCandidateDocs(
            legacyFallbackScanLimit,
            []
          );
          snapshotDocs = candidateSnapshotResult.docs;
          usedRankedQuery = candidateSnapshotResult.ranked;
        }

        const scannedCandidates: Array<{
            uid: string;
            claims: Record<string, unknown>;
            createdAtMillis: number;
          }> = snapshotDocs.map((candidateSnapshot) => {
            const claims = candidateSnapshot.data() as Record<string, unknown>;
            const createdAtMillis =
              toTimestampMillis(claims.createdAt) ||
              candidateSnapshot.createTime.toMillis();

            return {
              uid: candidateSnapshot.id,
              createdAtMillis,
              claims: {
                ...claims,
                uid: candidateSnapshot.id,
                createdAt:
                  typeof claims.createdAt === 'string'
                    ? claims.createdAt
                    : candidateSnapshot.createTime.toDate().toISOString(),
              },
            };
          });
        const candidates = scannedCandidates
          .filter((candidate) => !excludedUids.has(candidate.uid))
          .filter((candidate) => {
            const candidateGenderPreference = getGenderPreference(candidate.claims);

            return (
              !profileGender ||
              !candidateGenderPreference ||
              candidateGenderPreference === profileGender
            );
          })
          .filter((candidate) => {
            const age = Number(candidate.claims['age']);

            return (
              !Number.isFinite(age) ||
              (
                age >= Number(lowerAge) &&
                age <= Number(upperAge)
              )
            );
          })
          .map((candidate) => {
            const distanceKm = getDistanceBetweenCoordsKm(
              currentLocCoords,
              candidate.claims['currentLocCoords']
            );
            const sharedInterestCount = getSharedInterestCount(
              profile,
              candidate.claims
            );
            const placeAffinityScore = hasUsableLocation
              ? 0
              : getPlaceAffinityScore(fallbackPlace, candidate.claims['currentPlace']);

            return {
              ...candidate,
              distanceKm,
              sharedInterestCount,
              rankScore: getDiscoveryRankScore(
                effectiveFeedMode,
                profile,
                candidate.claims,
                distanceKm,
                candidate.createdAtMillis,
                sharedInterestCount,
                placeAffinityScore
              ),
            };
          })
          .filter((candidate) => distanceKmPasses(candidate.distanceKm, maxDistanceKm))
          .filter(
            (candidate) =>
              !premiumFilters.recentlyActiveOnly ||
              toTimestampMillis(candidate.claims['lastActiveAt']) >= activeThresholdMillis
          )
          .filter(
            (candidate) =>
              !premiumFilters.verifiedOnly ||
              candidate.claims['profileVerified'] === true
          )
          .filter(
            (candidate) =>
              !premiumFilters.minSharedInterests ||
              candidate.sharedInterestCount >= premiumFilters.minSharedInterests
          )
          .sort((candidateA, candidateB) => {
            const scoreDelta = candidateB.rankScore - candidateA.rankScore;

            if (scoreDelta) {
              return scoreDelta;
            }

            if (effectiveFeedMode === 'nearby') {
              return (candidateA.distanceKm ?? Number.MAX_SAFE_INTEGER) -
                (candidateB.distanceKm ?? Number.MAX_SAFE_INTEGER);
            }

            if (effectiveFeedMode === 'newProfiles') {
              return candidateB.createdAtMillis - candidateA.createdAtMillis;
            }

            return (
              toTimestampMillis(candidateB.claims['lastActiveAt']) -
              toTimestampMillis(candidateA.claims['lastActiveAt'])
            );
          })
          .map((candidate) => ({
            uid: candidate.uid,
            distanceKm: candidate.distanceKm,
            sharedInterestCount: candidate.sharedInterestCount,
          }))
          .slice(0, resultLimit);
        const nextCursor =
          snapshotDocs.length === activeScanLimit
            ? snapshotDocs[snapshotDocs.length - 1]
              ? serializeDiscoveryCursor(
                snapshotDocs[snapshotDocs.length - 1],
                usedRankedQuery
              )
              : null
            : null;

        res.json({
          candidates,
          nextCursor,
          locationFallback: !hasUsableLocation,
        });
      } catch (error) {
        console.error('Discovery candidate lookup failed:', error);
        res.sendStatus(500);
      }
    }
  );
};
