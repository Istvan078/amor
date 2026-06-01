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
} from '@angular/fire/firestore';

import { UserClass } from '../../../shared/models/user.model';

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
  isVisible: boolean;
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
  const entry: MatchIndexEntry = {
    uid: profile.uid,
    gender: profile.gender,
    lookingForGender: profile.lookingForGender,
    age: normalizeAge(profile),
    currentLocCoords: profile.currentLocCoords,
    currentPlace: profile.currentPlace,
    isVisible: true,
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

    const snapshots = await this.runInFirebaseContext(() => {
      const indexCollection = collection(this.firestore, 'matchIndex');
      const clauses = [where('isVisible', '==', true), limit(resultLimit)];

      if (lookingForGender) {
        clauses.unshift(where('gender', '==', lookingForGender));
      }

      return getDocs(query(indexCollection, ...clauses));
    });

    return snapshots.docs
      .map((snapshot) => ({
        uid: snapshot.id,
        claims: {
          ...(snapshot.data() as MatchIndexEntry),
          uid: snapshot.id,
        },
      }))
      .filter((candidate) => candidate.uid !== profile.uid);
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}
