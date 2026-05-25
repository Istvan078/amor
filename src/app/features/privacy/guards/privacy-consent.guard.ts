import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthStore } from '../../auth/store/auth.store';
import { ProfileStore } from '../../profile/store/profile.store';
import { PrivacyConsentStore } from '../store/privacy-consent.store';

export const privacyConsentGuard: CanMatchFn = async () => {
    const authStore = inject(AuthStore);
    const profileStore = inject(ProfileStore);
    const privacyStore = inject(PrivacyConsentStore);
    const router = inject(Router);

    await authStore.waitForAuthReady();

    const uid = authStore.uid();

    if (!uid) {
        return router.createUrlTree(['/amor/login']);
    }

    await profileStore.loadProfile(uid);

    if (!profileStore.hasProfile()) {
        return router.createUrlTree(['/amor/register']);
    }

    await privacyStore.loadConsent(uid);

    if (!privacyStore.hasRequiredConsent()) {
        return router.createUrlTree(['/amor/privacy']);
    }

    return true;
};
