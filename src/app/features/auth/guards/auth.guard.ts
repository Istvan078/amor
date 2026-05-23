import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthStore } from '../store/auth.store';

export const authGuard: CanMatchFn = async () => {
    const authStore = inject(AuthStore);
    const router = inject(Router);

    await authStore.waitForAuthReady();

    if (authStore.isLoggedIn()) {
        return true;
    }

    return router.createUrlTree(['/amor/login']);
};