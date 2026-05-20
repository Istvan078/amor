import { Component, OnInit, inject } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { MainViewContainerComponent } from '../../../main-view-container/main-view-container.component';
import { ConfigService } from '../../../services/config.service';
import { DiscoverStore } from '../store/discover.store';

@Component({
  selector: 'app-discover',
  templateUrl: './discover.page.html',
  styleUrls: ['./discover.page.scss'],
  standalone: true,
  imports: [IonContent, MainViewContainerComponent],
})
export class DiscoverPage implements OnInit {
  readonly discoverStore = inject(DiscoverStore);

  private config = inject(ConfigService);

  async ngOnInit() {
    await this.discoverStore.loadDiscoverData();

    setTimeout(() => {
      this.config.requestMainViewInit();
    }, 0);
  }
}
