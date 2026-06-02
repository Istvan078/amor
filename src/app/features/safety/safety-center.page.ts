import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowBackOutline,
  banOutline,
  chatbubbleEllipsesOutline,
  checkmarkCircleOutline,
  documentTextOutline,
  flagOutline,
  heartOutline,
  lockClosedOutline,
  mailOutline,
  shieldCheckmarkOutline,
  warningOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-safety-center',
  templateUrl: './safety-center.page.html',
  styleUrls: ['./safety-center.page.scss'],
  standalone: true,
  imports: [RouterLink, TranslocoDirective, IonButton, IonContent, IonIcon],
})
export class SafetyCenterPage {
  constructor() {
    addIcons({
      alertCircleOutline,
      arrowBackOutline,
      banOutline,
      chatbubbleEllipsesOutline,
      checkmarkCircleOutline,
      documentTextOutline,
      flagOutline,
      heartOutline,
      lockClosedOutline,
      mailOutline,
      shieldCheckmarkOutline,
      warningOutline,
    });
  }
}
