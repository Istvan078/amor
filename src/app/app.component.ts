import { Component, inject, OnInit } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { UpdateService } from './core/update/update.service';
import { AuthStore } from './features/auth/store/auth.store';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  private authStore = inject(AuthStore);
  private updateService = inject(UpdateService);
  private swUpdate = inject(SwUpdate);

  ngOnInit() {
    this.authStore.startAuthListener();

    if (this.swUpdate.isEnabled) {
      this.updateService.checkForUpdate();
    }
  }
}
