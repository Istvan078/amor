import { Component, inject } from '@angular/core';
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular/standalone';

import { AuthStore } from '../../features/auth/store/auth.store';
import { DiscoverUiStore } from '../../features/discover/store/discover-ui.store';
import { ProfileStore } from '../../features/profile/store/profile.store';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  readonly authStore = inject(AuthStore);
  readonly profileStore = inject(ProfileStore);
  private discoverUiStore = inject(DiscoverUiStore);

  openUserCard() {
    this.discoverUiStore.setPhoneView(true);
    this.discoverUiStore.openUserCard();
  }

  showMatchesCard() {
    this.discoverUiStore.showMatchesCard();
  }

  showMessages() {
    this.discoverUiStore.setPhoneView(true);
    this.discoverUiStore.showMessages();
  }
}
