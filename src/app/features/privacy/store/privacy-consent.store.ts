import { computed, inject } from '@angular/core';
import {
    patchState,
    signalStore,
    withComputed,
    withMethods,
    withState,
} from '@ngrx/signals';

import { PrivacyConsentRepository } from '../data-access/privacy-consent.repository';
import {
    CURRENT_PRIVACY_CONSENT_VERSION,
    PrivacyConsent,
    createInitialPrivacyConsentState,
    initialPrivacyConsent,
    isPrivacyConsentAccepted,
} from './privacy-consent.slice';

export const PrivacyConsentStore = signalStore(
    {
        providedIn: 'root',
    },
    withState(initialPrivacyConsent),
    withComputed((store) => ({
        hasRequiredConsent: computed(() =>
            isPrivacyConsentAccepted({
                termsAccepted: store.termsAccepted(),
                privacyPolicyAccepted: store.privacyPolicyAccepted(),
                ageConfirmed: store.ageConfirmed(),
                consentVersion: store.consentVersion(),
            })
        ),
    })),
    withMethods((store, repository = inject(PrivacyConsentRepository)) => ({
        async loadConsent(uid: string) {
            if (!uid) {
                patchState(store, {
                    ...createInitialPrivacyConsentState(),
                    initialized: true,
                });
                return undefined;
            }

            patchState(store, {
                loading: true,
                error: null,
            });

            try {
                const consent = await repository.getConsent(uid);

                patchState(store, {
                    ...createInitialPrivacyConsentState(),
                    ...(consent ?? {}),
                    initialized: true,
                    loading: false,
                    error: null,
                });

                return consent;
            } catch (error) {
                console.error(error);
                patchState(store, {
                    initialized: true,
                    loading: false,
                    error: 'Failed to load privacy consent.',
                });
                return undefined;
            }
        },

        async acceptConsent(
            uid: string,
            options: { marketingNotifications: boolean }
        ) {
            const consent: PrivacyConsent = {
                essential: true,
                termsAccepted: true,
                privacyPolicyAccepted: true,
                ageConfirmed: true,
                crashReports: true,
                analytics: true,
                personalisation: true,
                marketingNotifications: options.marketingNotifications,
                consentVersion: CURRENT_PRIVACY_CONSENT_VERSION,
                updatedAt: new Date().toISOString(),
            };

            patchState(store, {
                loading: true,
                error: null,
            });

            try {
                await repository.saveConsent(uid, consent);

                patchState(store, {
                    ...consent,
                    initialized: true,
                    loading: false,
                    error: null,
                });

                return consent;
            } catch (error) {
                console.error(error);
                patchState(store, {
                    loading: false,
                    error: 'Failed to save privacy consent.',
                });
                throw error;
            }
        },

        clearConsent() {
            patchState(store, createInitialPrivacyConsentState());
        },
    }))
);
