import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonIcon,
  IonProgressBar,
  IonText,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { translatedProfileValue } from '../../../../shared/i18n/profile-value-labels';
import { UserClass } from '../../../../shared/models/user.model';

@Component({
  selector: 'app-discover-match-card',
  templateUrl: './discover-match-card.component.html',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    TranslocoDirective,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonIcon,
    IonProgressBar,
    IonText,
  ],
})
export class DiscoverMatchCardComponent {
  readonly profileValueText = translatedProfileValue;

  @Input() progress = 0;
  @Input() buffer = 0;
  @Input() matchProfile?: UserClass;
  @Input() isMatchPlaceHolder = false;

  @Output() detailsToggled = new EventEmitter<void>();
  @Output() liked = new EventEmitter<void>();
  @Output() disliked = new EventEmitter<void>();
}
