import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';

import { MainViewContainerComponent } from '../../../main-view-container/main-view-container.component';

@Component({
  selector: 'app-discover',
  templateUrl: './discover.page.html',
  styleUrls: ['./discover.page.scss'],
  standalone: true,
  imports: [IonContent, MainViewContainerComponent],
})
export class DiscoverPage {
  matchUserProfs: any[] = [];
  matches: any[] = [];
  progress = 0;
  buffer = 0;
}