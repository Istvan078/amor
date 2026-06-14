import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import {
  createApproximateGeoHash,
  createGeoBucket,
  getNearbyGeoBuckets,
} from './src/discovery/geohash';
import { normalizeLookingForAgeRange } from './src/shared/age-range';
import { toTimestampMillis } from './src/shared/time';

admin.initializeApp();

type AuthenticatedRequest = express.Request & {
  user?: admin.auth.DecodedIdToken;
};

type ServerMatchParts = {
  matches: string[];
  liked: string[];
  notLiked: string[];
  superLiked: string[];
};

type ServerMatchAction = 'like' | 'pass' | 'superLike' | 'rewind' | 'remove';

type ServerMatchActionResult = {
  matched: boolean;
  created: boolean;
  matchParts: ServerMatchParts;
};

type ServerBillingConsumables = {
  superLikes?: number;
  profileBoosts?: number;
  [key: string]: number | undefined;
};

type ServerBillingCurrent = {
  isPremium: boolean;
  entitlement: string | null;
  productId: string | null;
  platform: 'ios' | 'android' | 'web';
  expiresAt: string | null;
  activeEntitlements: string[];
  activeSubscriptions: string[];
  consumables: ServerBillingConsumables;
  source: 'revenuecat' | 'cache' | 'local';
  processedRevenueCatEventIds?: string[];
};

type ServerNotificationType =
  | 'new_match'
  | 'new_message'
  | 'super_like'
  | 'promotion';

type NotificationPreferenceKey =
  | 'newMatches'
  | 'newMessages'
  | 'superLikes'
  | 'promotions';

type NotificationDeliveryKey = 'inApp' | 'push';

type DiscoveryFeedMode =
  | 'recommended'
  | 'nearby'
  | 'recentlyActive'
  | 'newProfiles';

type DiscoveryPremiumFilters = {
  maxDistanceKm?: number;
  recentlyActiveOnly?: boolean;
  verifiedOnly?: boolean;
  minSharedInterests?: number;
};

type DiscoveryCursor = {
  id: string;
  rankingScore?: number;
  lastActiveAtMillis?: number;
};

type ProfileVerificationStatus = 'none' | 'pending' | 'approved' | 'rejected';

type ProfileVerificationDecision = 'approved' | 'rejected';

const app = express();

app.use(bodyParser.json());

const BILLING_ENTITLEMENT_ID = 'premium';
const SUPER_LIKE_PACK_SIZE = 5;
const FREE_DAILY_SUPER_LIKES = 1;
const PREMIUM_DAILY_SUPER_LIKES = 5;
const FREE_DAILY_REWINDS = 1;
const SUPER_LIKE_PRODUCT_IDS = new Set([
  'amor_super_like_pack',
  'super_like_pack',
]);
const PROFILE_BOOST_PRODUCT_IDS = new Set([
  'amor_profile_boost',
  'profile_boost',
]);
const PROFILE_VERIFICATION_SELFIE_PREFIX = 'verificationSelfies';
const PROFILE_RISK_REPORT_THRESHOLD = 3;
const PROFILE_FAST_LIKE_WINDOW_MS = 1000 * 60 * 10;
const PROFILE_FAST_LIKE_THRESHOLD = 25;
const REPEATED_BIO_MIN_FINGERPRINT_LENGTH = 24;
const REPEATED_BIO_DUPLICATE_THRESHOLD = 2;
const DEFAULT_LOCATION_FALLBACK_FEED_MODE: DiscoveryFeedMode = 'recentlyActive';

const getIdTokenFromRequest = (req: express.Request): string | null => {
  const authHeader = req.headers.authorization;

  if (!authHeader || Array.isArray(authHeader)) {
    return null;
  }

  return authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : authHeader;
};

const verifyToken = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) => {
  const idToken = getIdTokenFromRequest(req);

  if (!idToken) {
    res.sendStatus(401);
    return;
  }

  admin
    .auth()
    .verifyIdToken(idToken)
    .then((decodedToken: admin.auth.DecodedIdToken) => {
      req.user = decodedToken;
      next();
    })
    .catch((error: unknown) => {
      console.error('Hiba történt a token ellenőrzésekor:', error);
      res.sendStatus(401);
    });
};

const isPrivilegedUser = (req: AuthenticatedRequest) =>
  req.user?.admin === true || req.user?.moderator === true;

const canAccessUser = (req: AuthenticatedRequest, uid: string) =>
  req.user?.uid === uid || isPrivilegedUser(req);

const sanitizeUserClaims = (claims: any): Record<string, unknown> => {
  const safeClaims: Record<string, unknown> = {};

  if (claims?.admin === true) {
    safeClaims.admin = true;
  }

  if (claims?.moderator === true) {
    safeClaims.moderator = true;
  }

  if (claims?.premiumAccess === true) {
    safeClaims.premiumAccess = true;
  }

  return safeClaims;
};

const withoutUid = (values: unknown, uid: string): string[] =>
  Array.isArray(values)
    ? values.filter(
        (value): value is string => typeof value === 'string' && value !== uid
      )
    : [];

const withUniqueUid = (values: unknown, uid: string): string[] => {
  const nextValues = normalizeUidList(values);

  if (!nextValues.includes(uid)) {
    nextValues.push(uid);
  }

  return nextValues;
};

const normalizeUidList = (values: unknown): string[] =>
  Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string')
    : [];

const normalizeMatchParts = (value: unknown): ServerMatchParts => {
  const matchParts =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    matches: normalizeUidList(matchParts.matches),
    liked: normalizeUidList(matchParts.liked),
    notLiked: normalizeUidList(matchParts.notLiked),
    superLiked: normalizeUidList(matchParts.superLiked),
  };
};

const normalizeBillingConsumables = (value: unknown): ServerBillingConsumables => {
  const consumables =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return Object.entries(consumables).reduce<ServerBillingConsumables>(
    (result, [key, item]) => {
      const count = Number(item);

      if (Number.isFinite(count)) {
        result[key] = Math.max(count, 0);
      }

      return result;
    },
    {}
  );
};

const normalizeBillingCurrent = (value: unknown): ServerBillingCurrent => {
  const current =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const platform = current.platform;
  const source = current.source;

  return {
    isPremium: current.isPremium === true,
    entitlement:
      typeof current.entitlement === 'string' ? current.entitlement : null,
    productId:
      typeof current.productId === 'string' ? current.productId : null,
    platform:
      platform === 'ios' || platform === 'android' || platform === 'web'
        ? platform
        : 'web',
    expiresAt:
      typeof current.expiresAt === 'string' ? current.expiresAt : null,
    activeEntitlements: normalizeUidList(current.activeEntitlements),
    activeSubscriptions: normalizeUidList(current.activeSubscriptions),
    consumables: normalizeBillingConsumables(current.consumables),
    source:
      source === 'revenuecat' || source === 'cache' || source === 'local'
        ? source
        : 'cache',
    processedRevenueCatEventIds: normalizeUidList(
      current.processedRevenueCatEventIds
    ),
  };
};

const getDailyUsageDateKey = (date = new Date()) => {
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');

  return `${date.getUTCFullYear()}-${month}-${day}`;
};

const isFutureDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) {
    return false;
  }

  const timestamp = Date.parse(value);

  return !Number.isNaN(timestamp) && timestamp > Date.now();
};

const toIsoStringFromMs = (value: unknown) => {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp).toISOString();
};

const consumableDeltaForProduct = (productId: string) => {
  if (SUPER_LIKE_PRODUCT_IDS.has(productId)) {
    return {
      superLikes: SUPER_LIKE_PACK_SIZE,
    };
  }

  if (PROFILE_BOOST_PRODUCT_IDS.has(productId)) {
    return {
      profileBoosts: 1,
    };
  }

  return {};
};

const isConsumableProduct = (productId: string) =>
  SUPER_LIKE_PRODUCT_IDS.has(productId) ||
  PROFILE_BOOST_PRODUCT_IDS.has(productId);

