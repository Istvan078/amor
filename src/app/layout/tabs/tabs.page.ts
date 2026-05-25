import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { AuthStore } from '../../features/auth/store/auth.store';
import { DiscoverUiStore } from '../../features/discover/store/discover-ui.store';
import { ProfileStore } from '../../features/profile/store/profile.store';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: true,
  imports: [TranslocoDirective, IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  readonly authStore = inject(AuthStore);
  readonly profileStore = inject(ProfileStore);
  private router = inject(Router);
  readonly discoverUiStore = inject(DiscoverUiStore);

  openUserCard() {
    this.discoverUiStore.setPhoneView(true);
    this.discoverUiStore.openUserCard();
    void this.router.navigate(['/amor/discover']);
  }

  showMatchesCard() {
    this.discoverUiStore.setPhoneView(true);
    this.discoverUiStore.showMatchesCard();
    void this.router.navigate(['/amor/discover']);
  }

  showMessages() {
    this.discoverUiStore.setPhoneView(true);
    this.discoverUiStore.showMessages();
    void this.router.navigate(['/amor/discover']);
  }

  isDiscoverActive() {
    return (
      !this.discoverUiStore.isUserCardOpen() &&
      !this.discoverUiStore.isShowMessages()
    );
  }

  isProfileActive() {
    return this.discoverUiStore.isUserCardOpen();
  }

  isMessagesActive() {
    return this.discoverUiStore.isShowMessages();
  }

  isPrivacyActive() {
    return this.router.url.startsWith('/amor/privacy');
  }
}
