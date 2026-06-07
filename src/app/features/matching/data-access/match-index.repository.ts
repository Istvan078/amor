import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { UserClass } from '../../../shared/models/user.model';
import { AuthStore } from '../../auth/store/auth.store';
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
  boostedUntil?: unknown;
  photoUrl?: string;
};

export type DiscoverCandidatesResponse = {
  candidates: Array<{
    uid: string;
    claims: MatchIndexEntry & { uid: string };
  }>;
  nextCursor: string | null;
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
  private http = inject(HttpClient);
  private authStore = inject(AuthStore);

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

  async activateProfileBoost(uid: string, durationMinutes = 30) {
    const idToken = await this.getIdToken();

    if (!idToken) {
      throw new Error('profile_boost.errors.authRequired');
    }

    const response = await firstValueFrom(
      this.http.post<{ boostedUntil: string }>(
        `${environment.API_URL}activateProfileBoost`,
        {
          uid,
          durationMinutes,
        },
        {
          headers: new HttpHeaders().set('Authorization', idToken),
        }
      )
    );

    return new Date(response.boostedUntil);
  }

  async getProfileBoostedUntil(uid: string) {
    const snapshot = await this.runInFirebaseContext(() => {
      const indexRef = doc(this.firestore, `matchIndex/${uid}`);

      return getDoc(indexRef);
    });

    if (!snapshot.exists()) {
      return null;
    }

    return (snapshot.data() as MatchIndexEntry).boostedUntil ?? null;
  }

  async loadCandidatePage(profile: UserClass, resultLimit = 20, startAfter?: string) {
    const idToken = await this.getIdToken();

    if (!profile.uid || !idToken) {
      return {
        candidates: [],
        nextCursor: null,
      };
    }

    return firstValueFrom(
      this.http.post<DiscoverCandidatesResponse>(
        `${environment.API_URL}discoverCandidates`,
        {
          uid: profile.uid,
          limit: Math.min(Math.max(resultLimit, 1), 20),
          currentLocCoords: profile.currentLocCoords,
          ...(startAfter ? { startAfter } : {}),
        },
        {
          headers: new HttpHeaders().set('Authorization', idToken),
        }
      )
    );
  }

  async loadCandidates(profile: UserClass, resultLimit = 20, startAfter?: string) {
    const response = await this.loadCandidatePage(
      profile,
      resultLimit,
      startAfter
    );

    return response.candidates;
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }

  private async getIdToken() {
    const user = this.authStore.user();
    const rawUser = user?.raw as
      | { getIdToken?: (forceRefresh?: boolean) => Promise<string> }
      | undefined;

    if (rawUser?.getIdToken) {
      return rawUser.getIdToken();
    }

    return user?.idToken;
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