const incrementDailyUsage = (
  transaction: admin.firestore.Transaction,
  usageRef: admin.firestore.DocumentReference,
  usageData: Record<string, unknown>,
  field: 'superLikesUsed' | 'rewindsUsed'
) => {
  transaction.set(
    usageRef,
    {
      date: getDailyUsageDateKey(),
      [field]: Number(usageData[field] ?? 0) + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

const consumeRewindAllowance = async (
  db: admin.firestore.Firestore,
  transaction: admin.firestore.Transaction,
  uid: string
) => {
  const billingRef = db.doc(`users/${uid}/billing/current`);
  const usageRef = db.doc(`users/${uid}/usage/${getDailyUsageDateKey()}`);
  const [billingSnapshot, usageSnapshot] = await Promise.all([
    transaction.get(billingRef),
    transaction.get(usageRef),
  ]);
  const billing = normalizeBillingCurrent(billingSnapshot.data());

  if (billing.isPremium) {
    return;
  }

  const usageData = usageSnapshot.data() ?? {};
  const rewindsUsed = Number(usageData.rewindsUsed ?? 0);

  if (rewindsUsed >= FREE_DAILY_REWINDS) {
    throw new Error('rewind_limit_reached');
  }

  incrementDailyUsage(transaction, usageRef, usageData, 'rewindsUsed');
};

const consumeSuperLikeAllowance = async (
  db: admin.firestore.Firestore,
  transaction: admin.firestore.Transaction,
  uid: string
) => {
  const billingRef = db.doc(`users/${uid}/billing/current`);
  const usageRef = db.doc(`users/${uid}/usage/${getDailyUsageDateKey()}`);
  const [billingSnapshot, usageSnapshot] = await Promise.all([
    transaction.get(billingRef),
    transaction.get(usageRef),
  ]);
  const billing = normalizeBillingCurrent(billingSnapshot.data());
  const usageData = usageSnapshot.data() ?? {};
  const superLikesUsed = Number(usageData.superLikesUsed ?? 0);

  if (billing.isPremium && superLikesUsed < PREMIUM_DAILY_SUPER_LIKES) {
    incrementDailyUsage(transaction, usageRef, usageData, 'superLikesUsed');
    return;
  }

  const superLikesBalance = Number(billing.consumables.superLikes ?? 0);

  if (superLikesBalance > 0) {
    transaction.set(
      billingRef,
      {
        consumables: {
          ...billing.consumables,
          superLikes: superLikesBalance - 1,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  if (!billing.isPremium && superLikesUsed < FREE_DAILY_SUPER_LIKES) {
    incrementDailyUsage(transaction, usageRef, usageData, 'superLikesUsed');
    return;
  }

  throw new Error('super_like_unavailable');
};

const buildMutualMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => ({
  ...matchParts,
  matches: withUniqueUid(matchParts.matches, otherUid),
  liked: withoutUid(matchParts.liked, otherUid),
  notLiked: withoutUid(matchParts.notLiked, otherUid),
});

const getRequestedActionUid = (
  req: AuthenticatedRequest,
  requestedUid: unknown
): string | null => {
  const uid =
    typeof requestedUid === 'string' && requestedUid.trim()
      ? requestedUid.trim()
      : req.user?.uid;

  if (!uid || !canAccessUser(req, uid)) {
    return null;
  }

  return uid;
};

const PROFILE_COMPLETENESS_DISCOVERY_THRESHOLD = 70;

const hasProfilePhoto = (profile: Record<string, unknown>) => {
  const pictures = profile.pictures;

  return (
    typeof profile.profilePicture === 'string' && !!profile.profilePicture
  ) || (Array.isArray(pictures) && pictures.length > 0);
};

const hasProfileLocation = (profile: Record<string, unknown>) => {
  const coords =
    profile.currentLocCoords && typeof profile.currentLocCoords === 'object'
      ? (profile.currentLocCoords as Record<string, unknown>)
      : {};

  return (
    typeof profile.currentPlace === 'string' && !!profile.currentPlace
  ) || (
    Number.isFinite(Number(coords.lat)) &&
    Number.isFinite(Number(coords.lon))
  );
};

const getProfileCompleteness = (profile: Record<string, unknown>) => {
  const hasCoreIdentity =
    !!profile.birthDate &&
    !!profile.gender &&
    !!profile.lookingForGender;

  const score =
    (hasProfilePhoto(profile) ? 30 : 0) +
    (profile.aboutMe ? 20 : 0) +
    (profile.lookingForType ? 15 : 0) +
    (Array.isArray(profile.interests) && profile.interests.length ? 15 : 0) +
    (hasProfileLocation(profile) ? 10 : 0) +
    (hasCoreIdentity ? 10 : 0);

  return Math.min(score, 100);
};

const normalizeProfileAge = (profile: Record<string, unknown>) => {
  const storedAge = Number(profile.age);

  if (Number.isFinite(storedAge) && storedAge > 0) {
    return storedAge;
  }

  if (typeof profile.birthDate !== 'string') {
    return undefined;
  }

  const birthDate = new Date(profile.birthDate);

  if (Number.isNaN(birthDate.getTime())) {
    return undefined;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (
      today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate()
    );

  if (!birthdayPassed) {
    age--;
  }

  return age;
};

const getProfilePhotoUrl = (profile: Record<string, unknown>) => {
  if (typeof profile.profilePicture === 'string') {
    return profile.profilePicture;
  }

  const pictures = Array.isArray(profile.pictures) ? profile.pictures : [];
  const firstPicture = pictures[0];

  if (firstPicture && typeof firstPicture === 'object') {
    const picture = firstPicture as Record<string, unknown>;

    if (typeof picture.url === 'string') {
      return picture.url;
    }
  }

  return '';
};

const normalizeProfileVerificationStatus = (
  value: unknown
): ProfileVerificationStatus => {
  if (value === 'pending' || value === 'approved' || value === 'rejected') {
    return value;
  }

  return 'none';
};

const normalizeProfileVerificationDecision = (
  value: unknown
): ProfileVerificationDecision | null => {
  if (value === 'approved' || value === 'rejected') {
    return value;
  }

  return null;
};

const isProfileVerified = (profile: Record<string, unknown>) =>
  profile.profileVerified === true &&
  normalizeProfileVerificationStatus(profile.profileVerificationStatus) ===
    'approved';

const normalizeStringListValue = (values: unknown): string[] =>
  Array.isArray(values)
    ? values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => !!value)
    : [];

const getProfilePicturesCount = (profile: Record<string, unknown>) =>
  Array.isArray(profile.pictures) ? profile.pictures.length : 0;

const getBioFingerprint = (bio: unknown) => {
  if (typeof bio !== 'string') {
    return '';
  }

  return bio
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 180);
};

const getProfileQualityScore = (
  profile: Record<string, unknown>,
  profileCompleteness = getProfileCompleteness(profile)
) => {
  const picturesCount = getProfilePicturesCount(profile);
  const bioLength =
    typeof profile.aboutMe === 'string' ? profile.aboutMe.trim().length : 0;
  const interestsCount = normalizeStringListValue(profile.interests).length;
  const baseCompleteness = Math.min(Math.max(profileCompleteness, 0), 100);
  const photoScore = Math.min(picturesCount, 6) * 5;
  const bioScore = Math.min(bioLength / 8, 15);
  const interestsScore = Math.min(interestsCount, 8) * 2.5;
  const verificationScore = isProfileVerified(profile) ? 12 : 0;
  const riskPenalty = Math.min(Number(profile.moderationRiskScore ?? 0), 100) * 0.32;

  return Math.round(
    Math.min(
      Math.max(
        baseCompleteness * 0.52 +
          photoScore +
          bioScore +
          interestsScore +
          verificationScore -
          riskPenalty,
        0
      ),
      100
    )
  );
};

const getIndexRankingScore = (
  profile: Record<string, unknown>,
  profileCompleteness = Number(profile.profileCompleteness ?? 0),
  profileQualityScore = Number(profile.profileQualityScore ?? profileCompleteness)
) => {
  const now = Date.now();
  const completeness = Math.min(Math.max(profileCompleteness, 0), 100);
  const quality = Math.min(Math.max(profileQualityScore, 0), 100);
  const moderationRiskScore = Math.min(
    Math.max(Number(profile.moderationRiskScore ?? 0), 0),
    100
  );
  const lastActiveAtMillis = toTimestampMillis(profile.lastActiveAt);
  const activeAgeHours = lastActiveAtMillis
    ? Math.max((now - lastActiveAtMillis) / 36e5, 0)
    : 24 * 45;
  const activityScore = Math.max(0, 100 - Math.min(activeAgeHours, 24 * 45) / 10.8);
  const verificationScore = isProfileVerified(profile) ? 20 : 0;
  const boostScore = isBoostedIndexEntry(profile) ? 90 : 0;
  const riskPenalty = moderationRiskScore * 0.8;

  return Math.round(
    Math.max(
      boostScore +
        verificationScore +
        quality * 0.42 +
        completeness * 0.28 +
        activityScore * 0.3 -
        riskPenalty,
      0
    )
  );
};

const buildMatchIndexEntry = (
  uid: string,
  profile: Record<string, unknown>
) => {
  const profileCompleteness = getProfileCompleteness(profile);
  const profileQualityScore = getProfileQualityScore(profile, profileCompleteness);
  const bioFingerprint = getBioFingerprint(profile.aboutMe);
  const profileCompleted =
    profileCompleteness >= PROFILE_COMPLETENESS_DISCOVERY_THRESHOLD;
  const hasPhoto = hasProfilePhoto(profile);
  const isBanned = profile.isBanned === true;
  const isVisible =
    profile.isVisible !== false && !isBanned && profileCompleted && hasPhoto;
  const entry: Record<string, unknown> = {
    uid,
    gender: profile.gender,
    lookingForGender: profile.lookingForGender,
    age: normalizeProfileAge(profile),
    currentLocCoords: profile.currentLocCoords,
    geohash: createApproximateGeoHash(profile.currentLocCoords),
    geoBucket: createGeoBucket(profile.currentLocCoords),
    currentPlace: profile.currentPlace,
    isVisible,
    isBanned,
    profileCompleted,
    profileCompleteness,
    hasPhoto,
    lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    photoUrl: getProfilePhotoUrl(profile),
    interests: normalizeStringListValue(profile.interests),
    emailVerified: profile.emailVerified === true,
    profileVerified: isProfileVerified(profile),
    profileVerificationStatus: normalizeProfileVerificationStatus(
      profile.profileVerificationStatus
    ),
    profileQualityScore,
    rankingScore: getIndexRankingScore(
      {
        ...profile,
        profileCompleteness,
        profileQualityScore,
      },
      profileCompleteness,
      profileQualityScore
    ),
    rankingScoreUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    moderationRiskScore: Number(profile.moderationRiskScore ?? 0),
    ...(bioFingerprint ? { bioFingerprint } : {}),
    createdAt: profile.createdAt,
  };

  return Object.entries(entry).reduce<Record<string, unknown>>(
    (result, [key, value]) => {
      if (value !== undefined) {
        result[key] = value;
      }

      return result;
    },
    {}
  );
};

const normalizePublicProfilePictures = (profile: Record<string, unknown>) => {
  const pictures = Array.isArray(profile.pictures) ? profile.pictures : [];

  return pictures
    .map((value) => {
      if (!value || typeof value !== 'object') {
        return null;
      }

      const picture = value as Record<string, unknown>;
      const url = typeof picture.url === 'string' ? picture.url : '';
      const name = typeof picture.name === 'string' ? picture.name : '';

      if (!url) {
        return null;
      }

      return {
        url,
        ...(name ? { name } : {}),
      };
    })
    .filter((picture): picture is { url: string; name?: string } => !!picture)
    .slice(0, 6);
};

const setPublicStringField = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string,
  maxLength = 200
) => {
  const value = source[key];

  if (typeof value !== 'string') {
    return;
  }

  const trimmedValue = value.trim();

  if (trimmedValue) {
    target[key] = trimmedValue.slice(0, maxLength);
  }
};

const setPublicStringListField = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string
) => {
  const values = normalizeStringListValue(source[key]).slice(0, 12);

  if (values.length) {
    target[key] = values;
  }
};

const setPublicNumberField = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  key: string,
  minValue: number,
  maxValue: number
) => {
  const value = Number(source[key]);

  if (!Number.isFinite(value) || value < minValue || value > maxValue) {
    return;
  }

  target[key] = Math.round(value);
};

const buildPublicProfileEntry = (
  uid: string,
  profile: Record<string, unknown>,
  indexEntry = buildMatchIndexEntry(uid, profile)
) => {
  const isVisible = indexEntry.isVisible === true;
  const isBanned = indexEntry.isBanned === true;

  if (!isVisible || isBanned) {
    return null;
  }

  const showOnlineStatus = profile.showOnlineStatus === true;
  const publicProfile: Record<string, unknown> = {
    uid,
    profileCompleted: indexEntry.profileCompleted === true,
    profileCompleteness: Number(indexEntry.profileCompleteness ?? 0),
    profileVerified: indexEntry.profileVerified === true,
    profileVerificationStatus: normalizeProfileVerificationStatus(
      profile.profileVerificationStatus
    ),
    distanceVisibility: profile.distanceVisibility !== false,
    showOnlineStatus,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const pictures = normalizePublicProfilePictures(profile);
  const age = normalizeProfileAge(profile);

  setPublicStringField(publicProfile, profile, 'firstName', 80);
  setPublicStringField(publicProfile, profile, 'gender', 30);
  setPublicStringField(publicProfile, profile, 'aboutMe', 1000);
  setPublicStringField(publicProfile, profile, 'lookingForType', 500);
  setPublicStringField(publicProfile, profile, 'lookingForGender', 30);
  setPublicStringField(publicProfile, profile, 'job', 160);
  setPublicNumberField(publicProfile, profile, 'heightCm', 90, 260);
  setPublicStringField(publicProfile, profile, 'currStudy', 160);
  setPublicStringField(publicProfile, profile, 'highestSchool', 160);
  setPublicStringField(publicProfile, profile, 'zodiacSign', 80);
  setPublicStringField(publicProfile, profile, 'familyPlans', 80);
  setPublicStringField(publicProfile, profile, 'communicationStyle', 80);
  setPublicStringField(publicProfile, profile, 'loveStyle', 80);
  setPublicStringField(publicProfile, profile, 'pets', 80);
  setPublicStringField(publicProfile, profile, 'drinking', 80);
  setPublicStringField(publicProfile, profile, 'smoking', 80);
  setPublicStringField(publicProfile, profile, 'workout', 80);
  setPublicStringField(publicProfile, profile, 'socialMedia', 80);
  setPublicStringField(publicProfile, profile, 'anthemTitle', 180);
  setPublicStringField(publicProfile, profile, 'anthemArtist', 120);
  setPublicStringField(publicProfile, profile, 'anthemAlbum', 160);
  setPublicStringField(publicProfile, profile, 'anthemImageUrl', 600);
  setPublicStringField(publicProfile, profile, 'anthemUrl', 600);
  setPublicStringListField(publicProfile, profile, 'freeTimeAct');
  setPublicStringListField(publicProfile, profile, 'interests');

  if (Number.isFinite(Number(age))) {
    publicProfile.age = age;
  }

  if (profile.lookingForAge && typeof profile.lookingForAge === 'object') {
    publicProfile.lookingForAge = normalizeLookingForAgeRange(
      profile.lookingForAge
    );
  }

  if (profile.distanceVisibility !== false) {
    setPublicStringField(publicProfile, profile, 'currentPlace', 160);
  }

  if (pictures.length) {
    publicProfile.pictures = pictures;
    publicProfile.profilePicture =
      typeof profile.profilePicture === 'string' &&
      pictures.some((picture) => picture.url === profile.profilePicture)
        ? profile.profilePicture
        : pictures[0].url;
  }

  if (profile.createdAt) {
    publicProfile.createdAt = profile.createdAt;
  }

  if (showOnlineStatus) {
    publicProfile.isOnline = profile.isOnline === true;

    if (profile.lastSeenAt) {
      publicProfile.lastSeenAt = profile.lastSeenAt;
    }

    if (profile.lastActiveAt) {
      publicProfile.lastActiveAt = profile.lastActiveAt;
    }
  }

  return publicProfile;
};

const syncProfileSearchDocuments = async (
  db: admin.firestore.Firestore,
  uid: string,
  profile: Record<string, unknown>
) => {
  const indexEntry = buildMatchIndexEntry(uid, profile);
  const publicProfile = buildPublicProfileEntry(uid, profile, indexEntry);
  const publicProfileRef = db.collection('publicProfiles').doc(uid);

  await Promise.all([
    db.collection('matchIndex').doc(uid).set(indexEntry, { merge: true }),
    publicProfile
      ? publicProfileRef.set(publicProfile)
      : publicProfileRef.delete().catch((error: unknown) => {
          const code = (error as { code?: unknown }).code;

          if (code !== 5 && code !== 'not-found') {
            throw error;
          }
        }),
    db.collection('users').doc(uid).set(
      {
        profileQualityScore: indexEntry.profileQualityScore,
      },
      { merge: true }
    ),
  ]);

  return {
    indexEntry,
    publicProfile,
  };
};

const buildLikeMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string,
  isSuperLike = false
): ServerMatchParts => ({
  ...matchParts,
  liked: withUniqueUid(matchParts.liked, otherUid),
  notLiked: withoutUid(matchParts.notLiked, otherUid),
  superLiked: isSuperLike
    ? withUniqueUid(matchParts.superLiked, otherUid)
    : matchParts.superLiked,
});

const buildPassMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => ({
  ...matchParts,
  liked: withoutUid(matchParts.liked, otherUid),
  notLiked: withUniqueUid(matchParts.notLiked, otherUid),
  superLiked: withoutUid(matchParts.superLiked, otherUid),
});

const buildRewindMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => {
  return {
    ...matchParts,
    notLiked: withoutUid(matchParts.notLiked, otherUid),
  };
};

const buildRemoveMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => ({
  ...matchParts,
  matches: withoutUid(matchParts.matches, otherUid),
  liked: withoutUid(matchParts.liked, otherUid),
  superLiked: withoutUid(matchParts.superLiked, otherUid),
  notLiked: withUniqueUid(matchParts.notLiked, otherUid),
});

const runMatchActionTransaction = async (
  myUid: string,
  otherUid: string,
  action: ServerMatchAction
): Promise<ServerMatchActionResult> => {
  const db = admin.firestore();

  return db.runTransaction(async (transaction) => {
    const myProfileRef = db.collection('users').doc(myUid);
    const otherProfileRef = db.collection('users').doc(otherUid);
    const [myProfileSnapshot, otherProfileSnapshot] = await Promise.all([
      transaction.get(myProfileRef),
      transaction.get(otherProfileRef),
    ]);

    if (!myProfileSnapshot.exists || (action !== 'remove' && !otherProfileSnapshot.exists)) {
      throw new Error('profile_not_found');
    }

    const myMatchParts = normalizeMatchParts(
      myProfileSnapshot.data()?.matchParts
    );
    const otherMatchParts = normalizeMatchParts(
      otherProfileSnapshot.data()?.matchParts
    );

    if (action === 'remove') {
      const nextMyMatchParts = buildRemoveMatchParts(myMatchParts, otherUid);

      transaction.update(myProfileRef, {
        matchParts: nextMyMatchParts,
      });

      if (otherProfileSnapshot.exists) {
        transaction.update(otherProfileRef, {
          'matchParts.matches': withoutUid(otherMatchParts.matches, myUid),
        });
      }

      return {
        matched: false,
        created: false,
        matchParts: nextMyMatchParts,
      };
    }

    if (action === 'pass') {
      const nextMyMatchParts = buildPassMatchParts(myMatchParts, otherUid);

      transaction.update(myProfileRef, {
        matchParts: nextMyMatchParts,
      });

      return {
        matched: false,
        created: false,
        matchParts: nextMyMatchParts,
      };
    }

    if (action === 'rewind') {
      await consumeRewindAllowance(db, transaction, myUid);

      const nextMyMatchParts = buildRewindMatchParts(myMatchParts, otherUid);

      transaction.update(myProfileRef, {
        matchParts: nextMyMatchParts,
      });

      return {
        matched: false,
        created: false,
        matchParts: nextMyMatchParts,
      };
    }

    const nextMyDecisionMatchParts = buildLikeMatchParts(
      myMatchParts,
      otherUid,
      action === 'superLike'
    );
    const alreadyMatched =
      nextMyDecisionMatchParts.matches.includes(otherUid) ||
      otherMatchParts.matches.includes(myUid);

    if (alreadyMatched) {
      const nextMyMatchParts = buildMutualMatchParts(myMatchParts, otherUid);

      transaction.update(myProfileRef, {
        matchParts: nextMyMatchParts,
      });

      return {
        matched: true,
        created: false,
        matchParts: nextMyMatchParts,
      };
    }

    if (action === 'superLike') {
      await consumeSuperLikeAllowance(db, transaction, myUid);
    }

    const otherLikesMe =
      otherMatchParts.liked.includes(myUid) ||
      otherMatchParts.superLiked.includes(myUid);

    if (!otherLikesMe) {
      transaction.update(myProfileRef, {
        matchParts: nextMyDecisionMatchParts,
      });

      return {
        matched: false,
        created: false,
        matchParts: nextMyDecisionMatchParts,
      };
    }

    const nextMyMatchParts = buildMutualMatchParts(
      nextMyDecisionMatchParts,
      otherUid
    );
    const nextOtherMatchParts = buildMutualMatchParts(otherMatchParts, myUid);

    transaction.update(myProfileRef, {
      matchParts: nextMyMatchParts,
    });
    transaction.update(otherProfileRef, {
      matchParts: nextOtherMatchParts,
    });

    return {
      matched: true,
      created: true,
      matchParts: nextMyMatchParts,
    };
  });
};

const createNotificationPayload = (
  type: ServerNotificationType,
  actorUid: string,
  title: string,
  body: string,
  conversationId?: string
) => ({
  type,
  actorUid,
  ...(conversationId ? { conversationId } : {}),
  title,
  body,
  isRead: false,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});

const notificationPreferenceByType: Record<
  ServerNotificationType,
  NotificationPreferenceKey
> = {
  new_match: 'newMatches',
  new_message: 'newMessages',
  super_like: 'superLikes',
  promotion: 'promotions',
};

const isNotificationEnabled = (
  profileData: Record<string, unknown>,
  preferenceKey: NotificationPreferenceKey
) => {
  const notificationPreferences =
    profileData.notificationPreferences &&
      typeof profileData.notificationPreferences === 'object'
      ? (profileData.notificationPreferences as Record<string, unknown>)
      : {};

  return notificationPreferences[preferenceKey] !== false;
};

const isNotificationDeliveryEnabled = (
  profileData: Record<string, unknown>,
  deliveryKey: NotificationDeliveryKey
) => {
  const notificationDelivery =
    profileData.notificationDelivery &&
      typeof profileData.notificationDelivery === 'object'
      ? (profileData.notificationDelivery as Record<string, unknown>)
      : {};

  return notificationDelivery[deliveryKey] !== false;
};

const parseTimeToMinutes = (value: unknown, fallback: string): number => {
  const timeValue = typeof value === 'string' ? value : fallback;
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue);

  if (!match) {
    return parseTimeToMinutes(fallback, '00:00');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return parseTimeToMinutes(fallback, '00:00');
  }

  return hours * 60 + minutes;
};

const getTimeZoneMinutes = (date: Date, timeZone: string): number => {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hours = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
    const minutes = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);

    return hours * 60 + minutes;
  } catch {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
};

const isQuietHoursActive = (
  profileData: Record<string, unknown>,
  now = new Date()
): boolean => {
  const quietHours =
    profileData.notificationQuietHours &&
      typeof profileData.notificationQuietHours === 'object'
      ? (profileData.notificationQuietHours as Record<string, unknown>)
      : {};

  if (quietHours.enabled !== true) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(quietHours.start, '22:00');
  const endMinutes = parseTimeToMinutes(quietHours.end, '07:00');
  const timeZone =
    typeof quietHours.timeZone === 'string' && quietHours.timeZone
      ? quietHours.timeZone
      : 'UTC';
  const currentMinutes = getTimeZoneMinutes(now, timeZone);

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

const getUserProfileData = async (uid: string): Promise<Record<string, unknown>> => {
  const profileSnapshot = await admin.firestore().collection('users').doc(uid).get();

  return profileSnapshot.exists ? (profileSnapshot.data() ?? {}) : {};
};

const sendPushToUser = async (
  uid: string,
  notification: admin.messaging.Notification,
  data: Record<string, string>
): Promise<boolean> => {
  try {
    const tokensSnapshot = await admin
      .firestore()
      .collection(`users/${uid}/pushTokens`)
      .get();

    const tokens = tokensSnapshot.docs
      .map((snapshot) => {
        const token = snapshot.data().token;

        return typeof token === 'string' ? token : snapshot.id;
      })
      .filter((token) => !!token);

    if (!tokens.length) {
      return false;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification,
      data,
    });

    if (response.failureCount > 0) {
      console.warn('Some push notifications failed:', {
        uid,
        failureCount: response.failureCount,
        successCount: response.successCount,
      });
    }

    return response.successCount > 0;
  } catch (error) {
    console.error('Failed to send push notification:', error);
    return false;
  }
};

const notifyUserIfEnabled = async (
  uid: string,
  payload: ReturnType<typeof createNotificationPayload>,
  notification: admin.messaging.Notification,
  data: Record<string, string>,
  profileData?: Record<string, unknown>
) => {
  if (!uid) {
    return false;
  }

  const recipientProfile = profileData ?? await getUserProfileData(uid);
  const preferenceKey = notificationPreferenceByType[payload.type];

  if (!isNotificationEnabled(recipientProfile, preferenceKey)) {
    return false;
  }

  let inAppCreated = false;
  let pushSent = false;

  if (isNotificationDeliveryEnabled(recipientProfile, 'inApp')) {
    await admin
      .firestore()
      .collection(`users/${uid}/notifications`)
      .add(payload);

    inAppCreated = true;
  }

  if (
    isNotificationDeliveryEnabled(recipientProfile, 'push') &&
    !isQuietHoursActive(recipientProfile)
  ) {
    pushSent = await sendPushToUser(uid, notification, data);
  }

  return inAppCreated || pushSent;
};

const notifyMutualMatchCreated = (myUid: string, otherUid: string) =>
  Promise.all([
    notifyUserIfEnabled(
      myUid,
      createNotificationPayload(
        'new_match',
        otherUid,
        'New match',
        'You have a new match on Amor.'
      ),
      {
        title: 'New match',
        body: 'You have a new match on Amor.',
      },
      {
        type: 'new_match',
        actorUid: otherUid,
      }
    ),
    notifyUserIfEnabled(
      otherUid,
      createNotificationPayload(
        'new_match',
        myUid,
        'New match',
        'You have a new match on Amor.'
      ),
      {
        title: 'New match',
        body: 'You have a new match on Amor.',
      },
      {
        type: 'new_match',
        actorUid: myUid,
      }
    ),
  ]);

type AccountDeletionResult = {
  uid: string;
  userDocumentDeleted: boolean;
  matchIndexDeleted: boolean;
  storageFilesDeleted: number;
  conversationsDeleted: number;
  userReferencesCleaned: number;
  reportsRetained: number;
  auditEventsRetained: number;
  authUserDeleted: boolean;
};

type ReferenceCleanupEntry = {
  ref: admin.firestore.DocumentReference;
  fields: Set<string>;
};

const ACCOUNT_DELETION_RETENTION_POLICY =
  'retained_for_moderation_safety_and_legal_review';
const ACCOUNT_DELETION_BATCH_SIZE = 400;
const ACCOUNT_DELETION_ARRAY_FIELDS = [
  'matchParts.matches',
  'matchParts.possMatches',
  'matchParts.liked',
  'matchParts.notLiked',
  'matchParts.superLiked',
  'blockedUsers',
  'reportedUsers',
];

const getRequestedDeletionUid = (req: AuthenticatedRequest) => {
  const requestedUid =
    typeof req.body?.uid === 'string' && req.body.uid.trim()
      ? req.body.uid.trim()
      : req.user?.uid;

  return requestedUid ? getRequestedActionUid(req, requestedUid) : null;
};

const commitInChunks = async <T>(
  db: admin.firestore.Firestore,
  items: T[],
  addWrite: (batch: admin.firestore.WriteBatch, item: T) => void
) => {
  for (let index = 0; index < items.length; index += ACCOUNT_DELETION_BATCH_SIZE) {
    const batch = db.batch();
    const chunk = items.slice(index, index + ACCOUNT_DELETION_BATCH_SIZE);

    chunk.forEach((item) => addWrite(batch, item));
    await batch.commit();
  }
};

const deleteStoragePrefix = async (prefix: string): Promise<number> => {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix });

  await Promise.all(
    files.map((file) =>
      file.delete().catch((error: unknown) => {
        const code = (error as { code?: unknown }).code;

        if (code !== 404 && code !== '404') {
          throw error;
        }
      })
    )
  );

  return files.length;
};

