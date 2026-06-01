import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
} from '@angular/fire/firestore';

export type DailyUsageAction = 'rewind' | 'super-like' | 'boost';

export type DailyUsage = {
  date: string;
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
    superLikesUsed: 0,
    rewindsUsed: 0,
    boostsUsed: 0,
  };
}

type DailyUsageCountField = 'superLikesUsed' | 'rewindsUsed' | 'boostsUsed';

function usageFieldForAction(action: DailyUsageAction): DailyUsageCountField {
  if (action === 'super-like') {
    return 'superLikesUsed';
  }

  if (action === 'boost') {
    return 'boostsUsed';
  }

  return 'rewindsUsed';
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

  async ensureDailyUsage(uid: string, date = getDailyUsageDateKey()) {
    await this.runInFirebaseContext(() => {
      const usageRef = doc(this.firestore, `users/${uid}/usage/${date}`);

      return setDoc(
        usageRef,
        {
          ...emptyUsage(date),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  }

  async incrementDailyUsage(
    uid: string,
    action: DailyUsageAction,
    date = getDailyUsageDateKey()
  ): Promise<DailyUsage> {
    return this.runInFirebaseContext(() => {
      const usageRef = doc(this.firestore, `users/${uid}/usage/${date}`);
      const field = usageFieldForAction(action);

      return runTransaction(this.firestore, async (transaction) => {
        const snapshot = await transaction.get(usageRef);
        const current = snapshot.exists()
          ? ({
              ...emptyUsage(date),
              ...(snapshot.data() as Partial<DailyUsage>),
              date,
            } as DailyUsage)
          : emptyUsage(date);

        const nextUsage: DailyUsage = {
          ...current,
          [field]: Number(current[field] ?? 0) + 1,
          updatedAt: serverTimestamp(),
        };

        transaction.set(usageRef, nextUsage, { merge: true });

        return nextUsage;
      });
    });
  }

  private runInFirebaseContext<T>(callback: () => T): T {
    return runInInjectionContext(this.injector, callback);
  }
}
