import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
} from '@angular/fire/firestore';

export type DailyUsageAction = 'like' | 'rewind' | 'super-like' | 'boost';

export type DailyUsage = {
  date: string;
  likesUsed: number;
  superLikesUsed: number;
  rewindsUsed: number;
  boostsUsed: number;
  updatedAt?: unknown;
};

export function getDailyUsageDateKey(date = new Date()) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

function emptyUsage(date = getDailyUsageDateKey()): DailyUsage {
  return {
    date,
    likesUsed: 0,
    superLikesUsed: 0,
    rewindsUsed: 0,
    boostsUsed: 0,
  };
}

@Injectable({
  providedIn: 'root',
})
export class DailyUsageRepository {
  private injector = inject(Injector);
  private firestore = inject(Firestore);

  async getDailyUsage(
    uid: string,
    date = getDailyUsageDateKey()
  ): Promise<DailyUsage> {
    const snapshot = await this.runInFirebaseContext(() => {
      const usageRef = doc(this.firestore, `users/${uid}/usage/${date}`);

      return getDoc(usageRef);
    });

    if (!snapshot.exists()) {
      return emptyUsage(date);
    }

    const data = snapshot.data() as Partial<DailyUsage>;

    return {
      ...emptyUsage(date),
      ...data,
      date,
    };
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}
