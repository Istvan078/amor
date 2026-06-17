import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonLabel,
  IonSpinner,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  logInOutline,
  shieldCheckmarkOutline,
  trashOutline,
} from 'ionicons/icons';

import { AuthStore } from '../auth/store/auth.store';
import { DiscoverStore } from '../discover/store/discover.store';
import { DiscoverUiStore } from '../discover/store/discover-ui.store';
import { ProfileStore } from '../profile/store/profile.store';
import { DailyUsageStore } from '../usage/store/daily-usage.store';

@Component({
  selector: 'app-account-deletion',
  templateUrl: './account-deletion.page.html',
  styleUrls: ['./account-deletion.page.scss'],
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TranslocoDirective,
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonLabel,
    IonSpinner,
  ],
})
export class AccountDeletionPage {
  readonly authStore = inject(AuthStore);
  private profileStore = inject(ProfileStore);
  private discoverStore = inject(DiscoverStore);
  private discoverUiStore = inject(DiscoverUiStore);
  private dailyUsageStore = inject(DailyUsageStore);

  readonly isAuthenticated = computed(() => !!this.authStore.uid());
  readonly isBusy = signal(false);
  readonly deleted = signal(false);
  readonly errorKey = signal<string | null>(null);

  credentials = {
    email: '',
    password: '',
  };

  constructor() {
    addIcons({
      arrowBackOutline,
      logInOutline,
      shieldCheckmarkOutline,
      trashOutline,
    });
  }

  async deleteAccount() {
    if (this.isBusy()) {
      return;
    }

    this.isBusy.set(true);
    this.errorKey.set(null);

    try {
      let uid = this.authStore.uid();

      if (!uid) {
        const credentials = await this.authStore.signInWithEmail(this.credentials);
        uid = credentials.user.uid;
      }

      const wasDeleted = await this.profileStore.deleteOwnProfile();

      if (!wasDeleted) {
        throw new Error('accountDeletion.errors.failed');
      }

      this.authStore.setAutoFillEmail(undefined);
      this.authStore.clearUsers();
      this.discoverStore.clearDiscoverData();
      this.discoverUiStore.reset();
      this.dailyUsageStore.clearDailyUsage();
      this.deleted.set(true);
      this.credentials = {
        email: '',
        password: '',
      };
    } catch (error) {
      console.error(error);
      this.errorKey.set('accountDeletion.error');
    } finally {
      this.isBusy.set(false);
    }
  }
}
