import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCheckbox,
  IonCol,
  IonGrid,
  IonIcon,
  IonImg,
  IonInput,
  IonItem,
  IonList,
  IonRange,
  IonRow,
  IonText,
  IonTextarea,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import {
  translatedChoiceLabel,
  translatedFieldLabel,
  translatedFieldPlaceholder,
  translatedProfileValue,
} from '../../../../shared/i18n/profile-value-labels';
import { Options } from '../../../../shared/models/options.model';
import { UserClass } from '../../../../shared/models/user.model';

export type ProfileChoiceSelectedEvent = {
  event: any;
  labelKey: string;
};

@Component({
  selector: 'app-discover-profile-panel',
  templateUrl: './discover-profile-panel.component.html',
  standalone: true,
  imports: [
    FormsModule,
    TranslocoDirective,
    IonButton,
    IonCard,
    IonCardContent,
    IonCheckbox,
    IonCol,
    IonGrid,
    IonIcon,
    IonImg,
    IonInput,
    IonItem,
    IonList,
    IonRange,
    IonRow,
    IonText,
    IonTextarea,
  ],
})
export class DiscoverProfilePanelComponent {
  readonly choiceLabel = translatedChoiceLabel;
  readonly fieldLabel = translatedFieldLabel;
  readonly fieldPlaceholder = translatedFieldPlaceholder;
  readonly profileValueText = translatedProfileValue;

  @Input() userProfile!: UserClass;
  @Input() labels: any = {};
  @Input() options = new Options();
  @Input() selectedFiles: File[] = [];
  @Input() startUpdate = false;

  @Output() startUpdateRequested = new EventEmitter<void>();
  @Output() profilePictureOpened = new EventEmitter<number>();
  @Output() picturesSaved = new EventEmitter<void>();
  @Output() profileUpdated = new EventEmitter<void>();
  @Output() signOutRequested = new EventEmitter<void>();
  @Output() choicesSelected = new EventEmitter<ProfileChoiceSelectedEvent>();
}
