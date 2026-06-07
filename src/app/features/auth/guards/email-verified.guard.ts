import { inject, isDevMode } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthStore } from '../store/auth.store';

export const emailVerifiedGuard: CanMatchFn = async () => {
    const authStore = inject(AuthStore);
    const router = inject(Router);

    await authStore.waitForAuthReady();

    if (!authStore.isLoggedIn()) {
        return router.createUrlTree(['/amor/login']);
    }

    if (authStore.canModerate() || authStore.emailVerified()) {
        return true;
    }

    return router.createUrlTree(['/amor/verify-email']);
};
