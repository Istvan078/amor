import { Component, effect, inject, OnInit } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';

import { UpdateService } from './core/update/update.service';
import { AuthStore } from './features/auth/store/auth.store';
import { BillingStore } from './features/billing/store/billing.store';
import { LanguageSwitcherComponent } from './shared/ui/language-switcher/language-switcher.component';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [LanguageSwitcherComponent, IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  private authStore = inject(AuthStore);
  private updateService = inject(UpdateService);
  private swUpdate = inject(SwUpdate);
  private transloco = inject(TranslocoService);
  private billingStore = inject(BillingStore);

  constructor() {
    effect(() => {
      const uid = this.authStore.uid();

      queueMicrotask(() => {
        if (uid) {
          void this.billingStore.initBilling(uid);
          return;
        }

        this.billingStore.resetBilling();
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
      // await StatusBar.setOverlaysWebView({ overlay: true });
      // await StatusBar.setBackgroundColor({ color: '#0b1023' });
      // await StatusBar.setStyle({ style: Style.Light });
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
