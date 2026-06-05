import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  collection,
  getDocs,
  limit,
  query,
  where,
} from '@angular/fire/firestore';

import { UserClass } from '../../../shared/models/user.model';

@Injectable({
  providedIn: 'root',
})
export class LikedByRepository {
  private injector = inject(Injector);
  private firestore = inject(Firestore);

  async getProfilesWhoLikedUser(uid: string, resultLimit = 12) {
    const snapshots = await this.runInFirebaseContext(async () => {
      const usersCollection = collection(this.firestore, 'users');

      return Promise.all([
        getDocs(
          query(
            usersCollection,
            where('matchParts.liked', 'array-contains', uid),
            limit(resultLimit)
          )
        ),
        getDocs(
          query(
            usersCollection,
            where('matchParts.superLiked', 'array-contains', uid),
            limit(resultLimit)
          )
        ),
      ]);
    });

    const profilesByUid = new Map<string, UserClass>();

    for (const snapshot of snapshots.flatMap((querySnapshot) => querySnapshot.docs)) {
      profilesByUid.set(snapshot.id, {
        uid: snapshot.id,
        ...snapshot.data(),
      } as UserClass);
    }

    return Array.from(profilesByUid.values()).slice(0, resultLimit);
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}
