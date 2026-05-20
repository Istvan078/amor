import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
} from '@ionic/angular/standalone';

import { UserClass } from '../../../../shared/models/user.model';

@Component({
  selector: 'app-discover-match-details',
  templateUrl: './discover-match-details.component.html',
  standalone: true,
  imports: [IonButton, IonIcon, IonItem, IonLabel, IonList],
})
export class DiscoverMatchDetailsComponent {
  @Input() labels: any = {};
  @Input() matchProfile?: UserClass;
  @Input() possibleDetailLists: number[] = [];

  @Output() closed = new EventEmitter<void>();
}
