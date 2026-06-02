import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
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
  type: 'new_match' | 'new_message',
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

const sendPushToUser = async (
  uid: string,
  notification: admin.messaging.Notification,
  data: Record<string, string>
) => {
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
      return;
    }

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification,
      data,
    });
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
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

      const myNotificationRef = myProfileRef.collection('notifications').doc();
      const otherNotificationRef = otherProfileRef.collection('notifications').doc();

      transaction.set(
        myNotificationRef,
        createNotificationPayload(
          'new_match',
          otherUid,
          'New match',
          'You have a new match on Amor.'
        )
      );
      transaction.set(
        otherNotificationRef,
        createNotificationPayload(
          'new_match',
          myUid,
          'New match',
          'You have a new match on Amor.'
        )
      );

      return {
        matched: true,
        created: true,
        matchParts: nextMyMatchParts,
      };
    });

    if (result.created) {
      await Promise.all([
        sendPushToUser(
          myUid,
          {
            title: 'New match',
            body: 'You have a new match on Amor.',
          },
          {
            type: 'new_match',
            actorUid: otherUid,
          }
        ),
        sendPushToUser(
          otherUid,
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

    await admin
      .firestore()
      .collection(`users/${sentToUid}/notifications`)
      .add(
        createNotificationPayload(
          'new_message',
          senderUid,
          'New message',
          messagePreview,
          conversationId
        )
      );

    await sendPushToUser(
      sentToUid,
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

export const api = onRequest({ cors: true }, app);
