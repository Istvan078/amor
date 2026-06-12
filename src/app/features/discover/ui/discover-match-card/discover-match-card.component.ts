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
  closeOutline,
  flashOutline,
  heartOutline,
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

  private readonly swipeCommitDistance = 118;
  private readonly swipeSuperLikeDistance = 105;
  private readonly swipePreviewDistance = 92;
  private activePointerId: number | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;

  constructor() {
    addIcons({
      closeOutline,
      flashOutline,
      heartOutline,
      lockClosedOutline,
      returnUpBackOutline,
      shieldCheckmarkOutline,
      star,
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['matchProfile'] || changes['isMatchPlaceHolder']) {
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

  private isInteractiveSwipeTarget(target: EventTarget | null) {
    const element = target as Element | null;

    return !!element?.closest?.(
      'ion-button, button, a, input, textarea, select, ion-range, ion-reorder, ion-checkbox, ion-select, ion-datetime'
    );
  }
}
