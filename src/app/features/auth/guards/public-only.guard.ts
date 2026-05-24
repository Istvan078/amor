import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { AuthStore } from '../store/auth.store';
import { ProfileStore } from '../../profile/store/profile.store';

export const publicOnlyGuard: CanMatchFn = async () => {
  const authStore = inject(AuthStore);
  const profileStore = inject(ProfileStore);
  const router = inject(Router);


  await authStore.waitForAuthReady();
  await profileStore.loadProfile(authStore.uid() ?? '');

  if (profileStore.hasProfile()) {
    return router.createUrlTree(['/amor/discover']);
  }

  return true;
};