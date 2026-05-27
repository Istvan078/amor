import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  IonAvatar,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonText,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  banOutline,
  chatbubblesOutline,
  diamondOutline,
  eyeOutline,
  flashOutline,
  giftOutline,
  heartCircleOutline,
  peopleOutline,
  rocketOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { Promotions } from '../../../../shared/models/promotions.model';
import { UserClass } from '../../../../shared/models/user.model';
import { BillingCurrent } from '../../../billing/data-access/billing.repository';

export type MatchConversationPreview = {
  hasMessages: boolean;
  isLastMessageMine: boolean;
  lastMessage: string;
  unreadCount: number;
};

type PromoSwiperElement = HTMLElement & {
  autoplay?: boolean | Record<string, unknown>;
  grabCursor?: boolean;
  initialize?: () => void;
  loop?: boolean;
  noSwiping?: boolean;
  noSwipingSelector?: string;
  pagination?: boolean | Record<string, unknown>;
  slidesPerView?: number;
  spaceBetween?: number;
  speed?: number;
  swiper?: {
    autoplay?: {
      start?: () => void;
      stop?: () => void;
    };
    update?: () => void;
  };
};

@Component({
  selector: 'app-discover-sidebar',
  templateUrl: './discover-sidebar.component.html',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    TranslocoDirective,
    IonAvatar,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonIcon,
    IonText,
  ],
})
export class DiscoverSidebarComponent implements AfterViewInit, OnChanges {
  @ViewChild('promoSwiper') private promoSwiper?: ElementRef<PromoSwiperElement>;

  @Input() userProfile?: UserClass;
  @Input() promotions: Promotions[] = [];
  @Input() matches: UserClass[] = [];
  @Input() conversationPreviews: Record<string, MatchConversationPreview> = {};
  @Input() selectedMatchUid?: string;
  @Input() billingCurrent: BillingCurrent | null = null;
  @Input() isPremium = false;
  @Input() activeEntitlements: string[] = [];
  @Input() superLikesBalance = 0;

  @Output() profileOpened = new EventEmitter<void>();
  @Output() messageOpened = new EventEmitter<UserClass>();
  @Output() matchesOpened = new EventEmitter<void>();
  @Output() messagesOpened = new EventEmitter<void>();
  @Output() promotionSelected = new EventEmitter<Promotions>();

  readonly fallbackAvatar =
    'https://img.freepik.com/free-vector/user-circles-set_78370-4704.jpg?t=st=1741696833~exp=1741700433~hmac=5c4d9770452bab7cb12b3a38cead02ffcd3f50b45d75a0da6324820dc1bd3df2&w=740';

  private promoSwiperInitialized = false;

  constructor() {
    addIcons({
      arrowForwardOutline,
      banOutline,
      chatbubblesOutline,
      diamondOutline,
      eyeOutline,
      flashOutline,
      giftOutline,
      heartCircleOutline,
      peopleOutline,
      rocketOutline,
      sparklesOutline,
    });
  }

  ngAfterViewInit() {
    this.queuePromoSwiperConfig();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['promotions']) {
      this.queuePromoSwiperConfig();
    }
  }

  getMatchName(match: UserClass) {
    return [match.firstName, match.lastName].filter(Boolean).join(' ');
  }

  getMatchImage(match: UserClass) {
    return match.pictures?.[0]?.url || this.fallbackAvatar;
  }

  isSelectedMatch(match: UserClass) {
    return !!match.uid && match.uid === this.selectedMatchUid;
  }

  isBlockedMatch(match: UserClass) {
    return !!(
      this.userProfile?.blockedUsers?.length &&
      match.uid &&
      this.userProfile.blockedUsers.includes(match.uid)
    );
  }

  getConversationPreview(match: UserClass): MatchConversationPreview {
    if (!match.uid) {
      return this.emptyPreview();
    }

    return this.conversationPreviews[match.uid] ?? this.emptyPreview();
  }

  formatUnreadCount(unreadCount: number) {
    return unreadCount > 99 ? '99+' : String(unreadCount);
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

  private emptyPreview(): MatchConversationPreview {
    return {
      hasMessages: false,
      isLastMessageMine: false,
      lastMessage: '',
      unreadCount: 0,
    };
  }

  private queuePromoSwiperConfig() {
    queueMicrotask(() => this.configurePromoSwiper());
  }

  private configurePromoSwiper() {
    const swiperElement = this.promoSwiper?.nativeElement;
    if (!swiperElement) {
      return;
    }

    if (!this.promotions.length) {
      return;
    }

    const hasMultiplePromotions = this.promotions.length > 1;

    swiperElement.grabCursor = hasMultiplePromotions;
    swiperElement.loop = hasMultiplePromotions;
    swiperElement.noSwiping = true;
    swiperElement.noSwipingSelector = '.prom-cta-button';
    swiperElement.slidesPerView = 1;
    swiperElement.spaceBetween = 0;
    swiperElement.speed = 650;

    if (hasMultiplePromotions) {
      swiperElement.autoplay = {
        delay: 4200,
        disableOnInteraction: false,
        pauseOnMouseEnter: true,
      };
      swiperElement.pagination = {
        clickable: true,
      };
    }

    if (!this.promoSwiperInitialized) {
      swiperElement.initialize?.();
      this.promoSwiperInitialized = true;
      return;
    }

    swiperElement.swiper?.update?.();

    if (hasMultiplePromotions) {
      swiperElement.swiper?.autoplay?.start?.();
      return;
    }

    swiperElement.swiper?.autoplay?.stop?.();
  }
}
