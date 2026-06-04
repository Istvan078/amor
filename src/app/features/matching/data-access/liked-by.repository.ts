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
    const snapshots = await this.runInFirebaseContext(() => {
      const usersCollection = collection(this.firestore, 'users');

      return getDocs(
        query(
          usersCollection,
          where('matchParts.liked', 'array-contains', uid),
          limit(resultLimit)
        )
      );
    });

    return snapshots.docs.map((snapshot) => ({
      uid: snapshot.id,
      ...snapshot.data(),
    })) as UserClass[];
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}
