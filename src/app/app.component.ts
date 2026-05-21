import { Component, inject, OnInit } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';

import { UpdateService } from './core/update/update.service';
import { AuthStore } from './features/auth/store/auth.store';
import { LanguageSwitcherComponent } from './shared/ui/language-switcher/language-switcher.component';

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

  ngOnInit() {
    this.setInitialLanguage();
    this.authStore.startAuthListener();

    if (this.swUpdate.isEnabled) {
      this.updateService.checkForUpdate();
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
