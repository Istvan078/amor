import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  chevronBackOutline,
  chevronForwardOutline,
  closeOutline,
  diamondOutline,
  eyeOutline,
  giftOutline,
  heartCircleOutline,
  lockClosedOutline,
  returnUpBackOutline,
  rocketOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { Promotions } from '../../../../shared/models/promotions.model';
import { UserClass } from '../../../../shared/models/user.model';

export type PromoBottomSheetDismissReason = 'close' | 'maybeLater' | 'cta';
export type PromoBottomSheetDismissEvent = {
  reason: PromoBottomSheetDismissReason;
  promotion?: Promotions;
};

@Component({
  selector: 'app-promo-bottom-sheet',
  templateUrl: './promo-bottom-sheet.component.html',
  styleUrls: ['./promo-bottom-sheet.component.scss'],
  standalone: true,
  imports: [IonIcon, TranslocoDirective],
})
export class PromoBottomSheetComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() promotions: Promotions[] = [];
  @Input() activeIndex = 0;
  @Input() likedByProfiles: UserClass[] = [];

  @Output() dismissed = new EventEmitter<PromoBottomSheetDismissEvent>();

  selectedIndex = 0;
  showOtherOffers = false;

  private readonly fallbackAvatar =
    'https://img.freepik.com/free-vector/user-circles-set_78370-4704.jpg?t=st=1741696833~exp=1741700433~hmac=5c4d9770452bab7cb12b3a38cead02ffcd3f50b45d75a0da6324820dc1bd3df2&w=740';

  constructor() {
    addIcons({
      arrowForwardOutline,
      chevronBackOutline,
      chevronForwardOutline,
      closeOutline,
      diamondOutline,
      eyeOutline,
      giftOutline,
      heartCircleOutline,
      lockClosedOutline,
      returnUpBackOutline,
      rocketOutline,
      sparklesOutline,
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isOpen']?.currentValue === true) {
      this.showOtherOffers = false;
    }

    if (changes['promotions'] || changes['activeIndex']) {
      this.selectedIndex = this.clampIndex(this.activeIndex);
    }
  }

  get visiblePromotions() {
    return this.promotions.slice(0, 3);
  }

  get currentPromotion() {
    return this.visiblePromotions[this.selectedIndex];
  }

  get hasOtherOffers() {
    return this.visiblePromotions.length > 1;
  }

  getIconName(promotion?: Promotions) {
    return promotion?.['iconName'] ?? 'sparkles-outline';
  }

  isLikedByPromotion(promotion?: Promotions) {
    return promotion?.['id'] === 'seeLikes' && this.getLikedByCount() > 0;
  }

  getLikedByCount() {
    return this.likedByProfiles.length;
  }

  getLikedByPreviewProfiles() {
    return this.likedByProfiles.slice(0, 3);
  }

  getLikedByProfileImage(profile?: UserClass) {
    return profile?.pictures?.[0]?.url || this.fallbackAvatar;
  }

  openOtherOffers() {
    this.showOtherOffers = true;
  }

  dismiss(reason: PromoBottomSheetDismissReason) {
    const promotion = this.currentPromotion;

    this.showOtherOffers = false;
    this.dismissed.emit({ reason, promotion });
  }

  selectOffer(index: number) {
    this.selectedIndex = this.clampIndex(index);
  }

  previousOffer() {
    this.selectedIndex = this.clampIndex(this.selectedIndex - 1);
  }

  nextOffer() {
    this.selectedIndex = this.clampIndex(this.selectedIndex + 1);
  }

  private clampIndex(index: number) {
    const maxIndex = Math.max(this.visiblePromotions.length - 1, 0);
    return Math.min(Math.max(index, 0), maxIndex);
  }
}