const deleteDocumentTree = async (
  db: admin.firestore.Firestore,
  ref: admin.firestore.DocumentReference
) => {
  const snapshot = await ref.get();

  await db.recursiveDelete(ref);

  return snapshot.exists;
};

const deleteUserConversations = async (
  db: admin.firestore.Firestore,
  uid: string
) => {
  const conversationsSnapshot = await db
    .collection('conversations')
    .where('participants', 'array-contains', uid)
    .get();

  for (const conversationSnapshot of conversationsSnapshot.docs) {
    await db.recursiveDelete(conversationSnapshot.ref);
  }

  return conversationsSnapshot.size;
};

const cleanupUserReferences = async (
  db: admin.firestore.Firestore,
  uid: string
) => {
  const cleanupEntries = new Map<string, ReferenceCleanupEntry>();

  await Promise.all(
    ACCOUNT_DELETION_ARRAY_FIELDS.map(async (fieldPath) => {
      const snapshot = await db
        .collection('users')
        .where(fieldPath, 'array-contains', uid)
        .get();

      snapshot.docs.forEach((documentSnapshot) => {
        const existingEntry = cleanupEntries.get(documentSnapshot.ref.path);

        if (existingEntry) {
          existingEntry.fields.add(fieldPath);
          return;
        }

        cleanupEntries.set(documentSnapshot.ref.path, {
          ref: documentSnapshot.ref,
          fields: new Set([fieldPath]),
        });
      });
    })
  );

  const entries = Array.from(cleanupEntries.values());

  await commitInChunks(db, entries, (batch, entry) => {
    const updates: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    Array.from(entry.fields).forEach((fieldPath) => {
      updates[fieldPath] = admin.firestore.FieldValue.arrayRemove(uid);
    });

    batch.update(entry.ref, updates);
  });

  return entries.length;
};

