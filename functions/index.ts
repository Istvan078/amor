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

const toPublicAuthUser = (user: admin.auth.UserRecord) => ({
  uid: user.uid,
  claims: sanitizeUserClaims(user.customClaims ?? {}),
});

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

app.post('/deleteUser', verifyToken, (req: AuthenticatedRequest, res: express.Response) => {
  const { uid } = req.body;

  if (!uid || !canAccessUser(req, uid)) {
    res.sendStatus(403);
    return;
  }

  admin
    .auth()
    .deleteUser(uid)
    .then(() => res.json({ message: 'Felhasználó sikeresen törölve!' }))
    .catch((error: unknown) => {
      console.error('Hiba tortent a felhasznalo torlesekor:', error);
      res.sendStatus(500);
    });
});

app.post('/removeMatch', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid, otherUid } = req.body;
  const myUid = uid ?? req.user?.uid;

  if (!myUid || !otherUid || !canAccessUser(req, myUid)) {
    res.sendStatus(403);
    return;
  }

  try {
    const db = admin.firestore();
    const nextMyMatchParts = await db.runTransaction(async (transaction) => {
      const myProfileRef = db.collection('users').doc(myUid);
      const otherProfileRef = db.collection('users').doc(otherUid);
      const [myProfileSnapshot, otherProfileSnapshot] = await Promise.all([
        transaction.get(myProfileRef),
        transaction.get(otherProfileRef),
      ]);

      if (!myProfileSnapshot.exists) {
        throw new Error('profile_not_found');
      }

      const myMatchParts = myProfileSnapshot.data()?.matchParts ?? {};
      const otherMatchParts = otherProfileSnapshot.data()?.matchParts ?? {};
      const nextMatchParts = {
        ...myMatchParts,
        matches: withoutUid(myMatchParts.matches, otherUid),
        liked: withoutUid(myMatchParts.liked, otherUid),
        superLiked: withoutUid(myMatchParts.superLiked, otherUid),
        notLiked: withUniqueUid(myMatchParts.notLiked, otherUid),
      };

      transaction.update(myProfileRef, {
        matchParts: nextMatchParts,
      });

      if (otherProfileSnapshot.exists) {
        transaction.update(otherProfileRef, {
          'matchParts.matches': withoutUid(otherMatchParts.matches, myUid),
        });
      }

      return nextMatchParts;
    });

    res.json({ message: 'OK', matchParts: nextMyMatchParts });
  } catch (error) {
    console.error('Hiba tÃ¶rtÃ©nt a match eltÃ¡volÃ­tÃ¡sakor:', error);
    res.sendStatus(500);
  }
});

app.post('/createMutualMatch', verifyToken, async (req: AuthenticatedRequest, res: express.Response) => {
  const { uid, otherUid } = req.body;
  const myUid = uid ?? req.user?.uid;

  if (!myUid || !otherUid || !canAccessUser(req, myUid) || myUid === otherUid) {
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
      await Promise.all([
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
  admin
    .auth()
    .listUsers()
    .then((userRecords) => {
      const users = isPrivilegedUser(req)
        ? userRecords.users.map((user) => ({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          claims: user.customClaims,
          profilePicture: user.photoURL,
          phoneNumber: user.phoneNumber,
        }))
        : userRecords.users.map(toPublicAuthUser);

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
