import { inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withMethods,
  withState,
} from '@ngrx/signals';

import {
  DailyUsageAction,
  DailyUsageRepository,
  getDailyUsageDateKey,
} from '../data-access/daily-usage.repository';

type DailyUsageState = {
  uid: string | null;
  date: string;
  likesUsed: number;
  superLikesUsed: number;
  rewindsUsed: number;
  boostsUsed: number;
  loading: boolean;
  error: string | null;
};

const initialState: DailyUsageState = {
  uid: null,
  date: getDailyUsageDateKey(),
  likesUsed: 0,
  superLikesUsed: 0,
  rewindsUsed: 0,
  boostsUsed: 0,
  loading: false,
  error: null,
};

export const DailyUsageStore = signalStore(
  {
    providedIn: 'root',
  },
  withState(initialState),
  withMethods((store, repository = inject(DailyUsageRepository)) => ({
    async loadDailyUsage(uid: string, force = false) {
      const date = getDailyUsageDateKey();

      if (!force && store.uid() === uid && store.date() === date) {
        return;
      }

      patchState(store, {
        uid,
        date,
        loading: true,
        error: null,
      });

      try {
        const usage = await repository.getDailyUsage(uid, date);

        patchState(store, {
          uid,
          date,
          likesUsed: usage.likesUsed,
          superLikesUsed: usage.superLikesUsed,
          rewindsUsed: usage.rewindsUsed,
          boostsUsed: usage.boostsUsed,
          loading: false,
        });
      } catch (error) {
        console.error(error);

        patchState(store, {
          loading: false,
          error: 'Failed to load daily usage.',
        });
      }
    },

    getActionCount(uid: string | undefined, action: DailyUsageAction) {
      if (!uid || store.uid() !== uid || store.date() !== getDailyUsageDateKey()) {
        return 0;
      }

      if (action === 'super-like') {
        return Number(store.superLikesUsed() ?? 0);
      }

      if (action === 'like') {
        return Number(store.likesUsed() ?? 0);
      }

      if (action === 'boost') {
        return Number(store.boostsUsed() ?? 0);
      }

      return Number(store.rewindsUsed() ?? 0);
    },

    clearDailyUsage() {
      patchState(store, {
        ...initialState,
        date: getDailyUsageDateKey(),
      });
    },
  }))
);