const markAccountDeletionRetention = async (
  db: admin.firestore.Firestore,
  uid: string
) => {
  const reportEntries = new Map<
    string,
    {
      ref: admin.firestore.DocumentReference;
      reporterDeleted: boolean;
      reportedDeleted: boolean;
    }
  >();
  const auditEntries = new Map<
    string,
    {
      ref: admin.firestore.DocumentReference;
      actorDeleted: boolean;
      targetDeleted: boolean;
    }
  >();

  const [reportedBySnapshot, reportedUserSnapshot, actorAuditSnapshot, targetAuditSnapshot] =
    await Promise.all([
      db.collection('reports').where('reporterUid', '==', uid).get(),
      db.collection('reports').where('reportedUid', '==', uid).get(),
      db.collection('moderationAudit').where('actorUid', '==', uid).get(),
      db.collection('moderationAudit').where('targetUid', '==', uid).get(),
    ]);

  reportedBySnapshot.docs.forEach((documentSnapshot) => {
    reportEntries.set(documentSnapshot.ref.path, {
      ref: documentSnapshot.ref,
      reporterDeleted: true,
      reportedDeleted: false,
    });
  });
  reportedUserSnapshot.docs.forEach((documentSnapshot) => {
    const existingEntry = reportEntries.get(documentSnapshot.ref.path);

    if (existingEntry) {
      existingEntry.reportedDeleted = true;
      return;
    }

    reportEntries.set(documentSnapshot.ref.path, {
      ref: documentSnapshot.ref,
      reporterDeleted: false,
      reportedDeleted: true,
    });
  });
  actorAuditSnapshot.docs.forEach((documentSnapshot) => {
    auditEntries.set(documentSnapshot.ref.path, {
      ref: documentSnapshot.ref,
      actorDeleted: true,
      targetDeleted: false,
    });
  });
  targetAuditSnapshot.docs.forEach((documentSnapshot) => {
    const existingEntry = auditEntries.get(documentSnapshot.ref.path);

    if (existingEntry) {
      existingEntry.targetDeleted = true;
      return;
    }

    auditEntries.set(documentSnapshot.ref.path, {
      ref: documentSnapshot.ref,
      actorDeleted: false,
      targetDeleted: true,
    });
  });

  const retentionMetadata = {
    accountDeletionRetentionPolicy: ACCOUNT_DELETION_RETENTION_POLICY,
    accountDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const reports = Array.from(reportEntries.values());
  const auditEvents = Array.from(auditEntries.values());

  await commitInChunks(db, reports, (batch, entry) => {
    batch.set(
      entry.ref,
      {
        ...retentionMetadata,
        ...(entry.reporterDeleted ? { reporterAccountDeleted: true } : {}),
        ...(entry.reportedDeleted ? { reportedAccountDeleted: true } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  await commitInChunks(db, auditEvents, (batch, entry) => {
    batch.set(
      entry.ref,
      {
        ...retentionMetadata,
        ...(entry.actorDeleted ? { actorAccountDeleted: true } : {}),
        ...(entry.targetDeleted ? { targetAccountDeleted: true } : {}),
      },
      { merge: true }
    );
  });

  return {
    reportsRetained: reports.length,
    auditEventsRetained: auditEvents.length,
  };
};

const isAuthUserNotFoundError = (error: unknown) =>
  (error as { code?: unknown }).code === 'auth/user-not-found';

const deleteAccountData = async (uid: string): Promise<AccountDeletionResult> => {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const matchIndexRef = db.collection('matchIndex').doc(uid);
  const publicProfileRef = db.collection('publicProfiles').doc(uid);

  const [
    retentionResult,
    userReferencesCleaned,
    conversationsDeleted,
    storageFilesDeleted,
    publicStorageFilesDeleted,
  ] = await Promise.all([
    markAccountDeletionRetention(db, uid),
    cleanupUserReferences(db, uid),
    deleteUserConversations(db, uid),
    deleteStoragePrefix(`pictures/${uid}/`),
    deleteStoragePrefix(`publicPictures/${uid}/`),
  ]);

  const [userDocumentDeleted, matchIndexSnapshot] = await Promise.all([
    deleteDocumentTree(db, userRef),
    matchIndexRef.get(),
    publicProfileRef.delete(),
  ]);

  if (matchIndexSnapshot.exists) {
    await matchIndexRef.delete();
  }

  let authUserDeleted = true;

  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (!isAuthUserNotFoundError(error)) {
      throw error;
    }

    authUserDeleted = false;
  }

  return {
    uid,
    userDocumentDeleted,
    matchIndexDeleted: matchIndexSnapshot.exists,
    storageFilesDeleted: storageFilesDeleted + publicStorageFilesDeleted,
    conversationsDeleted,
    userReferencesCleaned,
    reportsRetained: retentionResult.reportsRetained,
    auditEventsRetained: retentionResult.auditEventsRetained,
    authUserDeleted,
  };
};

const handleDeleteAccountRequest = async (
  req: AuthenticatedRequest,
  res: express.Response
) => {
  const uid = getRequestedDeletionUid(req);

  if (!uid) {
    res.sendStatus(403);
    return;
  }

  try {
    const result = await deleteAccountData(uid);

    res.json({
      message: 'OK',
      ...result,
    });
  } catch (error) {
    console.error('Account deletion failed:', error);
    res.sendStatus(500);
  }
};

const createMatchActionHandler =
  (action: ServerMatchAction) =>
    async (req: AuthenticatedRequest, res: express.Response) => {
      const { uid, otherUid } = req.body;
      const myUid = getRequestedActionUid(req, uid);

      if (!myUid || typeof otherUid !== 'string' || !otherUid || myUid === otherUid) {
        res.sendStatus(403);
        return;
      }

      try {
        const result = await runMatchActionTransaction(myUid, otherUid, action);

        if (result.created) {
          await notifyMutualMatchCreated(myUid, otherUid);
        }

        void recordMatchActionRiskSignal(myUid, action).catch((riskError) => {
          console.warn('Match action risk signal failed:', riskError);
        });

        res.json({
          message: 'OK',
          ...result,
        });
      } catch (error) {
        console.error('Hiba tortent a match action futtatasa kozben:', error);

        if ((error as Error).message === 'super_like_unavailable') {
          res.sendStatus(402);
          return;
        }

        if ((error as Error).message === 'rewind_limit_reached') {
          res.sendStatus(429);
          return;
        }

        res.sendStatus(500);
      }
    };

type RevenueCatBillingEvent = {
  id: string;
  appUserId: string;
  productId: string;
  type: string;
  entitlementIds: string[];
  expirationAt: string | null;
  platform: ServerBillingCurrent['platform'];
};

const getStringValue = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const getRevenueCatWebhookEvent = (body: unknown): RevenueCatBillingEvent | null => {
  const payload =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};
  const event =
    payload.event && typeof payload.event === 'object'
      ? (payload.event as Record<string, unknown>)
      : payload;
  const appUserId =
    getStringValue(event.app_user_id) ||
    getStringValue(event.appUserId) ||
    getStringValue(event.original_app_user_id);
  const productId =
    getStringValue(event.product_id) ||
    getStringValue(event.productId) ||
    getStringValue(event.product_identifier);
  const type = getStringValue(event.type).toUpperCase();
  const platformValue =
    getStringValue(event.store).toLowerCase() ||
    getStringValue(event.platform).toLowerCase();
  const platform =
    platformValue.includes('app_store') || platformValue.includes('ios')
      ? 'ios'
      : platformValue.includes('play') || platformValue.includes('android')
        ? 'android'
        : 'web';
  const expirationAt =
    toIsoStringFromMs(event.expiration_at_ms) ||
    getStringValue(event.expiration_at) ||
    getStringValue(event.expires_date) ||
    null;
  const id =
    getStringValue(event.id) ||
    getStringValue(event.event_id) ||
    `${appUserId}:${productId}:${type}:${expirationAt ?? ''}`;

  if (!appUserId || !productId || !type) {
    return null;
  }

  return {
    id,
    appUserId,
    productId,
    type,
    entitlementIds: normalizeUidList(event.entitlement_ids),
    expirationAt,
    platform,
  };
};

const isRevenueCatWebhookAuthorized = (req: express.Request) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

  if (!secret) {
    return process.env.FUNCTIONS_EMULATOR === 'true';
  }

  return getIdTokenFromRequest(req) === secret;
};

const isRevenueCatPurchaseEvent = (eventType: string) =>
  [
    'INITIAL_PURCHASE',
    'NON_RENEWING_PURCHASE',
    'RENEWAL',
    'PRODUCT_CHANGE',
  ].includes(eventType);

const applyRevenueCatBillingEvent = async (event: RevenueCatBillingEvent) => {
  const db = admin.firestore();
  const billingRef = db.doc(`users/${event.appUserId}/billing/current`);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(billingRef);
    const current = normalizeBillingCurrent(snapshot.data());
    const processedEventIds = current.processedRevenueCatEventIds ?? [];

    if (processedEventIds.includes(event.id)) {
      return current;
    }

    const nextProcessedEventIds = [...processedEventIds, event.id].slice(-100);
    const nextConsumables = { ...current.consumables };
    const consumableDelta = consumableDeltaForProduct(event.productId);
    const isConsumable = isConsumableProduct(event.productId);
    const isPurchaseEvent = isRevenueCatPurchaseEvent(event.type);

    if (isConsumable && isPurchaseEvent) {
      for (const [key, value] of Object.entries(consumableDelta)) {
        nextConsumables[key] = Number(nextConsumables[key] ?? 0) + Number(value);
      }
    }

    const entitlementIds = event.entitlementIds.length
      ? event.entitlementIds
      : event.type === 'EXPIRATION'
        ? []
        : [BILLING_ENTITLEMENT_ID];
    const subscriptionIsActive =
      !isConsumable &&
      event.type !== 'EXPIRATION' &&
      (!event.expirationAt || isFutureDate(event.expirationAt));
    const nextCurrent: ServerBillingCurrent = isConsumable
      ? {
        ...current,
        productId: event.productId,
        platform: event.platform,
        consumables: nextConsumables,
        source: 'revenuecat',
        processedRevenueCatEventIds: nextProcessedEventIds,
      }
      : {
        ...current,
        isPremium:
          subscriptionIsActive && entitlementIds.includes(BILLING_ENTITLEMENT_ID),
        entitlement:
          subscriptionIsActive && entitlementIds.includes(BILLING_ENTITLEMENT_ID)
            ? BILLING_ENTITLEMENT_ID
            : null,
        productId: subscriptionIsActive ? event.productId : null,
        platform: event.platform,
        expiresAt: subscriptionIsActive ? event.expirationAt : null,
        activeEntitlements: subscriptionIsActive ? entitlementIds : [],
        activeSubscriptions: subscriptionIsActive ? [event.productId] : [],
        consumables: nextConsumables,
        source: 'revenuecat',
        processedRevenueCatEventIds: nextProcessedEventIds,
      };

    transaction.set(
      billingRef,
      {
        ...nextCurrent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return nextCurrent;
  });
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

const toRadians = (value: number) => (value * Math.PI) / 180;

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

const getDistanceBetweenCoordsKm = (origin: unknown, candidate: unknown) => {
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

const hasValidLocationCoords = (value: unknown) => {
  const coords =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return (
    Number.isFinite(Number(coords.lat)) &&
    Number.isFinite(Number(coords.lon))
  );
};

const distanceKmPasses = (distanceKm: number | null, maxDistanceKm: number) =>
  distanceKm === null || !Number.isFinite(maxDistanceKm) || distanceKm <= maxDistanceKm;

const isBoostedIndexEntry = (entry: Record<string, unknown>) =>
  toTimestampMillis(entry.boostedUntil) > Date.now();

const normalizeDiscoveryFeedMode = (value: unknown): DiscoveryFeedMode => {
  if (
    value === 'nearby' ||
    value === 'recentlyActive' ||
    value === 'newProfiles'
  ) {
    return value;
  }

  return 'recommended';
};

const normalizeDiscoveryPremiumFilters = (
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

const getPremiumDiscoveryAccess = async (
  db: admin.firestore.Firestore,
  uid: string
) => {
  const billingSnapshot = await db.doc(`users/${uid}/billing/current`).get();
  const billing = normalizeBillingCurrent(billingSnapshot.data());

  return (
    billing.isPremium ||
    billing.entitlement === BILLING_ENTITLEMENT_ID ||
    billing.activeEntitlements.includes(BILLING_ENTITLEMENT_ID)
  );
};

const getSharedInterestCount = (
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

const normalizePlaceText = (value: unknown) =>
  typeof value === 'string'
    ? value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
    : '';

const getPlaceAffinityScore = (
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

const getDiscoveryRankScore = (
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

const getProfileDisplayName = (profile: Record<string, unknown>, uid: string) =>
  [
    typeof profile.firstName === 'string' ? profile.firstName.trim() : '',
    typeof profile.lastName === 'string' ? profile.lastName.trim() : '',
  ]
    .filter(Boolean)
    .join(' ') || uid.slice(0, 8);

const getProfileRiskScore = (reasons: string[]) => {
  const weights: Record<string, number> = {
    too_many_reports: 62,
    fast_like_velocity: 48,
    repeated_bio: 36,
    empty_profile: 28,
  };

  return Math.min(
    reasons.reduce((score, reason) => score + (weights[reason] ?? 18), 0),
    100
  );
};

const buildRiskProfileSnapshot = (
  uid: string,
  profile: Record<string, unknown>
) => ({
  displayName: getProfileDisplayName(profile, uid),
  photoUrl: getProfilePhotoUrl(profile),
  aboutMe: typeof profile.aboutMe === 'string' ? profile.aboutMe.slice(0, 500) : '',
  profileCompleteness: getProfileCompleteness(profile),
  profileQualityScore: getProfileQualityScore(profile),
});

const writeSystemModerationAudit = async (
  db: admin.firestore.Firestore,
  input: {
    action: string;
    targetUid: string;
    details?: string;
  }
) => {
  await db.collection('moderationAudit').add({
    action: input.action,
    actorUid: 'system',
    actorEmail: 'system@amor.internal',
    targetUid: input.targetUid,
    reportId: '',
    details: input.details ?? '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
};

const upsertProfileRiskFlag = async (
  db: admin.firestore.Firestore,
  uid: string,
  profile: Record<string, unknown>,
  reasons: string[],
  trigger: string,
  detail = ''
) => {
  const uniqueReasons = [...new Set(reasons)].sort();
  const riskScore = getProfileRiskScore(uniqueReasons);
  const flagRef = db.collection('profileRiskFlags').doc(uid);
  const existingFlag = await flagRef.get();
  const existingStatus =
    typeof existingFlag.data()?.status === 'string'
      ? existingFlag.data()?.status
      : '';
  const shouldReopen =
    !existingFlag.exists ||
    existingStatus === 'dismissed' ||
    existingStatus === 'reviewed';

  await Promise.all([
    flagRef.set(
      {
        uid,
        status: shouldReopen ? 'open' : existingStatus || 'open',
        reasons: uniqueReasons,
        riskScore,
        profile: buildRiskProfileSnapshot(uid, profile),
        lastTrigger: trigger,
        triggers: admin.firestore.FieldValue.arrayUnion(trigger),
        detail,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(existingFlag.exists
          ? {}
          : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true }
    ),
    db.collection('users').doc(uid).set(
      {
        moderationRiskScore: riskScore,
        moderationRiskReasons: uniqueReasons,
        lastRiskFlaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    db.collection('matchIndex').doc(uid).set(
      {
        moderationRiskScore: riskScore,
        moderationRiskReasons: uniqueReasons,
        lastRiskFlaggedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
  ]);

  await writeSystemModerationAudit(db, {
    action: 'profile_risk_flagged',
    targetUid: uid,
    details: `${trigger}: ${uniqueReasons.join(', ')}${detail ? ` (${detail})` : ''}`,
  });

  return riskScore;
};

const clearProfileRiskScore = async (
  db: admin.firestore.Firestore,
  uid: string
) => {
  await Promise.all([
    db.collection('users').doc(uid).set(
      {
        moderationRiskScore: 0,
        moderationRiskReasons: [],
      },
      { merge: true }
    ),
    db.collection('matchIndex').doc(uid).set(
      {
        moderationRiskScore: 0,
        moderationRiskReasons: [],
      },
      { merge: true }
    ),
  ]);
};

const getReportedUserReportCount = async (
  db: admin.firestore.Firestore,
  uid: string
) => {
  const snapshot = await db
    .collection('reports')
    .where('reportedUid', '==', uid)
    .limit(PROFILE_RISK_REPORT_THRESHOLD)
    .get();

  return snapshot.size;
};

const getDuplicateBioUids = async (
  db: admin.firestore.Firestore,
  uid: string,
  bioFingerprint: string
) => {
  if (bioFingerprint.length < REPEATED_BIO_MIN_FINGERPRINT_LENGTH) {
    return [];
  }

  const snapshot = await db
    .collection('matchIndex')
    .where('bioFingerprint', '==', bioFingerprint)
    .limit(REPEATED_BIO_DUPLICATE_THRESHOLD + 2)
    .get();

  return snapshot.docs
    .map((documentSnapshot) => documentSnapshot.id)
    .filter((candidateUid) => candidateUid !== uid);
};

const evaluateAndFlagProfileRisk = async (
  db: admin.firestore.Firestore,
  uid: string,
  profile: Record<string, unknown>,
  trigger: string
) => {
  const reasons: string[] = [];
  const details: string[] = [];
  const profileCompleteness = getProfileCompleteness(profile);
  const hasMeaningfulBio =
    typeof profile.aboutMe === 'string' && profile.aboutMe.trim().length >= 24;
  const hasInterests = normalizeStringListValue(profile.interests).length > 0;
  const hasPhoto = hasProfilePhoto(profile);
  const isPublicEnoughForRisk =
    profile.isVisible === true ||
    profile.profileCompleted === true ||
    profileCompleteness >= PROFILE_COMPLETENESS_DISCOVERY_THRESHOLD;
  const bioFingerprint = getBioFingerprint(profile.aboutMe);
  const [reportedCount, duplicateBioUids] = await Promise.all([
    getReportedUserReportCount(db, uid),
    getDuplicateBioUids(db, uid, bioFingerprint),
  ]);

  if (reportedCount >= PROFILE_RISK_REPORT_THRESHOLD) {
    reasons.push('too_many_reports');
    details.push(`${reportedCount}+ reports`);
  }

  if (
    isPublicEnoughForRisk &&
    duplicateBioUids.length >= REPEATED_BIO_DUPLICATE_THRESHOLD
  ) {
    reasons.push('repeated_bio');
    details.push(`shared bio with ${duplicateBioUids.slice(0, 3).join(', ')}`);
  }

  if (
    isPublicEnoughForRisk &&
    (profileCompleteness < 45 ||
      !hasPhoto ||
      (!hasMeaningfulBio && !hasInterests))
  ) {
    reasons.push('empty_profile');
    details.push(`quality ${getProfileQualityScore(profile, profileCompleteness)}`);
  }

  if (!reasons.length) {
    await clearProfileRiskScore(db, uid);
    return 0;
  }

  return upsertProfileRiskFlag(
    db,
    uid,
    profile,
    reasons,
    trigger,
    details.join('; ')
  );
};

const recordMatchActionRiskSignal = async (
  uid: string,
  action: ServerMatchAction
) => {
  if (action !== 'like' && action !== 'superLike') {
    return;
  }

  const db = admin.firestore();
  const signalRef = db.collection('trustSignals').doc(uid);
  const now = Date.now();
  const likeActionCount = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(signalRef);
    const signal = snapshot.data() ?? {};
    const windowStartedAt = toTimestampMillis(signal.likeWindowStartedAt);
    const isSameWindow =
      windowStartedAt > 0 && now - windowStartedAt <= PROFILE_FAST_LIKE_WINDOW_MS;
    const nextLikeActionCount = isSameWindow
      ? Number(signal.likeActionCount ?? 0) + 1
      : 1;

    transaction.set(
      signalRef,
      {
        uid,
        likeWindowStartedAt: isSameWindow
          ? signal.likeWindowStartedAt
          : admin.firestore.FieldValue.serverTimestamp(),
        likeActionCount: nextLikeActionCount,
        lastLikeActionAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return nextLikeActionCount;
  });

  if (likeActionCount < PROFILE_FAST_LIKE_THRESHOLD) {
    return;
  }

  const profileSnapshot = await db.collection('users').doc(uid).get();

  if (!profileSnapshot.exists) {
    return;
  }

  await upsertProfileRiskFlag(
    db,
    uid,
    profileSnapshot.data() ?? {},
    ['fast_like_velocity'],
    'match_action_velocity',
    `${likeActionCount} likes in ${PROFILE_FAST_LIKE_WINDOW_MS / 60000} minutes`
  );
};

const getRiskRelevantProfileSignature = (profile: Record<string, unknown>) =>
  JSON.stringify({
    aboutMe: profile.aboutMe ?? '',
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    gender: profile.gender ?? '',
    birthDate: profile.birthDate ?? '',
    profilePicture: profile.profilePicture ?? '',
    pictures: profile.pictures ?? [],
    interests: profile.interests ?? [],
    isVisible: profile.isVisible ?? true,
    isBanned: profile.isBanned ?? false,
  });

const getPublicProfileSignature = (profile: Record<string, unknown>) =>
  JSON.stringify({
    firstName: profile.firstName ?? '',
    birthDate: profile.birthDate ?? '',
    age: profile.age ?? null,
    gender: profile.gender ?? '',
    aboutMe: profile.aboutMe ?? '',
    lookingForType: profile.lookingForType ?? '',
    lookingForGender: profile.lookingForGender ?? '',
    lookingForAge: profile.lookingForAge ?? null,
    job: profile.job ?? '',
    heightCm: profile.heightCm ?? null,
    currStudy: profile.currStudy ?? '',
    highestSchool: profile.highestSchool ?? '',
    freeTimeAct: profile.freeTimeAct ?? [],
    interests: profile.interests ?? [],
    zodiacSign: profile.zodiacSign ?? '',
    familyPlans: profile.familyPlans ?? '',
    communicationStyle: profile.communicationStyle ?? '',
    loveStyle: profile.loveStyle ?? '',
    pets: profile.pets ?? '',
    drinking: profile.drinking ?? '',
    smoking: profile.smoking ?? '',
    workout: profile.workout ?? '',
    socialMedia: profile.socialMedia ?? '',
    anthemTitle: profile.anthemTitle ?? '',
    anthemArtist: profile.anthemArtist ?? '',
    anthemAlbum: profile.anthemAlbum ?? '',
    anthemImageUrl: profile.anthemImageUrl ?? '',
    anthemUrl: profile.anthemUrl ?? '',
    currentPlace: profile.currentPlace ?? '',
    profilePicture: profile.profilePicture ?? '',
    pictures: profile.pictures ?? [],
    isVisible: profile.isVisible ?? true,
    isBanned: profile.isBanned ?? false,
    distanceVisibility: profile.distanceVisibility ?? true,
    showOnlineStatus: profile.showOnlineStatus ?? true,
    profileVerified: profile.profileVerified ?? false,
    profileVerificationStatus: profile.profileVerificationStatus ?? 'none',
  });

app.post('/revenueCatWebhook', async (req: express.Request, res: express.Response) => {
  if (!isRevenueCatWebhookAuthorized(req)) {
    res.sendStatus(403);
    return;
  }

  const event = getRevenueCatWebhookEvent(req.body);

  if (!event) {
    res.sendStatus(400);
    return;
  }

  try {
    const current = await applyRevenueCatBillingEvent(event);

    res.json({
      message: 'OK',
      current,
    });
  } catch (error) {
    console.error('RevenueCat webhook feldolgozasi hiba:', error);
    res.sendStatus(500);
  }
});

app.post('/discoverCandidates', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid, startAfter } = req.body;
  const myUid = getRequestedActionUid(req, uid);
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
    const hasPremiumAccess = await getPremiumDiscoveryAccess(db, myUid);
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
        : DEFAULT_LOCATION_FALLBACK_FEED_MODE;
    const matchParts = normalizeMatchParts(profile.matchParts);
    const excludedUids = new Set([
      myUid,
      ...matchParts.matches,
      ...matchParts.liked,
      ...matchParts.notLiked,
      ...normalizeUidList(profile.blockedUsers),
      ...normalizeUidList(profile.reportedUsers),
    ]);
    const lookingForGender =
      typeof profile.lookingForGender === 'string'
        ? profile.lookingForGender
        : '';
    const profileGender =
      typeof profile.gender === 'string' ? profile.gender : '';
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

      if (profileGender) {
        queryRef = queryRef.where('lookingForGender', '==', profileGender);
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
          console.warn('Ranked discovery query failed. Falling back to legacy cursor.', error);
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
        [],
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
        const sharedInterestCount = getSharedInterestCount(profile, candidate.claims);
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
});

app.post('/likedByProfiles', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.body;
  const myUid = getRequestedActionUid(req, uid);
  const resultLimit = Math.min(Math.max(Number(req.body.limit ?? 12), 1), 24);

  if (!myUid) {
    res.sendStatus(403);
    return;
  }

  try {
    const db = admin.firestore();
    const usersCollection = db.collection('users');
    const [myProfileSnapshot, likedSnapshot, superLikedSnapshot] = await Promise.all([
      usersCollection.doc(myUid).get(),
      usersCollection
        .where('matchParts.liked', 'array-contains', myUid)
        .limit(resultLimit)
        .get(),
      usersCollection
        .where('matchParts.superLiked', 'array-contains', myUid)
        .limit(resultLimit)
        .get(),
    ]);

    if (!myProfileSnapshot.exists) {
      res.sendStatus(404);
      return;
    }

    const myProfile = myProfileSnapshot.data() ?? {};
    const excludedUids = new Set([
      myUid,
      ...normalizeUidList(myProfile.blockedUsers),
      ...normalizeUidList(myProfile.reportedUsers),
    ]);
    const likedByProfiles = new Map<string, Record<string, unknown>>();

    [...likedSnapshot.docs, ...superLikedSnapshot.docs].forEach((snapshot) => {
      likedByProfiles.set(snapshot.id, snapshot.data() as Record<string, unknown>);
    });

    const likedByUids = Array.from(likedByProfiles.entries())
      .filter(([likedByUid, likedByProfile]) => {
        if (excludedUids.has(likedByUid)) {
          return false;
        }

        if (
          likedByProfile.isBanned === true ||
          likedByProfile.isVisible === false
        ) {
          return false;
        }

        return !normalizeUidList(likedByProfile.blockedUsers).includes(myUid);
      })
      .map(([likedByUid]) => likedByUid)
      .slice(0, resultLimit);
    const publicProfileSnapshots = await Promise.all(
      likedByUids.map((likedByUid) =>
        db.collection('publicProfiles').doc(likedByUid).get()
      )
    );
    const profiles = publicProfileSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => ({
        uid: snapshot.id,
        ...snapshot.data(),
      }));

    res.json({
      profiles,
    });
  } catch (error) {
    console.error('Liked-by profile lookup failed:', error);
    res.sendStatus(500);
  }
});

app.post('/syncProfileIndex', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.body;
  const myUid = getRequestedActionUid(req, uid);

  if (!myUid) {
    res.sendStatus(403);
    return;
  }

  try {
    const db = admin.firestore();
    const [profileSnapshot, authUser] = await Promise.all([
      db.collection('users').doc(myUid).get(),
      admin.auth().getUser(myUid).catch(() => null),
    ]);

    if (!profileSnapshot.exists) {
      res.sendStatus(404);
      return;
    }

    const profile = {
      ...(profileSnapshot.data() ?? {}),
      createdAt:
        profileSnapshot.data()?.createdAt ??
        profileSnapshot.createTime?.toDate().toISOString() ??
        new Date().toISOString(),
      emailVerified: authUser?.emailVerified === true,
    };
    const { indexEntry, publicProfile } = await syncProfileSearchDocuments(
      db,
      myUid,
      profile
    );
    await evaluateAndFlagProfileRisk(db, myUid, profile, 'profile_index_sync');

    res.json({
      message: 'OK',
      index: indexEntry,
      publicProfile,
    });
  } catch (error) {
    console.error('Profile index sync failed:', error);
    res.sendStatus(500);
  }
});

app.post('/setCustomClaims', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.body;

  if (!uid || !canAccessUser(req, uid)) {
    res.sendStatus(403);
    return;
  }

  try {
    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = userRecord.customClaims ?? {};
    const preservedAccessClaims = sanitizeUserClaims(existingClaims);

    await admin.auth().setCustomUserClaims(uid, {
      ...preservedAccessClaims,
    });

    res.json({ message: 'OK' });
  } catch (error) {
    console.error('Hiba történt a felhasználó claimsek beállításakor:', error);
    res.sendStatus(500);
  }
});

app.post('/setUserProfile', verifyToken, (req: AuthenticatedRequest, res: express.Response) => {
  const { uid, displayName, profilePicture, phoneNumber, email } = req.body;

  if (!uid || !canAccessUser(req, uid)) {
    res.sendStatus(403);
    return;
  }

  admin
    .auth()
    .updateUser(uid, {
      displayName: displayName,
      photoURL: profilePicture,
      phoneNumber: phoneNumber,
      email: email,
    })
    .then(() => {
      res.json({ message: 'Sikeres profil módosítás!', uid: uid });
    })
    .catch((error: unknown) => {
      console.error('Hiba tortent a profil modositasakor:', error);
      res.sendStatus(500);
    });
});

app.post('/requestProfileVerification', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.body;
  const myUid = getRequestedActionUid(req, uid);
  const selfiePhotoPath =
    typeof req.body.selfiePhotoPath === 'string'
      ? req.body.selfiePhotoPath.trim()
      : '';
  const selfiePhotoUrl =
    typeof req.body.selfiePhotoUrl === 'string'
      ? req.body.selfiePhotoUrl.trim()
      : '';

  if (!myUid || !selfiePhotoPath || !selfiePhotoUrl) {
    res.sendStatus(400);
    return;
  }

  if (!selfiePhotoPath.startsWith(`${PROFILE_VERIFICATION_SELFIE_PREFIX}/${myUid}/`)) {
    res.sendStatus(403);
    return;
  }

  try {
    const db = admin.firestore();
    const profileRef = db.collection('users').doc(myUid);
    const profileSnapshot = await profileRef.get();

    if (!profileSnapshot.exists) {
      res.sendStatus(404);
      return;
    }

    const profile = profileSnapshot.data() ?? {};

    if (isProfileVerified(profile)) {
      res.json({
        message: 'OK',
        status: 'approved',
      });
      return;
    }

    const [selfieExists] = await admin.storage().bucket().file(selfiePhotoPath).exists();

    if (!selfieExists) {
      res.status(400).json({ message: 'selfie_not_found' });
      return;
    }

    const verificationRef = db.collection('profileVerifications').doc(myUid);
    const payload = {
      uid: myUid,
      status: 'pending',
      displayName: getProfileDisplayName(profile, myUid),
      profilePhotoUrl: getProfilePhotoUrl(profile),
      selfiePhotoPath,
      selfiePhotoUrl,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      requesterUid: myUid,
      previousStatus: normalizeProfileVerificationStatus(
        profile.profileVerificationStatus
      ),
    };

    await Promise.all([
      verificationRef.set(payload, { merge: true }),
      profileRef.set(
        {
          profileVerificationStatus: 'pending',
          profileVerificationRequestedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      db.collection('matchIndex').doc(myUid).set(
        {
          profileVerificationStatus: 'pending',
          profileVerified: false,
        },
        { merge: true }
      ),
    ]);

    res.json({
      message: 'OK',
      status: 'pending',
    });
  } catch (error) {
    console.error('Profile verification request failed:', error);
    res.sendStatus(500);
  }
});

app.post('/reviewProfileVerification', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  if (!isPrivilegedUser(req)) {
    res.sendStatus(403);
    return;
  }

  const uid = typeof req.body.uid === 'string' ? req.body.uid.trim() : '';
  const decision = normalizeProfileVerificationDecision(req.body.decision);
  const note = typeof req.body.note === 'string' ? req.body.note.trim().slice(0, 1000) : '';

  if (!uid || !decision) {
    res.sendStatus(400);
    return;
  }

  try {
    const db = admin.firestore();
    const verificationRef = db.collection('profileVerifications').doc(uid);
    const profileRef = db.collection('users').doc(uid);
    const indexRef = db.collection('matchIndex').doc(uid);
    const approved = decision === 'approved';

    await db.runTransaction(async (transaction) => {
      const [verificationSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(verificationRef),
        transaction.get(profileRef),
      ]);

      if (!verificationSnapshot.exists || !profileSnapshot.exists) {
        throw new Error('verification_not_found');
      }

      transaction.set(
        verificationRef,
        {
          status: decision,
          reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
          reviewedBy: req.user?.uid ?? '',
          reviewerEmail: req.user?.email ?? '',
          reviewNote: note,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      transaction.set(
        profileRef,
        {
          profileVerified: approved,
          profileVerificationStatus: decision,
          profileVerificationReviewedAt:
            admin.firestore.FieldValue.serverTimestamp(),
          profileVerificationReviewedBy: req.user?.uid ?? '',
          ...(approved
            ? {
                profileVerifiedAt:
                  admin.firestore.FieldValue.serverTimestamp(),
                profileVerifiedBy: req.user?.uid ?? '',
              }
            : {}),
        },
        { merge: true }
      );

      transaction.set(
        indexRef,
        {
          profileVerified: approved,
          profileVerificationStatus: decision,
          lastModeratedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    await writeSystemModerationAudit(db, {
      action: approved ? 'profile_verification_approved' : 'profile_verification_rejected',
      targetUid: uid,
      details: note,
    });

    res.json({
      message: 'OK',
      status: decision,
      profileVerified: approved,
    });
  } catch (error) {
    console.error('Profile verification review failed:', error);

    if ((error as Error).message === 'verification_not_found') {
      res.sendStatus(404);
      return;
    }

    res.sendStatus(500);
  }
});

app.post('/deleteAccount', verifyToken, handleDeleteAccountRequest);

app.post('/deleteUser', verifyToken, handleDeleteAccountRequest);

app.post('/likeUser', verifyToken, createMatchActionHandler('like'));

app.post('/passUser', verifyToken, createMatchActionHandler('pass'));

app.post('/superLikeUser', verifyToken, createMatchActionHandler('superLike'));

app.post('/rewind', verifyToken, createMatchActionHandler('rewind'));

app.post('/removeMatch', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid, otherUid } = req.body;
  const myUid = getRequestedActionUid(req, uid);

  if (!myUid || typeof otherUid !== 'string' || !otherUid || myUid === otherUid) {
    res.sendStatus(403);
    return;
  }

  try {
    const result = await runMatchActionTransaction(myUid, otherUid, 'remove');

    res.json({ message: 'OK', ...result });
  } catch (error) {
    console.error('Hiba tÃ¶rtÃ©nt a match eltÃ¡volÃ­tÃ¡sakor:', error);
    res.sendStatus(500);
  }
});

app.post('/activateProfileBoost', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.body;
  const myUid = getRequestedActionUid(req, uid);

  if (!myUid) {
    res.sendStatus(403);
    return;
  }

  try {
    const db = admin.firestore();
    const result = await db.runTransaction(async (transaction) => {
      const billingRef = db.doc(`users/${myUid}/billing/current`);
      const matchIndexRef = db.doc(`matchIndex/${myUid}`);
      const billingSnapshot = await transaction.get(billingRef);
      const billing = normalizeBillingCurrent(billingSnapshot.data());
      const profileBoosts = Number(billing.consumables.profileBoosts ?? 0);

      if (!Number.isFinite(profileBoosts) || profileBoosts <= 0) {
        throw new Error('profile_boost_unavailable');
      }

      const boostedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      transaction.set(
        billingRef,
        {
          consumables: {
            ...billing.consumables,
            profileBoosts: profileBoosts - 1,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      transaction.set(
        matchIndexRef,
        {
          boostedUntil,
          lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        boostedUntil,
        profileBoostsBalance: profileBoosts - 1,
      };
    });

    res.json({
      message: 'OK',
      ...result,
    });
  } catch (error) {
    console.error('Hiba tortent a profil boost aktivalasakor:', error);

    if ((error as Error).message === 'profile_boost_unavailable') {
      res.sendStatus(402);
      return;
    }

    res.sendStatus(500);
  }
});

app.post('/createMutualMatch', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid, otherUid } = req.body;
  const myUid = getRequestedActionUid(req, uid);

  if (!myUid || typeof otherUid !== 'string' || !otherUid || myUid === otherUid) {
    res.sendStatus(403);
    return;
  }

  try {
    const db = admin.firestore();
    const result = await db.runTransaction(async (transaction) => {
      const myProfileRef = db.collection('users').doc(myUid);
      const otherProfileRef = db.collection('users').doc(otherUid);
      const [myProfileSnapshot, otherProfileSnapshot] = await Promise.all([
        transaction.get(myProfileRef),
        transaction.get(otherProfileRef),
      ]);

      if (!myProfileSnapshot.exists || !otherProfileSnapshot.exists) {
        throw new Error('profile_not_found');
      }

      const myProfile = myProfileSnapshot.data() ?? {};
      const otherProfile = otherProfileSnapshot.data() ?? {};
      const myMatchParts = normalizeMatchParts(myProfile.matchParts);
      const otherMatchParts = normalizeMatchParts(otherProfile.matchParts);
      const alreadyMatched =
        myMatchParts.matches.includes(otherUid) ||
        otherMatchParts.matches.includes(myUid);

      if (alreadyMatched) {
        return {
          matched: true,
          created: false,
          matchParts: myMatchParts,
        };
      }

      const myLikesOther =
        myMatchParts.liked.includes(otherUid) ||
        myMatchParts.superLiked.includes(otherUid);
      const otherLikesMe =
        otherMatchParts.liked.includes(myUid) ||
        otherMatchParts.superLiked.includes(myUid);

      if (!myLikesOther || !otherLikesMe) {
        return {
          matched: false,
          created: false,
          matchParts: myMatchParts,
        };
      }

      const nextMyMatchParts = buildMutualMatchParts(myMatchParts, otherUid);
      const nextOtherMatchParts = buildMutualMatchParts(otherMatchParts, myUid);

      transaction.update(myProfileRef, {
        matchParts: nextMyMatchParts,
      });
      transaction.update(otherProfileRef, {
        matchParts: nextOtherMatchParts,
      });

      return {
        matched: true,
        created: true,
        matchParts: nextMyMatchParts,
      };
    });

    if (result.created) {
      await notifyMutualMatchCreated(myUid, otherUid);
    }

    res.json({
      message: 'OK',
      ...result,
    });
  } catch (error) {
    console.error('Hiba tortent a mutual match letrehozasakor:', error);
    res.sendStatus(500);
  }
});

app.get('/users', verifyToken, (req: AuthenticatedRequest, res: express.Response) => {
  if (!isPrivilegedUser(req)) {
    res.sendStatus(403);
    return;
  }

  admin
    .auth()
    .listUsers()
    .then((userRecords) => {
      const users = userRecords.users.map((user) => ({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          claims: user.customClaims,
          profilePicture: user.photoURL,
          phoneNumber: user.phoneNumber,
        }));

      res.json(users);
    })
    .catch((error: unknown) => {
      console.error('Hiba tÃ¶rtÃ©nt a felhasznÃ¡lÃ³k lekÃ©rÃ©sekor:', error);
      res.sendStatus(500);
    });
});

app.get('/legacy-users', verifyToken, (req: AuthenticatedRequest, res: express.Response) => {
  if (!isPrivilegedUser(req)) {
    res.sendStatus(403);
    return;
  }

  admin
    .auth()
    .listUsers()
    .then((userRecords) => {
      const users = userRecords.users.map((user) => ({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        claims: user.customClaims,
        profilePicture: user.photoURL,
        phoneNumber: user.phoneNumber,
        // Egyéb felhasználói adatok ......
      }));
      res.json(users);
    })
    .catch((error: unknown) => {
      console.error('Hiba történt a felhasználók lekérésekor:', error);
      res.sendStatus(500);
    });
});

app.get('/users/:uid/claims', verifyToken, (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.params;

  if (!canAccessUser(req, uid)) {
    res.sendStatus(403);
    return;
  }

  admin
    .auth()
    .getUser(uid)
    .then((userRecord) => {
      res.json(sanitizeUserClaims(userRecord.customClaims ?? {}));
    })
    .catch((error: unknown) => {
      console.error('Hiba tÃ¶rtÃ©nt a felhasznÃ¡lÃ³ lekÃ©rdezÃ©sekor:', error);
      res.sendStatus(500);
    });
});

app.get('/legacy-users/:uid/claims', verifyToken, (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.params;

  if (!canAccessUser(req, uid)) {
    res.sendStatus(403);
    return;
  }

  admin
    .auth()
    .getUser(uid)
    .then((userRecord) => {
      res.json(userRecord.customClaims);
    })
    .catch((error: unknown) => {
      console.error('Hiba történt a felhasználó lekérdezésekor:', error);
      res.sendStatus(500);
    });
});

app.post('/sendPromotionNotification', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  if (!isPrivilegedUser(req)) {
    res.sendStatus(403);
    return;
  }

  const title =
    typeof req.body.title === 'string' && req.body.title.trim()
      ? req.body.title.trim().slice(0, 90)
      : 'Amor update';
  const body =
    typeof req.body.body === 'string' && req.body.body.trim()
      ? req.body.body.trim().slice(0, 160)
      : 'A new Amor offer is available.';
  const promotionId =
    typeof req.body.promotionId === 'string'
      ? req.body.promotionId.trim().slice(0, 80)
      : '';
  const requestedUid = typeof req.body.uid === 'string' ? req.body.uid.trim() : '';
  const db = admin.firestore();

  try {
    const targetUids = requestedUid
      ? [requestedUid]
      : (await db.collection('users').select().get()).docs.map((snapshot) => snapshot.id);

    const notificationResults = await Promise.all(
      targetUids.map((targetUid) =>
        notifyUserIfEnabled(
          targetUid,
          createNotificationPayload('promotion', req.user?.uid ?? 'amor', title, body),
          {
            title,
            body,
          },
          {
            type: 'promotion',
            actorUid: req.user?.uid ?? 'amor',
            ...(promotionId ? { promotionId } : {}),
          }
        )
      )
    );

    res.json({
      message: 'OK',
      sentCount: notificationResults.filter((wasSent) => wasSent).length,
      targetCount: targetUids.length,
    });
  } catch (error) {
    console.error('Failed to send promotion notification:', error);
    res.sendStatus(500);
  }
});

export const onConversationMessageCreated = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    const data = snapshot.data() as Record<string, unknown>;
    const senderUid = typeof data.senderUid === 'string' ? data.senderUid : '';
    const sentToUid = typeof data.sentToUid === 'string' ? data.sentToUid : '';
    const text =
      typeof data.text === 'string'
        ? data.text
        : typeof data.message === 'string'
          ? data.message
          : '';
    const messagePreview = text.trim().slice(0, 120) || 'You have a new message.';
    const conversationId = event.params.conversationId;

    if (!senderUid || !sentToUid || senderUid === sentToUid) {
      return;
    }

    await notifyUserIfEnabled(
      sentToUid,
      createNotificationPayload(
        'new_message',
        senderUid,
        'New message',
        messagePreview,
        conversationId
      ),
      {
        title: 'New message',
        body: messagePreview,
      },
      {
        type: 'new_message',
        actorUid: senderUid,
        conversationId,
      }
    );
  }
);

export const onModerationReportCreated = onDocumentCreated(
  'reports/{reportId}',
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    const reportedUid =
      typeof data?.reportedUid === 'string' ? data.reportedUid : '';

    if (!reportedUid) {
      return;
    }

    const db = admin.firestore();
    const profileSnapshot = await db.collection('users').doc(reportedUid).get();

    if (!profileSnapshot.exists) {
      return;
    }

    await evaluateAndFlagProfileRisk(
      db,
      reportedUid,
      profileSnapshot.data() ?? {},
      'report_created'
    );
  }
);

export const refreshDiscoveryRankingScores = onSchedule(
  'every 24 hours',
  async () => {
    const db = admin.firestore();
    let lastSnapshot: admin.firestore.QueryDocumentSnapshot | null = null;
    let processedCount = 0;

    for (let page = 0; page < 10; page++) {
      let queryRef: admin.firestore.Query = db
        .collection('matchIndex')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(400);

      if (lastSnapshot) {
        queryRef = queryRef.startAfter(lastSnapshot);
      }

      const snapshot = await queryRef.get();

      if (snapshot.empty) {
        break;
      }

      const batch = db.batch();

      snapshot.docs.forEach((docSnapshot) => {
        const entry = docSnapshot.data() as Record<string, unknown>;

        batch.set(
          docSnapshot.ref,
          {
            rankingScore: getIndexRankingScore(entry),
            rankingScoreUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      await batch.commit();
      processedCount += snapshot.size;
      lastSnapshot = snapshot.docs[snapshot.docs.length - 1] ?? null;

      if (snapshot.size < 400) {
        break;
      }
    }

    console.log(`Refreshed discovery ranking scores for ${processedCount} profiles.`);
  }
);

export const onUserProfileCreated = onDocumentCreated(
  'users/{uid}',
  async (event) => {
    const uid = event.params.uid;
    const data = event.data?.data() as Record<string, unknown> | undefined;

    if (!uid || !data) {
      return;
    }

    const db = admin.firestore();
    await syncProfileSearchDocuments(db, uid, data);
    await evaluateAndFlagProfileRisk(db, uid, data, 'profile_created');
  }
);

export const onUserProfileUpdatedForTrust = onDocumentUpdated(
  'users/{uid}',
  async (event) => {
    const uid = event.params.uid;
    const beforeData = event.data?.before.data() as Record<string, unknown> | undefined;
    const afterData = event.data?.after.data() as Record<string, unknown> | undefined;

    if (!uid || !beforeData || !afterData) {
      return;
    }

    const riskRelevantProfileChanged =
      getRiskRelevantProfileSignature(beforeData) !==
      getRiskRelevantProfileSignature(afterData);
    const publicProfileChanged =
      getPublicProfileSignature(beforeData) !==
      getPublicProfileSignature(afterData);

    if (!riskRelevantProfileChanged && !publicProfileChanged) {
      return;
    }

    const db = admin.firestore();
    await syncProfileSearchDocuments(db, uid, afterData);

    if (riskRelevantProfileChanged) {
      await evaluateAndFlagProfileRisk(db, uid, afterData, 'profile_updated');
    }
  }
);

export const onUserSuperLikeAdded = onDocumentUpdated(
  'users/{uid}',
  async (event) => {
    const beforeData = event.data?.before.data() as Record<string, unknown> | undefined;
    const afterData = event.data?.after.data() as Record<string, unknown> | undefined;
    const actorUid = event.params.uid;

    if (!beforeData || !afterData || !actorUid) {
      return;
    }

    const beforeSuperLiked = normalizeUidList(
      (beforeData.matchParts as Record<string, unknown> | undefined)?.superLiked
    );
    const afterSuperLiked = normalizeUidList(
      (afterData.matchParts as Record<string, unknown> | undefined)?.superLiked
    );
    const addedSuperLikedUids = afterSuperLiked.filter(
      (uid) => !beforeSuperLiked.includes(uid) && uid !== actorUid
    );

    if (!addedSuperLikedUids.length) {
      return;
    }

    await Promise.all(
      addedSuperLikedUids.map(async (targetUid) => {
        const targetProfile = await getUserProfileData(targetUid);
        const targetMatchParts = normalizeMatchParts(targetProfile.matchParts);
        const willBecomeMutualMatch =
          targetMatchParts.matches.includes(actorUid) ||
          targetMatchParts.liked.includes(actorUid) ||
          targetMatchParts.superLiked.includes(actorUid);

        if (willBecomeMutualMatch) {
          return false;
        }

        return notifyUserIfEnabled(
          targetUid,
          createNotificationPayload(
            'super_like',
            actorUid,
            'New Super Like',
            'Someone sent you a Super Like on Amor.'
          ),
          {
            title: 'New Super Like',
            body: 'Someone sent you a Super Like on Amor.',
          },
          {
            type: 'super_like',
            actorUid,
          },
          targetProfile
        );
      })
    );
  }
);

export const api = onRequest({ cors: true }, app);
