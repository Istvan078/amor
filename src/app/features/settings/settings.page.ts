import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon } from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cardOutline,
  chevronForwardOutline,
  diamondOutline,
  heartOutline,
  languageOutline,
  lockClosedOutline,
  mailOutline,
  notificationsOutline,
  personCircleOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { LanguageSwitcherComponent } from '../../shared/ui/language-switcher/language-switcher.component';

@Component({
  selector: 'app-settings-page',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    TranslocoDirective,
    IonButton,
    IonContent,
    IonIcon,
    LanguageSwitcherComponent,
  ],
})
export class SettingsPage {
  constructor() {
    addIcons({
      arrowBackOutline,
      cardOutline,
      chevronForwardOutline,
      diamondOutline,
      heartOutline,
      languageOutline,
      lockClosedOutline,
      mailOutline,
      notificationsOutline,
      personCircleOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
    });
  }
}
