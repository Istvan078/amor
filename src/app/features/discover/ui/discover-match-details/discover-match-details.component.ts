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
import { getProfileCompleteness } from '../../../profile/utils/profile-completeness';

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
  @Input() userProfile?: UserClass;
  @Input() matchProfile?: UserClass;
  @Input() possibleDetailLists: number[] = [];

  @Output() closed = new EventEmitter<void>();

  getCompatibilityScore() {
    const reasons = this.getCompatibilityReasons();

    return Math.min(98, Math.max(52, 52 + reasons.length * 9));
  }

  getCompatibilityReasons() {
    const reasons: Array<{ key: string; params?: Record<string, unknown> }> = [];
    const sharedInterests = this.getSharedInterests();

    if (this.isNearby()) {
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

    if (getProfileCompleteness(this.matchProfile) >= 70) {
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
    const myCoords = this.userProfile?.currentLocCoords;
    const matchCoords = this.matchProfile?.currentLocCoords;

    if (
      !Number.isFinite(Number(myCoords?.lat)) ||
      !Number.isFinite(Number(myCoords?.lon)) ||
      !Number.isFinite(Number(matchCoords?.lat)) ||
      !Number.isFinite(Number(matchCoords?.lon))
    ) {
      return false;
    }

    const distanceKm = this.getDistanceKm(
      Number(myCoords?.lat),
      Number(myCoords?.lon),
      Number(matchCoords?.lat),
      Number(matchCoords?.lon)
    );

    return distanceKm <= Number(this.userProfile?.lookingForDistance ?? 50);
  }

  private isRecentlyActive() {
    const value = this.matchProfile?.['lastActiveAt'] ?? this.matchProfile?.['lastSeenAt'];
    const timestamp = this.getTimestampValue(value);

    if (!timestamp) {
      return false;
    }

    return Date.now() - timestamp <= 1000 * 60 * 60 * 24 * 7;
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

  private getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const earthRadiusKm = 6371;
    const toRad = (value: number) => value * Math.PI / 180;
    const deltaLat = toRad(lat2 - lat1);
    const deltaLon = toRad(lon2 - lon1);
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
  }
}
