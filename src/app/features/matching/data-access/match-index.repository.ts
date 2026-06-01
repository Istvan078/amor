import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  QueryConstraint,
} from '@angular/fire/firestore';

import { UserClass } from '../../../shared/models/user.model';
import {
  getProfileCompleteness,
  hasProfilePhoto,
  isProfileCompleteForDiscovery,
} from '../../profile/utils/profile-completeness';

export type MatchIndexEntry = {
  uid: string;
  gender?: string;
  lookingForGender?: string;
  age?: number;
  currentLocCoords?: {
    lat: number;
    lon: number;
  };
  currentPlace?: string;
  geohash?: string;
  isVisible: boolean;
  isBanned: boolean;
  profileCompleted: boolean;
  profileCompleteness: number;
  hasPhoto: boolean;
  lastActiveAt?: unknown;
  photoUrl?: string;
};

function profilePhotoUrl(profile: Partial<UserClass>) {
  return profile.profilePicture ?? profile.pictures?.[0]?.url ?? '';
}

function normalizeAge(profile: Partial<UserClass>) {
  const storedAge = Number(profile.age);

  if (Number.isFinite(storedAge) && storedAge > 0) {
    return storedAge;
  }

  if (!profile.birthDate) {
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
    (today.getMonth() === birthDate.getMonth() &&
      today.getDate() >= birthDate.getDate());

  if (!birthdayPassed) {
    age--;
  }

  return age;
}

function toMatchIndexEntry(profile: Partial<UserClass> & { uid: string }) {
  const profileCompleteness = getProfileCompleteness(profile);
  const profileCompleted = isProfileCompleteForDiscovery(profile);
  const hasPhoto = hasProfilePhoto(profile);
  const isBanned = profile.isBanned === true;
  const isVisible =
    profile.isVisible !== false && !isBanned && profileCompleted && hasPhoto;
  const geohash = createApproximateGeoHash(profile.currentLocCoords);

  const entry: MatchIndexEntry = {
    uid: profile.uid,
    gender: profile.gender,
    lookingForGender: profile.lookingForGender,
    age: normalizeAge(profile),
    currentLocCoords: profile.currentLocCoords,
    geohash,
    currentPlace: profile.currentPlace,
    isVisible,
    isBanned,
    profileCompleted,
    profileCompleteness,
    hasPhoto,
    lastActiveAt: serverTimestamp(),
    photoUrl: profilePhotoUrl(profile),
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
}

@Injectable({
  providedIn: 'root',
})
export class MatchIndexRepository {
  private injector = inject(Injector);
  private firestore = inject(Firestore);

  async upsertProfileIndex(profile: Partial<UserClass> & { uid: string }) {
    await this.runInFirebaseContext(() => {
      const indexRef = doc(this.firestore, `matchIndex/${profile.uid}`);

      return setDoc(indexRef, toMatchIndexEntry(profile), { merge: true });
    });
  }

  async deleteProfileIndex(uid: string) {
    await this.runInFirebaseContext(() => {
      const indexRef = doc(this.firestore, `matchIndex/${uid}`);

      return deleteDoc(indexRef);
    });
  }

  async loadCandidates(profile: UserClass, resultLimit = 80) {
    const lookingForGender = profile.lookingForGender;
    const profileGender = profile.gender;
    const preferredAge = profile.lookingForAge;
    const lowerAge = Number(preferredAge?.lower ?? 18);
    const upperAge = Number(preferredAge?.upper ?? 100);

    const snapshots = await this.runInFirebaseContext(() => {
      const indexCollection = collection(this.firestore, 'matchIndex');
      const clauses: QueryConstraint[] = [
        where('isVisible', '==', true),
        where('isBanned', '==', false),
        where('profileCompleted', '==', true),
        where('hasPhoto', '==', true),
      ];

      if (lookingForGender) {
        clauses.push(where('gender', '==', lookingForGender));
      }

      if (profileGender) {
        clauses.push(where('lookingForGender', '==', profileGender));
      }

      if (Number.isFinite(lowerAge)) {
        clauses.push(where('age', '>=', lowerAge));
      }

      if (Number.isFinite(upperAge)) {
        clauses.push(where('age', '<=', upperAge));
      }

      clauses.push(limit(resultLimit * 2));

      return getDocs(query(indexCollection, ...clauses));
    });

    const excludedUids = new Set([
      profile.uid,
      ...(profile.blockedUsers ?? []),
      ...(profile.reportedUsers ?? []),
      ...(profile.matchParts?.liked ?? []),
      ...(profile.matchParts?.notLiked ?? []),
      ...(profile.matchParts?.matches ?? []),
    ].filter((uid): uid is string => typeof uid === 'string' && !!uid));
    const maxDistanceKm = Number(profile.lookingForDistance ?? 50);

    return snapshots.docs
      .map((snapshot) => ({
        uid: snapshot.id,
        claims: {
          ...(snapshot.data() as MatchIndexEntry),
          uid: snapshot.id,
        },
      }))
      .filter((candidate) => !excludedUids.has(candidate.uid))
      .filter((candidate) =>
        isWithinDistance(
          profile.currentLocCoords,
          candidate.claims.currentLocCoords,
          maxDistanceKm
        )
      )
      .sort(
        (candidateA, candidateB) =>
          toTimestampMillis(candidateB.claims.lastActiveAt) -
          toTimestampMillis(candidateA.claims.lastActiveAt)
      )
      .slice(0, resultLimit);
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}

function createApproximateGeoHash(
  coords: Partial<UserClass>['currentLocCoords']
) {
  const lat = Number(coords?.lat);
  const lon = Number(coords?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }

  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

function isWithinDistance(
  origin: Partial<UserClass>['currentLocCoords'],
  candidate: Partial<UserClass>['currentLocCoords'],
  maxDistanceKm: number
) {
  const originLat = Number(origin?.lat);
  const originLon = Number(origin?.lon);
  const candidateLat = Number(candidate?.lat);
  const candidateLon = Number(candidate?.lon);

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
}

function getDistanceKm(
  originLat: number,
  originLon: number,
  candidateLat: number,
  candidateLon: number
) {
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
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toTimestampMillis(value: unknown) {
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
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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
}
