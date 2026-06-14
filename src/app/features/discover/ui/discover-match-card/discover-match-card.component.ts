import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonIcon,
  IonProgressBar,
  IonText,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  arrowDownOutline,
  cameraOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeOutline,
  flashOutline,
  heartOutline,
  locationOutline,
  lockClosedOutline,
  returnUpBackOutline,
  shieldCheckmarkOutline,
  star,
} from 'ionicons/icons';

import { translatedProfileValue } from '../../../../shared/i18n/profile-value-labels';
import { PublicProfile } from '../../../../shared/models/public-profile.model';

@Component({
  selector: 'app-discover-match-card',
  templateUrl: './discover-match-card.component.html',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    TranslocoDirective,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonIcon,
    IonProgressBar,
    IonText,
  ],
})
export class DiscoverMatchCardComponent implements OnChanges {
  readonly profileValueText = translatedProfileValue;

  @Input() progress = 0;
  @Input() buffer = 0;
  @Input() matchProfile?: PublicProfile;
  @Input() isMatchPlaceHolder = false;
  @Input() hasRewindCandidate = false;
  @Input() isRewindLocked = true;
  @Input() freeRewindsRemaining = 0;
  @Input() canSuperLike = false;
  @Input() isProfileBoostActive = false;
  @Input() profileBoostMinutesLeft = 0;

  @Output() detailsToggled = new EventEmitter<void>();
  @Output() rewindRequested = new EventEmitter<void>();
  @Output() liked = new EventEmitter<void>();
  @Output() disliked = new EventEmitter<void>();
  @Output() superLiked = new EventEmitter<void>();

  swipeX = 0;
  swipeY = 0;
  swipeRotation = 0;
  swipeIntent: 'pass' | 'like' | 'super-like' | null = null;
  isSwipeDragging = false;
  isSwipeAnimating = false;
  isRewindAnimating = false;
  photoIndex = 0;

  private readonly swipeCommitDistance = 118;
  private readonly swipeSuperLikeDistance = 105;
  private readonly swipePreviewDistance = 92;
  private readonly fallbackWomanPhoto =
    'https://img.freepik.com/free-photo/smiling-beautiful-young-woman-standing-posing_171337-11412.jpg?t=st=1741774526~exp=1741778126~hmac=a7231668e4c5404255597ab2c791cd321150de59b3eacd1ab254649c4e1d2ee4&w=740';
  private readonly fallbackManPhoto =
    'https://img.freepik.com/free-photo/front-view-smiley-man-posing-cv_23-2149927614.jpg?t=st=1742682395~exp=1742685995~hmac=0c894e9ca76b334b0ed1f69f37ab56764bd4db0ab471e43578c54a97734e0f79&w=740';
  private readonly fallbackProfilePhoto =
    'https://img.freepik.com/free-vector/user-circles-set_78370-4704.jpg?t=st=1741696833~exp=1741700433~hmac=5c4d9770452bab7cb12b3a38cead02ffcd3f50b45d75a0da6324820dc1bd3df2&w=740';
  private activePointerId: number | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;

