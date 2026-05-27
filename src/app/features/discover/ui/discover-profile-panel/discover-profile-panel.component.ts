import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCheckbox,
  IonCol,
  IonDatetime,
  IonGrid,
  IonIcon,
  IonImg,
  IonInput,
  IonItem,
  IonList,
  IonPopover,
  IonRange,
  IonRow,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';

import {
  translatedChoiceLabel,
  translatedFieldLabel,
  translatedFieldPlaceholder,
  translatedOptionLabel,
  translatedProfileValue,
} from '../../../../shared/i18n/profile-value-labels';
import { Options } from '../../../../shared/models/options.model';
import { UserClass } from '../../../../shared/models/user.model';
import { addIcons } from 'ionicons';
import { diamondOutline, sparklesOutline, trashOutline } from 'ionicons/icons';
import { BillingCurrent } from '../../../billing/data-access/billing.repository';

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
    IonDatetime,
    IonGrid,
    IonIcon,
    IonImg,
    IonInput,
    IonItem,
    IonList,
    IonPopover,
    IonRange,
    IonRow,
    IonSelect,
    IonSelectOption,
    IonText,
    IonTextarea,
  ],
})
export class DiscoverProfilePanelComponent {
  readonly choiceLabel = translatedChoiceLabel;
  readonly fieldLabel = translatedFieldLabel;
  readonly fieldPlaceholder = translatedFieldPlaceholder;
  readonly optionLabel = translatedOptionLabel;
  readonly profileValueText = translatedProfileValue;
  readonly selectInterfaceOptions = {
    cssClass: 'amor-auth-select-popover',
  };

  @Input() userProfile!: UserClass;
  @Input() labels: any = {};
  @Input() options = new Options();
  @Input() selectedFiles: File[] = [];
  @Input() startUpdate = false;
  @Input() billingCurrent: BillingCurrent | null = null;
  @Input() isPremium = false;
  @Input() activeEntitlements: string[] = [];
  @Input() superLikesBalance = 0;

  @Output() startUpdateRequested = new EventEmitter<void>();
  @Output() profilePictureOpened = new EventEmitter<number>();
  @Output() picturesSaved = new EventEmitter<void>();
  @Output() profileUpdated = new EventEmitter<void>();
  @Output() profileDeleted = new EventEmitter<void>();
  @Output() signOutRequested = new EventEmitter<void>();
  @Output() choicesSelected = new EventEmitter<ProfileChoiceSelectedEvent>();

  constructor() {
    addIcons({ diamondOutline, sparklesOutline, trashOutline })
  }

  dateTriggerId(key: string) {
    return `profile-date-${key}`;
  }

  formatDateValue(value: unknown) {
    if (!value || typeof value !== 'string') {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  setDateValue(key: string, value: string | string[] | null | undefined) {
    this.userProfile[key] = Array.isArray(value) ? value[0] : value ?? '';

    if (key === 'birthDate') {
      this.userProfile.calcAge();
    }
  }

  selectedFileNames() {
    return this.selectedFiles.map((file) => file.name).join(', ');
  }

  hasBillingSummary() {
    return !!(
      this.isPremium ||
      this.activeEntitlements.length ||
      this.superLikesBalance > 0 ||
      this.billingCurrent?.productId
    );
  }

  billingTitleKey() {
    if (this.isPremium) {
      return 'billing.status.gold';
    }

    if (this.superLikesBalance > 0) {
      return 'billing.status.superLikePack';
    }

    return 'billing.status.activePackage';
  }

  billingSubtitleKey() {
    if (this.isPremium && this.billingCurrent?.expiresAt) {
      return 'billing.status.activeUntil';
    }

    if (this.superLikesBalance > 0) {
      return 'billing.status.superLikesBalance';
    }

    return 'billing.status.active';
  }

  billingSubtitleParams() {
    return {
      date: this.formatBillingDate(this.billingCurrent?.expiresAt),
      count: this.superLikesBalance,
    };
  }

  getBillingProductLabel() {
    return this.billingCurrent?.productId?.replace(/_/g, ' ') ?? '';
  }

  private formatBillingDate(value?: string | null) {
    if (!value) {
      return '';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
