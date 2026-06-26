
import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonIcon,
  IonImg,
  IonInput,
  IonItem,
  IonPopover,
  IonRange,
  IonSelect,
  IonSelectOption,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { SwiperContainer } from 'swiper/element';

import {
  translatedFieldLabel,
  translatedOptionLabel,
} from '../../shared/i18n/profile-value-labels';
import { UserClass } from '../../shared/models/user.model';
import { LocationService } from '../../services/location.service';

type ProfileOnboardingStep = 'basic' | 'lifestyle';

@Component({
  selector: 'app-ion-modal',
  templateUrl: './ion-modal.page.html',
  styleUrls: ['./ion-modal.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    FormsModule,
    TranslocoDirective,
    IonButton,
    IonButtons,
    IonContent,
    IonDatetime,
    IonIcon,
    IonImg,
    IonInput,
    IonItem,
    IonPopover,
    IonRange,
    IonSelect,
    IonSelectOption,
    IonToolbar,
  ],
})
export class IonModalPage implements OnInit, AfterViewInit {
  readonly fieldLabel = translatedFieldLabel;
  readonly optionLabel = translatedOptionLabel;
  readonly profileBasicKeys = [
    'sexualOrientation',
    'lookingForAge',
    'gender',
    'firstName',
    'lastName',
    'userName',
    'birthDate',
    'currentPlace',
    'lookingForDistance',
  ];
  readonly profileLifestyleKeys = [
    'zodiacSign',
    'familyPlans',
    'communicationStyle',
    'loveStyle',
    'pets',
    'drinking',
    'smoking',
    'workout',
    'socialMedia',
  ];
  readonly selectInterfaceOptions = {
    cssClass: 'amor-auth-select-popover',
  };
  readonly minimumDatingAge = 18;
  readonly defaultDatingDistance = 25;
  readonly minimumDatingDistance = 1;
  readonly maximumDatingDistance = 700;
  readonly maxBirthDate = new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString();

  @ViewChild('swiperRef') swiperRef?: ElementRef<SwiperContainer>;
  email?: string;
  password?: string;
  passwordConfirm?: string;
  regFirstPhase?: boolean;
  regSecondPhase?: boolean;
  labels?: any = {};
  profileStep: ProfileOnboardingStep = 'basic';
  userProf: UserClass = new UserClass();
  myPhotos: { name: string; url: string }[] = [];
  chosenIndex: number = 0;
  activePhotoIndex = 0;
  locationLoading = false;
  locationErrorKey = '';
  private modalCtrl = inject(ModalController);
  private locationService = inject(LocationService);

  ngOnInit() {
    if (this.regSecondPhase) {
      this.initializeProfileDefaults();
      void this.detectCurrentLocation();
    }
  }

  dateTriggerId(key: string) {
    return `auth-date-${key}`;
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
    this.userProf[key] = Array.isArray(value) ? value[0] : value ?? '';
  }

  setLookingForDistance(value: number | string | null | undefined) {
    const distance = Number(value);

    if (!Number.isFinite(distance)) {
      return;
    }

    this.userProf.lookingForDistance = Math.min(
      this.maximumDatingDistance,
      Math.max(this.minimumDatingDistance, Math.round(distance))
    );
  }