  constructor() {
    addIcons({
      arrowDownOutline,
      cameraOutline,
      chevronBackOutline,
      chevronForwardOutline,
      closeOutline,
      flashOutline,
      heartOutline,
      locationOutline,
      lockClosedOutline,
      returnUpBackOutline,
      shieldCheckmarkOutline,
      star,
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['matchProfile'] || changes['isMatchPlaceHolder']) {
      this.photoIndex = 0;
      this.resetSwipeState();
    }
  }

  canSwipeCard() {
    return (
      this.progress === 100 &&
      !this.isMatchPlaceHolder &&
      !!this.matchProfile?.uid &&
      !this.isSwipeAnimating
    );
  }

  onSwipePointerDown(event: PointerEvent) {
    if (
      !this.canSwipeCard() ||
      event.button > 0 ||
      this.isInteractiveSwipeTarget(event.target)
    ) {
      return;
    }

    this.activePointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.isSwipeDragging = false;
    this.swipeIntent = null;

    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(
      event.pointerId
    );
  }

  onSwipePointerMove(event: PointerEvent) {
    if (this.activePointerId !== event.pointerId || !this.canSwipeCard()) {
      return;
    }

    const nextSwipeX = event.clientX - this.pointerStartX;
    const nextSwipeY = event.clientY - this.pointerStartY;

    if (!this.isSwipeDragging && Math.hypot(nextSwipeX, nextSwipeY) < 8) {
      return;
    }

    this.isSwipeDragging = true;
    this.swipeX = nextSwipeX;
    this.swipeY = Math.max(Math.min(nextSwipeY, 90), -190);
    this.swipeRotation = Math.max(Math.min(nextSwipeX / 16, 18), -18);
    this.swipeIntent = this.resolveSwipeIntent(this.swipeX, this.swipeY);

    event.preventDefault();
  }

  onSwipePointerUp(event: PointerEvent) {
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    (event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(
      event.pointerId
    );

    this.activePointerId = null;

    const committedAction = this.getCommittedSwipeAction();

    if (!committedAction) {
      this.resetSwipeState();
      return;
    }

    this.commitSwipeAction(committedAction);
  }

  onSwipePointerCancel(event: PointerEvent) {
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    this.activePointerId = null;
    this.resetSwipeState();
  }

  swipeFeedbackOpacity(action: 'pass' | 'like' | 'super-like') {
    if (this.swipeIntent !== action) {
      return 0;
    }

    const distance =
      action === 'super-like' ? Math.abs(this.swipeY) : Math.abs(this.swipeX);

    return Math.min(distance / this.swipePreviewDistance, 1);
  }

  getMatchPhotos() {
    if (this.isMatchPlaceHolder) {
      return ['assets/images/no-more-poss-match.png'];
    }

    const pictureUrls =
      this.matchProfile?.pictures
        ?.map((picture) => picture.url)
        .filter((url): url is string => typeof url === 'string' && !!url) ??
      [];

    if (pictureUrls.length) {
      return pictureUrls;
    }

    if (this.matchProfile?.gender === 'No') {
      return [this.fallbackWomanPhoto];
    }

    if (this.matchProfile?.gender === 'Ferfi') {
      return [this.fallbackManPhoto];
    }

    return [this.fallbackProfilePhoto];
  }

  getPhotoIndexes() {
    return this.getMatchPhotos().map((_, index) => index);
  }

  activePhotoIndex() {
    const photoCount = this.getMatchPhotos().length;

    if (!photoCount) {
      return 0;
    }

    return Math.min(Math.max(this.photoIndex, 0), photoCount - 1);
  }

  currentPhotoUrl() {
    const photos = this.getMatchPhotos();

    return photos[this.activePhotoIndex()] ?? this.fallbackProfilePhoto;
  }

  hasMultiplePhotos() {
    return this.getMatchPhotos().length > 1;
  }

  nextPhoto(event?: Event) {
    event?.stopPropagation();

    if (!this.hasMultiplePhotos()) {
      return;
    }

    this.photoIndex = (this.activePhotoIndex() + 1) % this.getMatchPhotos().length;
  }

  previousPhoto(event?: Event) {
    event?.stopPropagation();

    if (!this.hasMultiplePhotos()) {
      return;
    }

    const photoCount = this.getMatchPhotos().length;
    this.photoIndex = (this.activePhotoIndex() - 1 + photoCount) % photoCount;
  }

  onPhotoAreaClick(event: MouseEvent) {
    if (!this.hasMultiplePhotos() || this.isMatchPlaceHolder) {
      return;
    }

    const target = event.currentTarget as HTMLElement | null;
    const bounds = target?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    const clickedRightSide = event.clientX - bounds.left >= bounds.width / 2;

    if (clickedRightSide) {
      this.nextPhoto();
      return;
    }

    this.previousPhoto();
  }

  isRecentlyActive() {
    if (
      this.isMatchPlaceHolder ||
      !this.matchProfile ||
      this.matchProfile.showOnlineStatus === false
    ) {
      return false;
    }

    if (this.matchProfile.isOnline) {
      return true;
    }

    const timestamp = this.getTimestampValue(
      this.matchProfile.lastActiveAt ?? this.matchProfile.lastSeenAt
    );

    return !!timestamp && Date.now() - timestamp <= 1000 * 60 * 60 * 24 * 7;
  }

  hasVisibleDistance() {
    return (
      !this.isMatchPlaceHolder &&
      this.matchProfile?.distanceVisibility !== false &&
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

  getVisibleInterests() {
    return this.matchProfile?.interests?.slice(0, 3) ?? [];
  }

  requestRewind() {
    if (this.isRewindAnimating) {
      return;
    }

    this.isRewindAnimating = true;

    window.setTimeout(() => {
      this.rewindRequested.emit();
    }, 260);

    window.setTimeout(() => {
      this.isRewindAnimating = false;
    }, 820);
  }

  private resolveSwipeIntent(swipeX: number, swipeY: number) {
    if (
      swipeY < -48 &&
      Math.abs(swipeY) > Math.abs(swipeX) * 0.72
    ) {
      return 'super-like';
    }

    if (swipeX > 42) {
      return 'like';
    }

    if (swipeX < -42) {
      return 'pass';
    }

    return null;
  }

  private getCommittedSwipeAction() {
    if (
      this.swipeY < -this.swipeSuperLikeDistance &&
      Math.abs(this.swipeY) > Math.abs(this.swipeX) * 0.68
    ) {
      return 'super-like';
    }

    if (this.swipeX > this.swipeCommitDistance) {
      return 'like';
    }

    if (this.swipeX < -this.swipeCommitDistance) {
      return 'pass';
    }

    return null;
  }

  private commitSwipeAction(action: 'pass' | 'like' | 'super-like') {
    this.isSwipeDragging = false;
    this.isSwipeAnimating = true;
    this.swipeIntent = action;

    const viewportWidth = Math.max(window.innerWidth || 0, 900);
    const viewportHeight = Math.max(window.innerHeight || 0, 760);

    if (action === 'like') {
      this.swipeX = viewportWidth;
      this.swipeRotation = 24;
    } else if (action === 'pass') {
      this.swipeX = -viewportWidth;
      this.swipeRotation = -24;
    } else {
      this.swipeX = this.swipeX * 0.35;
      this.swipeY = -viewportHeight;
      this.swipeRotation = 0;
    }

    window.setTimeout(() => {
      if (action === 'like') {
        this.liked.emit();
      } else if (action === 'pass') {
        this.disliked.emit();
      } else {
        this.superLiked.emit();
      }

      window.setTimeout(() => this.resetSwipeState(), 280);
    }, 170);
  }

  private resetSwipeState() {
    this.activePointerId = null;
    this.swipeX = 0;
    this.swipeY = 0;
    this.swipeRotation = 0;
    this.swipeIntent = null;
    this.isSwipeDragging = false;
    this.isSwipeAnimating = false;
  }

  private getTimestampValue(value: unknown) {
    if (!value) {
      return 0;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? 0 : value.getTime();
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    }

    if (typeof value === 'object' && 'toDate' in value) {
      const date = (value as { toDate: () => Date }).toDate();
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    }

    return 0;
  }

  private isInteractiveSwipeTarget(target: EventTarget | null) {
    const element = target as Element | null;

    return !!element?.closest?.(
      'ion-button, button, a, input, textarea, select, ion-range, ion-reorder, ion-checkbox, ion-select, ion-datetime'
    );
  }
}
