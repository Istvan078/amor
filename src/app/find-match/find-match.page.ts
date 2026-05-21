import { Component } from '@angular/core';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-find-match',
  templateUrl: './find-match.page.html',
  styleUrls: ['./find-match.page.scss'],
  standalone: true,
  imports: [TranslocoDirective, IonHeader, IonToolbar, IonTitle, IonContent],
})
export class FindMatchPage {}
