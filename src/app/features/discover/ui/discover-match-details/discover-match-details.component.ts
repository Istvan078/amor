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
import { PublicProfile } from '../../../../shared/models/public-profile.model';
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
  @Input() userProfile?: UserClass;
  @Input() matchProfile?: PublicProfile;
  @Input() possibleDetailLists: number[] = [];

  @Output() closed = new EventEmitter<void>();

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

  isDetailVisible(label: { key?: string }) {
    if (label.key === 'currentPlace') {
      return this.isDistanceVisible();
    }

    return true;
  }

  private isDistanceVisible() {
    return this.matchProfile?.distanceVisibility !== false;
  }

  private isRecentlyActive() {
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
