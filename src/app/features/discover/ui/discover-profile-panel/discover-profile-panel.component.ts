import {
  AfterViewChecked,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  IonReorder,
  IonReorderGroup,
  IonRow,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
} from '@ionic/angular/standalone';
import type { ItemReorderCustomEvent } from '@ionic/angular/standalone';
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
import {
  diamondOutline,
  checkmarkCircleOutline,
  heartOutline,
  imagesOutline,
  locationOutline,
  personOutline,
  reorderThreeOutline,
  saveOutline,
  settingsOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  star,
  starOutline,
  trashOutline,
} from 'ionicons/icons';
import { BillingCurrent } from '../../../billing/data-access/billing.repository';
import {
  getProfileCompleteness,
  PROFILE_COMPLETENESS_DISCOVERY_THRESHOLD,
} from '../../../profile/utils/profile-completeness';

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
    RouterLink,
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
    IonReorder,
    IonReorderGroup,
    IonRow,
    IonSelect,
    IonSelectOption,
    IonText,
    IonTextarea,
  ],
})
export class DiscoverProfilePanelComponent implements AfterViewChecked, OnChanges {
  @ViewChild('profileEditorPanel')
  private profileEditorPanel?: ElementRef<HTMLElement>;

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
  @Input() canOpenAdmin = false;

  @Output() startUpdateRequested = new EventEmitter<void>();
  @Output() profilePictureOpened = new EventEmitter<number>();
  @Output() picturesSaved = new EventEmitter<void>();
  @Output() profilePhotoReordered = new EventEmitter<{
    fromIndex: number;
    toIndex: number;
  }>();
  @Output() profilePhotoPrimarySelected = new EventEmitter<number>();
  @Output() profilePhotoDeleted = new EventEmitter<number>();
  @Output() profileUpdated = new EventEmitter<void>();
  @Output() profileDeleted = new EventEmitter<void>();
  @Output() choicesSelected = new EventEmitter<ProfileChoiceSelectedEvent>();

  constructor() {
    addIcons({
      checkmarkCircleOutline,
      diamondOutline,
      heartOutline,
      imagesOutline,
      locationOutline,
      personOutline,
      reorderThreeOutline,
      saveOutline,
      settingsOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      star,
      starOutline,
      trashOutline,
    })
  }

  readonly maxPhotos = 6;
  private pendingEditorScroll = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['startUpdate']?.currentValue === true) {
      this.pendingEditorScroll = true;
    }
  }

  ngAfterViewChecked() {
    if (!this.pendingEditorScroll || !this.profileEditorPanel) {
      return;
    }

    this.pendingEditorScroll = false;
    this.profileEditorPanel.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  requestProfileEdit() {
    this.pendingEditorScroll = true;
    this.startUpdateRequested.emit();
  }

  profileCompletionPercent() {
    return getProfileCompleteness(this.userProfile);
  }

  profileReadyForDiscovery() {
    return this.profileCompletionPercent() >= PROFILE_COMPLETENESS_DISCOVERY_THRESHOLD;
  }

  profileCompletionSteps() {
    const profile = this.userProfile;
    const hasPhoto = !!profile?.profilePicture || !!profile?.pictures?.length;
    const hasLocation =
      !!profile?.currentPlace ||
      (
        Number.isFinite(Number(profile?.currentLocCoords?.lat)) &&
        Number.isFinite(Number(profile?.currentLocCoords?.lon))
      );

    return [
      {
        key: 'identity',
        icon: 'person-outline',
        completed: !!(
          profile?.firstName &&
          profile?.birthDate &&
          profile?.gender &&
          profile?.lookingForGender
        ),
      },
      {
        key: 'photos',
        icon: 'images-outline',
        completed: hasPhoto,
      },
      {
        key: 'bio',
        icon: 'heart-outline',
        completed: !!profile?.aboutMe,
      },
      {
        key: 'interests',
        icon: 'sparkles-outline',
        completed: !!profile?.interests?.length,
      },
      {
        key: 'location',
        icon: 'location-outline',
        completed: hasLocation,
      },
    ];
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

  photoCount() {
    return this.userProfile?.pictures?.length ?? 0;
  }

  hasMinimumPhotos() {
    return this.photoCount() >= 1;
  }

  canDeletePhoto() {
    return this.photoCount() > 1;
  }

  canAddMorePhotos() {
    return this.photoCount() < this.maxPhotos;
  }

  remainingPhotoSlots() {
    return Math.max(this.maxPhotos - this.photoCount(), 0);
  }

  photoStatusKey() {
    return this.canAddMorePhotos()
      ? 'profile.photos.required'
      : 'profile.photos.maxReached';
  }

  isPrimaryPhoto(index: number) {
    const pictures = this.userProfile?.pictures ?? [];
    const primaryPictureIndex = pictures.findIndex(
      (picture) => picture.url === this.userProfile?.profilePicture
    );

    return index === (primaryPictureIndex >= 0 ? primaryPictureIndex : 0);
  }

  onPhotoReorder(event: ItemReorderCustomEvent) {
    const { from: fromIndex, to: toIndex } = event.detail;
    event.detail.complete();

    if (
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0
    ) {
      return;
    }

    this.profilePhotoReordered.emit({ fromIndex, toIndex });
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
