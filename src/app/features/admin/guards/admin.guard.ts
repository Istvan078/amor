import { inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../../auth/store/auth.store';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.waitForAuthReady();

  const claims = await auth.currentUser?.getIdTokenResult(true);

  if (
    claims?.claims?.['admin'] === true ||
    claims?.claims?.['moderator'] === true
  ) {
    return true;
  }

  if (authStore.isLoggedIn()) {
    return router.createUrlTree(['/amor/discover']);
  }

  return router.createUrlTree(['/amor/login']);
};
