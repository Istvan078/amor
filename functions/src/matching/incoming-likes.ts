import * as admin from 'firebase-admin';

export type IncomingLikeType = 'like' | 'superLike';

const getStringField = (
  source: Record<string, unknown>,
  key: string,
  maxLength: number
) => {
  const value = source[key];

  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
};

const getNumberField = (
  source: Record<string, unknown>,
  key: string,
  minValue: number,
  maxValue: number
) => {
  const value = Number(source[key]);

  if (!Number.isFinite(value) || value < minValue || value > maxValue) {
    return undefined;
  }

  return Math.round(value);
};

const getPreviewPictures = (profile: Record<string, unknown>) => {
  const pictures = Array.isArray(profile.pictures) ? profile.pictures : [];

  return pictures
    .map((picture) => {
      if (!picture || typeof picture !== 'object') {
        return undefined;
      }

      const pictureData = picture as Record<string, unknown>;
      const url = getStringField(pictureData, 'url', 800);

      if (!url) {
        return undefined;
      }

      const name = getStringField(pictureData, 'name', 120);

      return {
        url,
        ...(name ? { name } : {}),
      };
    })
    .filter((picture): picture is { url: string; name?: string } => !!picture)
    .slice(0, 3);
};

export const getIncomingLikeRef = (
  db: admin.firestore.Firestore,
  targetUid: string,
  actorUid: string
) => db.doc(`incomingLikes/${targetUid}/likes/${actorUid}`);

export const buildIncomingLikeActorPreview = (
  actorUid: string,
  profile: Record<string, unknown>
) => {
  const firstName = getStringField(profile, 'firstName', 80);
  const currentPlace = getStringField(profile, 'currentPlace', 160);
  const profilePicture = getStringField(profile, 'profilePicture', 800);
  const pictures = getPreviewPictures(profile);
  const age = getNumberField(profile, 'age', 18, 120);

  return {
    uid: actorUid,
    ...(firstName ? { firstName } : {}),
    ...(Number.isFinite(age) ? { age } : {}),
    ...(currentPlace ? { currentPlace } : {}),
    ...(profilePicture ? { profilePicture } : {}),
    ...(pictures.length ? { pictures } : {}),
    profileVerified: profile.profileVerified === true,
  };
};

export const upsertIncomingLike = (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  targetUid: string,
  actorUid: string,
  actorProfile: Record<string, unknown>,
  type: IncomingLikeType
) => {
  transaction.set(
    getIncomingLikeRef(db, targetUid, actorUid),
    {
      actorUid,
      type,
      seen: false,
      actorPreview: buildIncomingLikeActorPreview(actorUid, actorProfile),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
};

export const removeIncomingLike = (
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  targetUid: string,
  actorUid: string
) => {
  transaction.delete(getIncomingLikeRef(db, targetUid, actorUid));
};