  async detectCurrentLocation(force = false) {
    if (this.locationLoading) {
      return;
    }

    if (!force && this.userProf.currentPlace && this.userProf.currentLocCoords) {
      return;
    }

    this.locationLoading = true;
    this.locationErrorKey = '';

    try {
      const position = await this.locationService.getLocation();
      this.userProf.currentLocCoords = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
      };
      const coordinateLabel = this.formatCoordinateLabel(
        position.coords.latitude,
        position.coords.longitude
      );

      if (!this.userProf.currentPlace) {
        this.userProf.currentPlace = coordinateLabel;
      }

      let locationDetails: any = await this.locationService.getLocName(position);

      if (locationDetails?.error) {
        locationDetails = await this.locationService.getLocName(position, true);
      }

      const locationLabel = this.formatLocationLabel(locationDetails);

      if (locationLabel && this.userProf.currentPlace === coordinateLabel) {
        this.userProf.currentPlace = locationLabel;
      }
    } catch (error) {
      console.warn('Could not detect registration location.', error);
      this.locationErrorKey = 'auth.modal.locationError';
    } finally {
      this.locationLoading = false;
    }
  }

  accountPasswordsMatch() {
    return !!this.password && this.password === this.passwordConfirm;
  }

  canSubmitAccount(accountFormInvalid: boolean | null) {
    return !accountFormInvalid && this.accountPasswordsMatch();
  }

  profileFieldsForActiveStep() {
    const activeKeys = this.profileStep === 'basic'
      ? this.profileBasicKeys
      : this.profileLifestyleKeys;
    const activeKeySet = new Set(activeKeys);

    return (this.labels?.userProfLabels ?? []).filter((item: any) => activeKeySet.has(item.key));
  }

  get profileStepNumber() {
    return this.profileStep === 'basic' ? 2 : 3;
  }

  get profileStepTitleKey() {
    return this.profileStep === 'basic' ? 'auth.modal.basicData' : 'auth.modal.lifestyle';
  }

  get profileStepIntroKey() {
    return this.profileStep === 'basic'
      ? 'auth.modal.basicIntro'
      : 'auth.modal.lifestyleIntro';
  }

  get profileStepOptionalKey() {
    return this.profileStep === 'lifestyle' ? 'auth.modal.optional' : '';
  }

  isBasicProfileStepValid() {
    return this.profileBasicKeys.every((key) => this.hasProfileValue(key));
  }

  goToLifestyleStep() {
    if (this.isBasicProfileStepValid()) {
      this.profileStep = 'lifestyle';
    }
  }

  goToBasicStep() {
    this.profileStep = 'basic';
  }

  ngAfterViewInit() {
    if (this.myPhotos?.length) {
      this.activePhotoIndex = this.chosenIndex;

      queueMicrotask(() => {
        this.swiperRef?.nativeElement.swiper?.slideTo(this.chosenIndex);
      });
    }
  }

  onPhotoSlideChange() {
    this.activePhotoIndex =
      this.swiperRef?.nativeElement.swiper?.activeIndex ?? this.activePhotoIndex;
  }

  cancel() {
    return this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    let data: any = {};
    if (this.email) {
      if (!this.accountPasswordsMatch()) {
        return;
      }

      data = { email: this.email, password: this.password };
      this.email = '';
      this.password = '';
      this.passwordConfirm = '';
      return this.modalCtrl.dismiss(data, 'confirm');
    }
    if (this.userProf.firstName) {
      if (!this.isBasicProfileStepValid()) {
        return;
      }

      this.normalizeLookingForAge();
      this.normalizeLookingForDistance();
      data = { ...this.userProf };
      return this.modalCtrl.dismiss(data, 'created-successfully');
    }
    console.error(`PROBLEM HA ITT VAN`);
    return this.modalCtrl.dismiss(data, 'no-data');
  }

  private hasProfileValue(key: string) {
    const value = this.userProf[key];

    if (key === 'lookingForAge') {
      return Number.isFinite(Number(value?.lower)) && Number.isFinite(Number(value?.upper));
    }

    if (key === 'lookingForDistance') {
      const distance = Number(value);

      return Number.isFinite(distance) && distance >= this.minimumDatingDistance;
    }

    if (typeof value === 'string') {
      return value.trim().length > 0;
    }

    return value !== undefined && value !== null && value !== '';
  }

  private normalizeLookingForAge() {
    const range = this.userProf.lookingForAge;
    const lower = Number(range?.lower);
    const upper = Number(range?.upper);
    const normalizedLower = Number.isFinite(lower)
      ? Math.max(this.minimumDatingAge, lower)
      : this.minimumDatingAge;
    const normalizedUpper = Number.isFinite(upper)
      ? Math.max(normalizedLower, upper)
      : 100;

    this.userProf.lookingForAge = {
      lower: normalizedLower,
      upper: Math.max(normalizedLower, normalizedUpper),
    };
  }

  private normalizeLookingForDistance() {
    const distance = Number(this.userProf.lookingForDistance);

    this.userProf.lookingForDistance = Number.isFinite(distance)
      ? Math.min(this.maximumDatingDistance, Math.max(this.minimumDatingDistance, Math.round(distance)))
      : this.defaultDatingDistance;
  }

  private initializeProfileDefaults() {
    if (!Number.isFinite(Number(this.userProf.lookingForDistance))) {
      this.userProf.lookingForDistance = this.defaultDatingDistance;
    }
  }

  private formatLocationLabel(locationDetails: any) {
    if (!locationDetails || locationDetails.error) {
      return '';
    }

    const address = locationDetails.address ?? {};
    const standard = locationDetails.standard ?? {};
    const city =
      locationDetails.city ??
      standard.city ??
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      '';
    const countryCode = (
      locationDetails.country_code ??
      address.country_code ??
      standard.countrycode ??
      ''
    ).toString();
    const fallbackCountry =
      locationDetails.country ??
      standard.countryname ??
      address.country ??
      '';
    const country = countryCode ? countryCode.toUpperCase() : fallbackCountry;

    return [city, country].filter(Boolean).join(', ');
  }

  private formatCoordinateLabel(latitude: number, longitude: number) {
    return `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
  }
}
