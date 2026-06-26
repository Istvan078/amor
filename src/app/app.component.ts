import { Component, effect, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { IonApp, IonIcon, IonRouterOutlet } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import { calendarClearOutline, checkmarkOutline, chevronDownOutline, chevronForwardOutline, heartOutline, locationOutline, lockClosedOutline, notificationsOutline, sparklesOutline, syncOutline } from 'ionicons/icons';

import { UpdateService } from './core/update/update.service';
import { AuthStore } from './features/auth/store/auth.store';
import { BillingStore } from './features/billing/store/billing.store';
import { LanguageSwitcherComponent } from './shared/ui/language-switcher/language-switcher.component';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { NotificationsStore } from './features/notifications/store/notifications.store';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [LanguageSwitcherComponent, IonApp, IonIcon, IonRouterOutlet, RouterLink],
})
export class AppComponent implements OnInit {
  readonly authStore = inject(AuthStore);
  private updateService = inject(UpdateService);
  private swUpdate = inject(SwUpdate);
  private transloco = inject(TranslocoService);
  private billingStore = inject(BillingStore);
  readonly notificationsStore = inject(NotificationsStore);

  constructor() {
    addIcons({
      calendarClearOutline,
      chevronDownOutline,
      chevronForwardOutline,
      lockClosedOutline,
      notificationsOutline,
      sparklesOutline,
      locationOutline,
      syncOutline,
      heartOutline,
      checkmarkOutline
    });

    effect(() => {
      const uid = this.authStore.uid();

      queueMicrotask(() => {
        if (uid) {
          void this.billingStore.initBilling(uid);
          this.notificationsStore.start(uid);
          if (Capacitor.isNativePlatform())
            void this.notificationsStore.init(uid);
          return;
        }

        this.billingStore.resetBilling();
        this.notificationsStore.reset();
      });
    });
  }

  async ngOnInit() {
    await this.setupNativeStatusBar();
    this.setInitialLanguage();
    this.authStore.startAuthListener();

    if (this.swUpdate.isEnabled) {
      this.updateService.checkForUpdate();
    }
  }

  private async setupNativeStatusBar() {
    // if the app is not running on android or ios, we don't need to do anything
    if (!Capacitor.isNativePlatform()) return;
    try {
      await StatusBar.hide();
    }
    catch (error) {
      console.warn('Failed to set up native status bar', error);
    }
  }

  private setInitialLanguage() {
    try {
      const savedLang = localStorage.getItem('amor.lang');
      this.transloco.setActiveLang(savedLang === 'hu' ? 'hu' : 'en');
    } catch {
      this.transloco.setActiveLang('en');
    }
  }
}
