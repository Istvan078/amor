import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

import {
  BillingCurrent,
  BillingPackage,
  BillingRepository,
} from '../data-access/billing.repository';

type BillingState = {
  uid: string | null;
  initialized: boolean;
  configured: boolean;
  loading: boolean;
  purchasing: boolean;
  restoring: boolean;
  error: string | null;
  offerings: BillingPackage[];
  current: BillingCurrent | null;
  activeEntitlements: string[];
  isPremium: boolean;
};

const initialState: BillingState = {
  uid: null,
  initialized: false,
  configured: false,
  loading: false,
  purchasing: false,
  restoring: false,
  error: null,
  offerings: [],
  current: null,
  activeEntitlements: [],
  isPremium: false,
};

function patchBillingCurrent(
  store: {
    [key: string]: unknown;
  },
  current: BillingCurrent | null
) {
  patchState(store as never, {
    current,
    isPremium: !!current?.isPremium,
    activeEntitlements: current?.activeEntitlements ?? [],
  });
}

export const BillingStore = signalStore(
  {
    providedIn: 'root',
  },

  withState(initialState),

  withComputed((store) => ({
    hasOfferings: computed(() => store.offerings().length > 0),
    premiumExpiresAt: computed(() => store.current()?.expiresAt ?? null),
  })),

  withMethods((store, repository = inject(BillingRepository)) => {
    let initializedUid: string | null = null;

    return {
      async initBilling(uid: string | null | undefined) {
        if (!uid) {
          patchState(store, initialState);
          initializedUid = null;
          return;
        }

        if (store.initialized() && initializedUid === uid) {
          return;
        }

          patchState(store, {
            uid,
            loading: true,
            error: null,
        });

        try {
          const configured = await repository.configure(uid);
          const [offerings, customer] = await Promise.all([
            repository.getOfferings(),
            repository.getCustomerInfo(uid),
          ]);

          initializedUid = uid;

          patchState(store, {
            initialized: true,
            configured,
            loading: false,
            offerings,
            error: null,
          });
          patchBillingCurrent(store, customer.current);
        } catch (error) {
          console.error(error);

          patchState(store, {
            initialized: true,
            configured: false,
            loading: false,
            offerings: repository.getConfiguredPackages(),
            error: 'billing.errors.initializationFailed',
          });
        }
      },

      async loadOfferings() {
        patchState(store, {
          loading: true,
          error: null,
        });

        try {
          const offerings = await repository.getOfferings();

          patchState(store, {
            offerings,
            loading: false,
          });
        } catch (error) {
          console.error(error);

          patchState(store, {
            loading: false,
            error: 'billing.errors.offeringsFailed',
          });
        }
      },

      async purchasePackage(packageId: string) {
        const uid = store.uid();

        if (!uid) {
          patchState(store, {
            error: 'billing.errors.signInRequired',
          });
          return false;
        }

        patchState(store, {
          purchasing: true,
          error: null,
        });

        try {
          const result = await repository.purchasePackage(uid, packageId);

          patchState(store, {
            purchasing: false,
            error: null,
          });
          patchBillingCurrent(store, result.current);

          return true;
        } catch (error) {
          console.error(error);

          patchState(store, {
            purchasing: false,
            error: repository.isPurchaseCancelled(error)
              ? null
              : 'billing.errors.purchaseFailed',
          });

          return false;
        }
      },

      async restorePurchases() {
        const uid = store.uid();

        if (!uid) {
          patchState(store, {
            error: 'billing.errors.restoreSignInRequired',
          });
          return false;
        }

        patchState(store, {
          restoring: true,
          error: null,
        });

        try {
          const result = await repository.restorePurchases(uid);

          patchState(store, {
            restoring: false,
            error: null,
          });
          patchBillingCurrent(store, result.current);

          return true;
        } catch (error) {
          console.error(error);

          patchState(store, {
            restoring: false,
            error: 'billing.errors.restoreFailed',
          });

          return false;
        }
      },

      async refreshCustomerInfo(uid: string | null | undefined) {
        if (!uid) {
          patchBillingCurrent(store, null);
          return;
        }

        try {
          const result = await repository.getCustomerInfo(uid);
          patchBillingCurrent(store, result.current);
        } catch (error) {
          console.error(error);
        }
      },

      hasEntitlement(entitlementId: string) {
        return store.activeEntitlements().includes(entitlementId);
      },

      resetBilling() {
        initializedUid = null;
        patchState(store, initialState);
      },
    };
  })
);
