import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  atOutline,
  barbellOutline,
  briefcaseOutline,
  cameraOutline,
  chatbubbleEllipsesOutline,
  documentTextOutline,
  heartOutline,
  homeOutline,
  idCardOutline,
  locationOutline,
  moonOutline,
  musicalNotesOutline,
  pawOutline,
  peopleOutline,
  playCircleOutline,
  resizeOutline,
  schoolOutline,
  sparklesOutline,
  wineOutline,
} from 'ionicons/icons';

import {
  translatedFieldLabel,
  translatedProfileValue,
} from '../../../../shared/i18n/profile-value-labels';
import { PublicProfile } from '../../../../shared/models/public-profile.model';
import { UserClass } from '../../../../shared/models/user.model';

@Component({
  selector: 'app-discover-match-details',
  templateUrl: './discover-match-details.component.html',
  standalone: true,
  imports: [TranslocoDirective, IonIcon],
})
export class DiscoverMatchDetailsComponent {
  readonly fieldLabel = translatedFieldLabel;
  readonly profileValueText = translatedProfileValue;
  readonly fallbackAnthemImage = 'assets/icon/main-icon.png';

  @Input() labels: any = {};
  @Input() userProfile?: UserClass;
  @Input() matchProfile?: PublicProfile;
  @Input() possibleDetailLists: number[] = [];

  @Output() closed = new EventEmitter<void>();

  constructor() {
    addIcons({
      atOutline,
      barbellOutline,
      briefcaseOutline,
      cameraOutline,
      chatbubbleEllipsesOutline,
      documentTextOutline,
      heartOutline,
      homeOutline,
      idCardOutline,
      locationOutline,
      moonOutline,
      musicalNotesOutline,
      pawOutline,
      peopleOutline,
      playCircleOutline,
      resizeOutline,
      schoolOutline,
      sparklesOutline,
      wineOutline,
    });
  }

  getCompatibilityScore() {
    const reasons = this.getCompatibilityReasons();

    return Math.min(98, Math.max(52, 52 + reasons.length * 9));
  }

  getCompatibilityReasons() {
    const reasons: Array<{ key: string; params?: Record<string, unknown> }> = [];
    const sharedInterests = this.getSharedInterests();

    if (this.isDistanceVisible() && this.isNearby()) {
      reasons.push({ key: 'nearby' });
    }

    if (sharedInterests.length) {
      reasons.push({
        key: 'sharedInterests',
        params: { count: sharedInterests.length },
      });
    }

    if (this.isInPreferredAgeRange()) {
      reasons.push({ key: 'ageRange' });
    }

    if (this.isRecentlyActive()) {
      reasons.push({ key: 'recentlyActive' });
    }

    if (this.isPublicProfileComplete()) {
      reasons.push({ key: 'completeProfile' });
    }

    return reasons;
  }

  private getSharedInterests() {
    const myInterests = this.userProfile?.interests ?? [];
    const matchInterests = this.matchProfile?.interests ?? [];

    return myInterests.filter((interest) => matchInterests.includes(interest));
  }

  private isInPreferredAgeRange() {
    const age = Number(this.matchProfile?.age);
    const range = this.userProfile?.lookingForAge;

    if (!Number.isFinite(age) || !range) {
      return false;
    }

    return age >= Number(range.lower ?? 18) && age <= Number(range.upper ?? 100);
  }

  private isNearby() {
    const distanceKm = Number(this.matchProfile?.distanceKm);

    if (!Number.isFinite(distanceKm)) {
      return false;
    }

    return distanceKm <= Number(this.userProfile?.lookingForDistance ?? 50);
  }

  getDetailValue(key?: string) {
    return key && this.matchProfile ? this.matchProfile[key] : undefined;
  }

  getDetailListValue(key?: string) {
    const value = this.getDetailValue(key);

    return Array.isArray(value) ? value : [];
  }

  getProfileTitle() {
    const name = this.matchProfile?.firstName ?? '';
    const age = this.matchProfile?.age ? ` ${this.matchProfile.age}` : '';

    return `${name}${age}`.trim();
  }

  hasVisibleDistance() {
    return (
      this.isDistanceVisible() &&
      Number.isFinite(Number(this.matchProfile?.distanceKm))
    );
  }

  getDistanceKmLabel() {
    const distanceKm = Number(this.matchProfile?.distanceKm);

    if (!Number.isFinite(distanceKm)) {
      return '';
    }

    if (distanceKm < 10) {
      return (Math.round(distanceKm * 10) / 10).toString();
    }

    return String(Math.round(distanceKm));
  }

  hasHeight() {
    return Number.isFinite(Number(this.matchProfile?.heightCm));
  }

  getHeightLabel() {
    return String(Math.round(Number(this.matchProfile?.heightCm)));
  }

  getEducationValue() {
    return this.matchProfile?.highestSchool || this.matchProfile?.currStudy || '';
  }

  hasMoreAboutMe() {
    return !!(
      this.matchProfile?.zodiacSign ||
      this.getEducationValue() ||
      this.matchProfile?.familyPlans ||
      this.matchProfile?.communicationStyle ||
      this.matchProfile?.loveStyle
    );
  }

  hasLifestyle() {
    return !!(
      this.matchProfile?.pets ||
      this.matchProfile?.drinking ||
      this.matchProfile?.smoking ||
      this.matchProfile?.workout ||
      this.matchProfile?.socialMedia
    );
  }

  hasAnthem() {
    return !!this.matchProfile?.anthemTitle;
  }

  getAnthemImage() {
    const imageUrl = this.matchProfile?.anthemImageUrl;

    return typeof imageUrl === 'string' && imageUrl.trim()
      ? imageUrl
      : this.fallbackAnthemImage;
  }

  getAnthemMeta() {
    return [this.matchProfile?.anthemArtist, this.matchProfile?.anthemAlbum]
      .filter((value): value is string => typeof value === 'string' && !!value.trim())
      .join(' · ');
  }

  isDetailVisible(label: { key?: string }) {
    if (label.key === 'currentPlace') {
      return this.isDistanceVisible();
    }

    return true;
  }

  isDistanceVisible() {
    return this.matchProfile?.distanceVisibility !== false;
  }

  isRecentlyActive() {
    if (this.matchProfile?.showOnlineStatus === false) {
      return false;
    }

    const value = this.matchProfile?.['lastActiveAt'] ?? this.matchProfile?.['lastSeenAt'];
    const timestamp = this.getTimestampValue(value);

    if (!timestamp) {
      return false;
    }

    return Date.now() - timestamp <= 1000 * 60 * 60 * 24 * 7;
  }

  private isPublicProfileComplete() {
    if (this.matchProfile?.profileCompleted === true) {
      return true;
    }

    return Number(this.matchProfile?.profileCompleteness ?? 0) >= 70;
  }

  private getTimestampValue(value: unknown) {
    if (!value) {
      return 0;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    }

    if (typeof value === 'object' && 'toDate' in value) {
      const date = (value as { toDate: () => Date }).toDate();
      return date.getTime();
    }

    return 0;
  }

}
