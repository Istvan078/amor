import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
} from '@ionic/angular/standalone';

import { BaseService } from '../../services/base.service';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: true,
  imports: [
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
  ],
})
export class TabsPage {
  private base = inject(BaseService);
  private router = inject(Router);

  openUserCard() {
    this.base.mainDataSubject.next({
      userSettings: true,
      amor: true,
      phoneView: true,
    });
  }

  showMatchesCard() {
    this.base.mainDataSubject.next({ userSettings: false });
  }

  showMessages() {
    this.base.mainDataSubject.next({
      messaging: true,
      phoneView: true,
    });
  }
}