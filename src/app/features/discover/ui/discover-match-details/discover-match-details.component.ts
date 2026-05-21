import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import {
  translatedFieldLabel,
  translatedProfileValue,
} from '../../../../shared/i18n/profile-value-labels';
import { UserClass } from '../../../../shared/models/user.model';

@Component({
  selector: 'app-discover-match-details',
  templateUrl: './discover-match-details.component.html',
  standalone: true,
  imports: [TranslocoDirective, IonButton, IonIcon, IonItem, IonLabel, IonList],
})
export class DiscoverMatchDetailsComponent {
  readonly fieldLabel = translatedFieldLabel;
  readonly profileValueText = translatedProfileValue;

  @Input() labels: any = {};
  @Input() matchProfile?: UserClass;
  @Input() possibleDetailLists: number[] = [];

  @Output() closed = new EventEmitter<void>();
}
