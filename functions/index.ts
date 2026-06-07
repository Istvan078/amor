import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as express from 'express';
import * as bodyParser from 'body-parser';

admin.initializeApp();

type AuthenticatedRequest = express.Request & {
  user?: admin.auth.DecodedIdToken;
};

type ServerMatchParts = {
  matches: string[];
  possMatches: string[];
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

  if (typeof claims?.gender === 'string') {
    safeClaims.gender = claims.gender;
  }

  if (typeof claims?.lookingForGender === 'string') {
    safeClaims.lookingForGender = claims.lookingForGender;
  }

  if (typeof claims?.lookingForDistance === 'number') {
    safeClaims.lookingForDistance = claims.lookingForDistance;
  }

  if (typeof claims?.currentPlace === 'string') {
    safeClaims.currentPlace = claims.currentPlace;
  }

  if (
    claims?.currentLocCoords &&
    typeof claims.currentLocCoords.lat === 'number' &&
    typeof claims.currentLocCoords.lon === 'number'
  ) {
    safeClaims.currentLocCoords = {
      lat: claims.currentLocCoords.lat,
      lon: claims.currentLocCoords.lon,
    };
  }

  if (
    claims?.lookingForAge &&
    typeof claims.lookingForAge.lower === 'number' &&
    typeof claims.lookingForAge.upper === 'number'
  ) {
    safeClaims.lookingForAge = {
      lower: claims.lookingForAge.lower,
      upper: claims.lookingForAge.upper,
    };
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
    possMatches: normalizeUidList(matchParts.possMatches),
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
  possMatches: withoutUid(matchParts.possMatches, otherUid),
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

const createApproximateGeoHash = (coords: unknown) => {
  const location =
    coords && typeof coords === 'object'
      ? (coords as Record<string, unknown>)
      : {};
  const lat = Number(location.lat);
  const lon = Number(location.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }

  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
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

const buildMatchIndexEntry = (
  uid: string,
  profile: Record<string, unknown>
) => {
  const profileCompleteness = getProfileCompleteness(profile);
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
    currentPlace: profile.currentPlace,
    isVisible,
    isBanned,
    profileCompleted,
    profileCompleteness,
    hasPhoto,
    lastActiveAt: admin.firestore.FieldValue.serverTimestamp(),
    photoUrl: getProfilePhotoUrl(profile),
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

const buildLikeMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string,
  isSuperLike = false
): ServerMatchParts => ({
  ...matchParts,
  possMatches: withoutUid(matchParts.possMatches, otherUid),
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
  possMatches: withoutUid(matchParts.possMatches, otherUid),
  liked: withoutUid(matchParts.liked, otherUid),
  notLiked: withUniqueUid(matchParts.notLiked, otherUid),
  superLiked: withoutUid(matchParts.superLiked, otherUid),
});

const buildRewindMatchParts = (
  matchParts: ServerMatchParts,
  otherUid: string
): ServerMatchParts => {
  const nextMatchParts: ServerMatchParts = {
    ...matchParts,
    notLiked: withoutUid(matchParts.notLiked, otherUid),
  };

  const shouldRestorePossibleMatch =
    !nextMatchParts.matches.includes(otherUid) &&
    !nextMatchParts.liked.includes(otherUid) &&
    !nextMatchParts.superLiked.includes(otherUid);

  return {
    ...nextMatchParts,
    possMatches: shouldRestorePossibleMatch
      ? withUniqueUid(nextMatchParts.possMatches, otherUid)
      : nextMatchParts.possMatches,
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

  const [
    retentionResult,
    userReferencesCleaned,
    conversationsDeleted,
    storageFilesDeleted,
  ] = await Promise.all([
    markAccountDeletionRetention(db, uid),
    cleanupUserReferences(db, uid),
    deleteUserConversations(db, uid),
    deleteStoragePrefix(`pictures/${uid}/`),
  ]);

  const [userDocumentDeleted, matchIndexSnapshot] = await Promise.all([
    deleteDocumentTree(db, userRef),
    matchIndexRef.get(),
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
    storageFilesDeleted,
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

const toTimestampMillis = (value: unknown) => {
  if (!value) {
    return 0;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);

    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  if (typeof value === 'object') {
    const maybeTimestamp = value as {
      toMillis?: () => number;
      toDate?: () => Date;
    };

    if (typeof maybeTimestamp.toMillis === 'function') {
      return maybeTimestamp.toMillis();
    }

    if (typeof maybeTimestamp.toDate === 'function') {
      return maybeTimestamp.toDate().getTime();
    }
  }

  return 0;
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

const isWithinDistanceKm = (
  origin: unknown,
  candidate: unknown,
  maxDistanceKm: number
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
    !Number.isFinite(candidateLon) ||
    !Number.isFinite(maxDistanceKm)
  ) {
    return true;
  }

  return getDistanceKm(originLat, originLon, candidateLat, candidateLon) <= maxDistanceKm;
};

const isBoostedIndexEntry = (entry: Record<string, unknown>) =>
  toTimestampMillis(entry.boostedUntil) > Date.now();

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
  const cursor = typeof startAfter === 'string' && startAfter ? startAfter : '';

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
    const requestCoords =
      req.body.currentLocCoords && typeof req.body.currentLocCoords === 'object'
        ? (req.body.currentLocCoords as Record<string, unknown>)
        : {};
    const currentLocCoords =
      typeof requestCoords.lat === 'number' &&
      typeof requestCoords.lon === 'number'
        ? {
          lat: requestCoords.lat,
          lon: requestCoords.lon,
        }
        : profile.currentLocCoords;
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
    const preferredAge =
      profile.lookingForAge && typeof profile.lookingForAge === 'object'
        ? (profile.lookingForAge as Record<string, unknown>)
        : {};
    const lowerAge = Number(preferredAge.lower ?? 18);
    const upperAge = Number(preferredAge.upper ?? 100);
    const maxDistanceKm = Number(profile.lookingForDistance ?? 50);
    const scanLimit = Math.min(resultLimit * 5, 100);
    let queryRef: admin.firestore.Query = db
      .collection('matchIndex')
      .where('isVisible', '==', true)
      .where('isBanned', '==', false)
      .where('profileCompleted', '==', true)
      .where('hasPhoto', '==', true);

    if (lookingForGender) {
      queryRef = queryRef.where('gender', '==', lookingForGender);
    }

    if (profileGender) {
      queryRef = queryRef.where('lookingForGender', '==', profileGender);
    }

    queryRef = queryRef
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(scanLimit);

    if (cursor) {
      queryRef = queryRef.startAfter(cursor);
    }

    const snapshot = await queryRef.get();
    const scannedCandidates: Array<{
      uid: string;
      claims: Record<string, unknown>;
    }> = snapshot.docs.map((candidateSnapshot) => {
      const claims = candidateSnapshot.data() as Record<string, unknown>;

      return {
        uid: candidateSnapshot.id,
        claims: {
          ...claims,
          uid: candidateSnapshot.id,
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
      .filter((candidate) =>
        isWithinDistanceKm(
          currentLocCoords,
          candidate.claims['currentLocCoords'],
          maxDistanceKm
        )
      )
      .sort(
        (candidateA, candidateB) =>
          Number(isBoostedIndexEntry(candidateB.claims)) -
            Number(isBoostedIndexEntry(candidateA.claims)) ||
          toTimestampMillis(candidateB.claims['lastActiveAt']) -
            toTimestampMillis(candidateA.claims['lastActiveAt'])
      )
      .slice(0, resultLimit);
    const nextCursor =
      snapshot.docs.length === scanLimit
        ? snapshot.docs[snapshot.docs.length - 1]?.id ?? null
        : null;

    res.json({
      candidates,
      nextCursor,
    });
  } catch (error) {
    console.error('Discovery candidate lookup failed:', error);
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
    const profileSnapshot = await db.collection('users').doc(myUid).get();

    if (!profileSnapshot.exists) {
      res.sendStatus(404);
      return;
    }

    const profile = profileSnapshot.data() ?? {};
    const indexEntry = buildMatchIndexEntry(myUid, profile);

    await db.collection('matchIndex').doc(myUid).set(indexEntry, { merge: true });

    res.json({
      message: 'OK',
      index: indexEntry,
    });
  } catch (error) {
    console.error('Profile index sync failed:', error);
    res.sendStatus(500);
  }
});

app.post('/setCustomClaims', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid, claims } = req.body;

  if (!uid || !canAccessUser(req, uid)) {
    res.sendStatus(403);
    return;
  }

  try {
    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = userRecord.customClaims ?? {};
    const safeProfileClaims = sanitizeUserClaims(claims);

    const preservedRoleClaims: Record<string, unknown> = {};

    if (existingClaims.admin === true) {
      preservedRoleClaims.admin = true;
    }

    if (existingClaims.moderator === true) {
      preservedRoleClaims.moderator = true;
    }

    await admin.auth().setCustomUserClaims(uid, {
      ...safeProfileClaims,
      ...preservedRoleClaims,
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
