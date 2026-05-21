import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import {
  IonAvatar,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonText,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import { Promotions } from '../../../../shared/models/promotions.model';
import { UserClass } from '../../../../shared/models/user.model';

@Component({
  selector: 'app-discover-sidebar',
  templateUrl: './discover-sidebar.component.html',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    TranslocoDirective,
    IonAvatar,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonIcon,
    IonText,
  ],
})
export class DiscoverSidebarComponent {
  @Input() userProfile?: UserClass;
  @Input() promotions: Promotions[] = [];
  @Input() matches: UserClass[] = [];

  @Output() profileOpened = new EventEmitter<void>();
  @Output() messageOpened = new EventEmitter<UserClass>();
  @Output() matchesOpened = new EventEmitter<void>();
  @Output() messagesOpened = new EventEmitter<void>();
}
