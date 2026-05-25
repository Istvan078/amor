import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthStore } from '../store/auth.store';
import { ProfileStore } from '../../profile/store/profile.store';

export const authGuard: CanMatchFn = async () => {
    const authStore = inject(AuthStore);
    const profileStore = inject(ProfileStore);
    const router = inject(Router);

    await authStore.waitForAuthReady();

    const uid = authStore.uid();

    if (uid) {
        await profileStore.loadProfile(uid);
    }

    if (profileStore.hasProfile()) {
        return true;
    }

    if (authStore.isLoggedIn()) {
        return router.createUrlTree(['/amor/register']);
    }

    return router.createUrlTree(['/amor/login']);
};
