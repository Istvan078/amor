import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  effect,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonCard,
  IonCol,
  IonContent,
  IonGrid,
  IonRow,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';

import { IonModalPage } from '../../../modals/ion-modal/ion-modal.page';
import { ConfigService } from '../../../services/config.service';
import { LocationService } from '../../../services/location.service';
import { MessageComponent } from '../../messages/ui/message/message.component';
import { AuthStore } from '../../auth/store/auth.store';
import { AnalyticsService } from '../../analytics/data-access/analytics.service';
import { DiscoverRepository } from '../data-access/discover.repository';
import { DiscoverStore } from '../store/discover.store';
import { DiscoverUiStore } from '../store/discover-ui.store';
import { DiscoverMatchCardComponent } from '../ui/discover-match-card/discover-match-card.component';
import { DiscoverMatchDetailsComponent } from '../ui/discover-match-details/discover-match-details.component';
import {
  DiscoverProfilePanelComponent,
  type ProfileChoiceSelectedEvent,
} from '../ui/discover-profile-panel/discover-profile-panel.component';
import { DiscoverSidebarComponent } from '../ui/discover-sidebar/discover-sidebar.component';
import {
  PromoBottomSheetComponent,
  type PromoBottomSheetDismissEvent,
} from '../ui/promo-bottom-sheet/promo-bottom-sheet.component';
import { ProfilePicturesRepository } from '../../profile/data-access/profile-pictures.repository';
import { ProfileStore } from '../../profile/store/profile.store';
import { Options } from '../../../shared/models/options.model';
import { Promotions } from '../../../shared/models/promotions.model';
import { UserClass } from '../../../shared/models/user.model';
import { Message } from '../../../shared/models/message.model';
import { MatchConversationPreviewsStore } from '../../messages/store/match-conversation-previews.store';
import { MatchActionsStore } from '../../matching/store/match-actions.store';
import { MatchIndexRepository } from '../../matching/data-access/match-index.repository';
import { LikedByRepository } from '../../matching/data-access/liked-by.repository';
import { OnlinePresenceService } from '../../presence/data-access/online-presence.service';
import { PromoStore } from '../../promotions/store/promo.store';
import { DailyUsageStore } from '../../usage/store/daily-usage.store';
import { PaywallComponent } from '../../billing/ui/paywall/paywall.component';
import { BillingStore } from '../../billing/store/billing.store';
import { UserClaims } from '../../auth/store/auth.slice';
import {
  getProfileCompleteness,
  isProfileCompleteForDiscovery,
} from '../../profile/utils/profile-completeness';
import { ItsAMatchModalComponent } from '../ui/its-a-match-modal/its-a-match-modal.component';

type ProfilePicture = NonNullable<UserClass['pictures']>[number];

@Component({
  selector: 'app-discover',
  templateUrl: './discover.page.html',
  styleUrls: ['./discover.page.scss'],
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    DiscoverMatchCardComponent,
    DiscoverMatchDetailsComponent,
    DiscoverProfilePanelComponent,
    DiscoverSidebarComponent,
    MessageComponent,
    PromoBottomSheetComponent,
    IonCard,
    IonCol,
    IonContent,
    IonGrid,
    IonRow,
    TranslocoPipe,
  ],
})
export class DiscoverPage implements OnInit, OnDestroy {
  possibleMatchIds: string[] = [];
  matchProfiles: UserClass[] = [];
  progress = 0;
  buffer = 0;
  matches: UserClass[] = [];
  isShowMessages = false;
  isUserCardOpen = false;

  labels: any = {};
  possMatchDetLists: number[] = [];
  matchProf?: UserClass;
  user: any;
  promotions: Promotions[] = [];
  startUpdUserProf = false;
  isMatchDetailsOpen = false;
  isMatchPlaceHolder = false;
  userProf?: UserClass;
  selectedFiles: File[] = [];
  selectedMessProf?: UserClass;
  options: Options = new Options();
  promoBottomSheetOpen = false;
  promoBottomSheetPromotions: Promotions[] = [];
  promoBottomSheetActiveIndex = 0;
  rewindStack: UserClass[] = [];
  likedByProfiles: UserClass[] = [];

  private readonly maxProfilePictures = 6;

  hasPremiumAccess = false;
  hasRewindCandidate = false;
  freeRewindsRemaining = 0;
  isRewindLocked = false;
  canSuperLike = false;

  canOpenAdminPanelResult = false;

  private loadedDiscoverUid: string | null = null;
  private loadingDiscoverUid: string | null = null;
  private pendingMessageMatchUid: string | null = null;
  private pendingTargetProfileUid: string | null = null;
  private resolvingMessageDeepLink = false;
  private resolvingTargetProfileDeepLink = false;
  private routeQueryParamSubscription?: Subscription;
  private promoBottomSheetQueued = false;
  private promoBottomSheetShownForUid: string | null = null;

  private authStore = inject(AuthStore);
  private analytics = inject(AnalyticsService);
  private profileStore = inject(ProfileStore);
  readonly discoverStore = inject(DiscoverStore);
  private discoverUiStore = inject(DiscoverUiStore);
  readonly matchConversationPreviewsStore = inject(MatchConversationPreviewsStore);
  private matchActionsStore = inject(MatchActionsStore);
  private matchIndexRepository = inject(MatchIndexRepository);
  private likedByRepository = inject(LikedByRepository);
  private onlinePresenceService = inject(OnlinePresenceService);
  private promoStore = inject(PromoStore);
  private dailyUsageStore = inject(DailyUsageStore);
  readonly billingStore = inject(BillingStore);
  private transloco = inject(TranslocoService);
  private modalCtrl = inject(ModalController);
  private config = inject(ConfigService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private locationService = inject(LocationService);
  private alertCtrl = inject(AlertController);
  private discoverRepository = inject(DiscoverRepository);
  private profilePicturesRepository = inject(ProfilePicturesRepository);

  constructor() {
    effect(() => {
      this.user = this.authStore.user();
      this.canOpenAdminPanelResult = this.authStore.canModerate();

      const uid = this.user?.uid ?? null;

      if (!uid) {
        void this.onlinePresenceService.setOffline();
        this.dailyUsageStore.clearDailyUsage();
        this.loadedDiscoverUid = null;
        this.loadingDiscoverUid = null;
        this.promoBottomSheetShownForUid = null;
        this.likedByProfiles = [];
        return;
      }

      queueMicrotask(() => {
        if (this.authStore.user()?.uid === uid) {
          void this.onlinePresenceService.setOnline(uid);
          void this.dailyUsageStore.loadDailyUsage(uid);
          void this.ensureDiscoverData(uid);
        }
      });
    });

    effect(() => {
      this.userProf = this.profileStore.profile() ?? undefined;
      this.matchConversationPreviewsStore.start(this.userProf, this.matches);
      this.schedulePromoBottomSheetCheck();
      this.syncMatchActionState();
    });

    effect(() => {
      this.selectedFiles = this.config.selectedFiles();
    });

    effect(() => {
      this.syncDiscoverState();
    });

    effect(() => {
      this.isUserCardOpen = this.discoverUiStore.isUserCardOpen();
      this.isShowMessages = this.discoverUiStore.isShowMessages();
      this.options.phoneView = this.discoverUiStore.phoneView();

      const selectedMessageProfile =
        this.discoverUiStore.selectedMessageProfile();

      if (
        this.isShowMessages &&
        this.options.phoneView &&
        !selectedMessageProfile
      ) {
        this.options.isSelectedMatch = false;
      }

      if (selectedMessageProfile) {
        this.selectedMessProf = selectedMessageProfile;
      }

      if (this.isShowMessages && !this.selectedMessProf) {
        this.selectedMessProf = this.matches[0];
      }

      this.schedulePromoBottomSheetCheck();
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: KeyboardEvent) {
    this.signOut();
  }

  @HostListener('window:resize')
  handleResize() {
    this.updatePhoneView();
  }

  @HostListener('window:pagehide')
  handlePageHide() {
    void this.onlinePresenceService.setOffline(this.user?.uid ?? this.authStore.user()?.uid);
  }

  async ngOnInit() {
    this.updatePhoneView();
    this.setPromotion();
    this.subscribeToDeepLinkQueryParams();

    await this.ensureDiscoverData(this.authStore.user()?.uid);
  }

  ngOnDestroy() {
    this.routeQueryParamSubscription?.unsubscribe();
    this.matchConversationPreviewsStore.stop();
    this.dailyUsageStore.clearDailyUsage();
    void this.onlinePresenceService.setOffline(this.user?.uid ?? this.authStore.user()?.uid);
  }

  private updatePhoneView() {
    this.discoverUiStore.setPhoneView(window.innerWidth <= 768);
  }

  private async initMainView() {
    await this.setMatchProfiles(this.possibleMatchIds);
    this.setPromotion();
    this.setUProfLabels();
  }

  private async ensureDiscoverData(uid?: string | null) {
    if (!uid || this.loadedDiscoverUid === uid || this.loadingDiscoverUid === uid) {
      return;
    }

    this.loadingDiscoverUid = uid;
    this.resetActiveDiscoverView();

    try {
      await this.discoverStore.loadDiscoverData();

      if (this.authStore.user()?.uid !== uid) {
        return;
      }

      this.syncDiscoverState();
      await this.loadLikedByProfiles(uid);
      await this.initMainView();

      if (!this.discoverStore.error()) {
        this.loadedDiscoverUid = uid;
        this.schedulePromoBottomSheetCheck();
        void this.resolvePendingMessageDeepLink();
        void this.resolvePendingTargetProfileDeepLink();
      }
    } finally {
      if (this.loadingDiscoverUid === uid) {
        this.loadingDiscoverUid = null;
      }
    }
  }

  private resetActiveDiscoverView() {
    this.matchConversationPreviewsStore.stop();
    this.matchProf = undefined;
    this.selectedMessProf = undefined;
    this.matches = [];
    this.possibleMatchIds = [];
    this.matchProfiles = [];
    this.likedByProfiles = [];
    this.possMatchDetLists = [];
    this.isMatchDetailsOpen = false;
    this.isMatchPlaceHolder = false;
    this.progress = 0;
    this.buffer = 0;
    this.promoBottomSheetOpen = false;
    this.promoBottomSheetPromotions = [];
    this.rewindStack = [];
    this.syncMatchActionState();
  }

  private subscribeToDeepLinkQueryParams() {
    this.routeQueryParamSubscription?.unsubscribe();
    this.routeQueryParamSubscription = this.route.queryParamMap.subscribe(
      (params) => {
        const view = params.get('view');
        const matchUid = params.get('matchUid');
        const targetUid = params.get('targetUid');

        if (view === 'messages' && matchUid) {
          this.pendingMessageMatchUid = matchUid;
          void this.resolvePendingMessageDeepLink();
          return;
        }

        if (targetUid) {
          this.pendingTargetProfileUid = targetUid;
          void this.resolvePendingTargetProfileDeepLink();
        }
      }
    );
  }

  private async resolvePendingMessageDeepLink() {
    if (this.resolvingMessageDeepLink || this.loadingDiscoverUid) {
      return;
    }

    const matchUid = this.pendingMessageMatchUid;
    const myUid = this.userProf?.uid ?? this.authStore.user()?.uid;

    if (!matchUid || !myUid) {
      return;
    }

    this.resolvingMessageDeepLink = true;

    try {
      const isKnownMatch = await this.ensureDeepLinkedMatchIsAvailable(
        myUid,
        matchUid
      );

      if (!isKnownMatch) {
        this.pendingMessageMatchUid = null;
        await this.router.navigate(['/amor/discover'], { replaceUrl: true });
        return;
      }

      let match = this.matches.find((matchProfile) => matchProfile.uid === matchUid);

      if (!match) {
        match = await this.discoverRepository.getUserProfile(matchUid);

        if (!match?.uid) {
          return;
        }

        this.matches = this.addMatchLocally(this.matches, match);
        this.discoverStore.addMatch(match);
      }

      this.matchConversationPreviewsStore.start(this.userProf, this.matches);
      this.openMessWithMatch(match);
      this.pendingMessageMatchUid = null;
      await this.router.navigate(['/amor/discover'], { replaceUrl: true });
    } finally {
      this.resolvingMessageDeepLink = false;
    }
  }

  private async resolvePendingTargetProfileDeepLink() {
    if (this.resolvingTargetProfileDeepLink || this.loadingDiscoverUid) {
      return;
    }

    const targetUid = this.pendingTargetProfileUid;

    if (!targetUid || targetUid === this.userProf?.uid) {
      return;
    }

    this.resolvingTargetProfileDeepLink = true;

    try {
      const targetProfile = await this.discoverRepository.getUserProfile(targetUid);

      if (!targetProfile?.uid) {
        return;
      }

      this.options.isSelectedMatch = false;
      this.discoverUiStore.showMatchesCard();
      this.matchProf = targetProfile;
      this.matchProf['index'] = -1;
      this.isMatchPlaceHolder = false;
      this.isMatchDetailsOpen = false;
      this.setUProfLabels();
      this.pendingTargetProfileUid = null;
      await this.router.navigate(['/amor/discover'], { replaceUrl: true });
    } finally {
      this.resolvingTargetProfileDeepLink = false;
    }
  }

  private async ensureDeepLinkedMatchIsAvailable(myUid: string, matchUid: string) {
    const profileMatchUids = this.userProf?.matchParts?.matches ?? [];

    if (
      profileMatchUids.includes(matchUid) ||
      this.matches.some((matchProfile) => matchProfile.uid === matchUid)
    ) {
      return true;
    }

    const latestProfile = await this.discoverRepository.getUserProfile(myUid);
    const latestMatchUids = latestProfile?.matchParts?.matches ?? [];

    if (!latestProfile?.uid || !latestMatchUids.includes(matchUid)) {
      return false;
    }

    this.userProf = latestProfile;
    this.profileStore.setProfile(latestProfile);
    return true;
  }

  private syncDiscoverState() {
    this.possibleMatchIds = this.discoverStore.possibleMatchIds();
    this.progress = this.discoverStore.progress();
    this.buffer = this.discoverStore.buffer();
    this.matches = this.discoverStore.matches();
    this.matchConversationPreviewsStore.start(this.userProf, this.matches);
    this.schedulePromoBottomSheetCheck();
    this.syncMatchActionState();
    void this.resolvePendingMessageDeepLink();
    void this.resolvePendingTargetProfileDeepLink();
  }

  private async loadLikedByProfiles(uid: string) {
    try {
      const profiles = await this.likedByRepository.getProfilesWhoLikedUser(uid);

      this.likedByProfiles = this.filterLikedByProfiles(profiles);
    } catch (error) {
      console.warn('Failed to load profiles who liked the user.', error);
      this.likedByProfiles = [];
    }
  }

  private filterLikedByProfiles(profiles: UserClass[]) {
    const profile = this.userProf ?? this.profileStore.profile() ?? undefined;
    const excludedUids = new Set(
      [
        profile?.uid,
        ...(profile?.matchParts?.matches ?? []),
        ...(profile?.matchParts?.liked ?? []),
        ...(profile?.matchParts?.notLiked ?? []),
        ...(profile?.blockedUsers ?? []),
        ...(profile?.reportedUsers ?? []),
      ].filter((uid): uid is string => typeof uid === 'string' && !!uid)
    );

    return profiles.filter((likedByProfile) => {
      if (!likedByProfile.uid || excludedUids.has(likedByProfile.uid)) {
        return false;
      }

      return (
        likedByProfile.isVisible !== false &&
        likedByProfile.isBanned !== true &&
        isProfileCompleteForDiscovery(likedByProfile)
      );
    });
  }

  private removeLikedByProfile(uid?: string) {
    if (!uid) {
      return;
    }

    this.likedByProfiles = this.likedByProfiles.filter(
      (profile) => profile.uid !== uid
    );
  }

  private syncMatchActionState() {
    this.hasPremiumAccess =
      this.matchActionsStore.hasPremiumAccess(this.userProf);

    this.hasRewindCandidate = this.rewindStack.length > 0;

    this.canSuperLike =
      this.matchActionsStore.canSuperLike(this.userProf, this.user?.uid);

    if (this.hasPremiumAccess) {
      this.freeRewindsRemaining = 0;
      this.isRewindLocked = false;
      return;
    }

    this.freeRewindsRemaining =
      this.matchActionsStore.getFreeRewindsRemaining(
        this.userProf,
        this.user?.uid
      );

    this.isRewindLocked =
      this.matchActionsStore.isRewindLocked(
        this.userProf,
        this.hasRewindCandidate,
        this.user?.uid
      );
  }

  setPromotion() {
    this.promotions = this.config.getPromotions();
  }

  handlePromoBottomSheetDismiss(event: PromoBottomSheetDismissEvent) {
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (uid) {
      this.promoStore.recordDismiss(uid, event.reason);
    }

    this.promoBottomSheetOpen = false;

    if (event.reason === 'cta' && event.promotion) {
      void this.handlePromotionSelected(event.promotion);
    }
  }

  private schedulePromoBottomSheetCheck() {
    if (this.promoBottomSheetQueued) {
      return;
    }

    this.promoBottomSheetQueued = true;

    queueMicrotask(() => {
      this.promoBottomSheetQueued = false;
      this.maybeOpenPromoBottomSheet();
    });
  }

  private maybeOpenPromoBottomSheet() {
    const uid = this.userProf?.uid ?? this.user?.uid;

    const decision = this.promoStore.getBottomSheetDecision({
      uid,
      phoneView: !!this.options.phoneView,
      promotions: this.promotions,
      isOpen: this.promoBottomSheetOpen,
      loadedDiscoverUid: this.loadedDiscoverUid,
      alreadyShownForUid: this.promoBottomSheetShownForUid,
      userProfile: this.userProf,
      possibleMatchIds: this.possibleMatchIds,
      matches: this.matches,
      isMatchPlaceHolder: this.isMatchPlaceHolder,
    });

    if (!decision || !uid) {
      return;
    }

    this.promoBottomSheetPromotions = decision.promotions;
    this.promoBottomSheetActiveIndex = decision.activeIndex;
    this.promoBottomSheetOpen = true;
    this.promoBottomSheetShownForUid = uid;
  }

  private getPromoById(id: string) {
    return this.promotions.find((promotion) => promotion['id'] === id);
  }

  private getRewindPromotion(): Promotions {
    return {
      id: 'rewind',
      title: 'Undo your last pass',
      titleKey: 'promotions.rewind.title',
      category: 'Amorino Gold',
      categoryKey: 'promotions.category.premium',
      eyebrowKey: 'promotions.rewind.eyebrow',
      offerLine: 'Rewind is available with Amorino Gold',
      offerKey: 'promotions.rewind.offer',
      iconName: 'return-up-back-outline',
      accent: '#8a8f98',
      accentSoft: '#f2c76e',
      description: 'Go back to someone you accidentally skipped.',
      descriptionKey: 'promotions.rewind.description',
      ctaKey: 'promotions.rewind.cta',
    };
  }

  private openActionPromoBottomSheet(promotion?: Promotions) {
    if (!promotion) {
      return;
    }

    this.promoBottomSheetPromotions = [promotion];
    this.promoBottomSheetActiveIndex = 0;
    this.promoBottomSheetOpen = true;
  }

  async handlePromotionSelected(promotion: Promotions) {
    if (promotion['id'] === 'profileBoost') {
      await this.activateProfileBoostOrOpenPaywall(promotion);
      return;
    }

    await this.openPaywall(promotion);
  }

  openSeeLikesPaywall() {
    const promotion = this.getPromoById('seeLikes');

    if (promotion) {
      this.openActionPromoBottomSheet(promotion);
      return;
    }

    void this.openPaywall();
  }

  async openPaywall(promotion?: Promotions) {
    void this.analytics.track(this.userProf?.uid ?? this.user?.uid, 'paywall_opened', {
      promotionId: promotion?.['id'] ?? null,
    });

    const modal = await this.modalCtrl.create({
      component: PaywallComponent,
      componentProps: {
        promotionId: promotion?.['id'],
      },
      cssClass: 'paywall-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<{
      purchased?: boolean;
      restored?: boolean;
    }>();

    if (
      promotion?.['id'] === 'profileBoost' &&
      (data?.purchased || data?.restored)
    ) {
      await this.activateProfileBoost();
    }
  }

  private async activateProfileBoostOrOpenPaywall(promotion?: Promotions) {
    if (!this.billingStore.hasProfileBoosts()) {
      await this.openPaywall(promotion);
      return;
    }

    const activated = await this.activateProfileBoost();

    if (!activated) {
      await this.openPaywall(promotion);
    }
  }

  private async activateProfileBoost() {
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (!uid) {
      return false;
    }

    const consumed = await this.billingStore.consumeProfileBoost();

    if (!consumed) {
      return false;
    }

    const boostedUntil = await this.matchIndexRepository.activateProfileBoost(uid);
    await this.dailyUsageStore.incrementDailyUsage(uid, 'boost');
    void this.analytics.track(uid, 'boost_started', {
      boostedUntil: boostedUntil.toISOString(),
      durationMinutes: 30,
    });

    return true;
  }

  setUProfLabels() {
    this.possMatchDetLists = [];
    this.labels = this.config.getLabels(true);
    let isListNumber: number | undefined;

    this.labels.userProfLabels.forEach((label: any) => {
      if (typeof label?.listNum !== 'number' && label?.listNum) {
        isListNumber = label?.listNum(this.matchProf);
        label.listNum = isListNumber;
      }

      if (
        label?.listNum &&
        !this.possMatchDetLists.includes(label?.listNum) &&
        typeof label?.listNum === 'number'
      ) {
        this.possMatchDetLists.push(label?.listNum);
      }

      if (isListNumber && !this.possMatchDetLists.includes(isListNumber)) {
        this.possMatchDetLists.push(isListNumber);
      }
    });
  }

  async setMatchProfiles(matchIds = this.discoverStore.possibleMatchIds()) {
    const possibleMatchIds = Array.isArray(matchIds)
      ? matchIds.filter((uid): uid is string => typeof uid === 'string' && !!uid)
      : [];

    if (this.progress === 100 && !possibleMatchIds.length) {
      this.isMatchPlaceHolder = true;
      this.matchProf = undefined;
      this.matchProfiles = [];
      this.possMatchDetLists = [];
      return;
    }

    if (!possibleMatchIds.length) {
      return;
    }

    const matchProfiles =
      await this.discoverRepository.getMatchProfiles(possibleMatchIds);

    if (matchProfiles.length) {
      this.matchProfiles = matchProfiles;
      this.matchProf = this.matchProfiles[0];
      this.matchProf!['index'] = 0;
      this.isMatchPlaceHolder = false;
      this.setUProfLabels();
      return;
    }

    this.isMatchPlaceHolder = true;
    this.possMatchDetLists = [];
  }

  openLikedByProfile(profile: UserClass) {
    if (!this.billingStore.isPremium()) {
      this.openSeeLikesPaywall();
      return;
    }

    this.options.isSelectedMatch = false;
    this.discoverUiStore.showMatchesCard();
    this.matchProf = profile;
    this.matchProf['index'] = -1;
    this.isMatchPlaceHolder = false;
    this.isMatchDetailsOpen = false;
    this.setUProfLabels();
  }

  changeMatchProf() {
    if (!this.matchProf) return;

    const currentIndex = Number(this.matchProf['index'] ?? 0);
    const nextIndex = currentIndex + 1;

    this.isMatchDetailsOpen = false;

    if (nextIndex < this.matchProfiles.length) {
      this.matchProf = this.matchProfiles[nextIndex];
      this.matchProf!['index'] = nextIndex;
      this.setUProfLabels();
      return;
    }

    this.matchProf = undefined;
    this.possMatchDetLists = [];
    this.isMatchPlaceHolder = true;
  }

  async likeOrDontUser(
    usr: UserClass | undefined,
    isLike?: boolean,
    isDontLike?: boolean
  ) {
    await this.matchActionsStore.likeOrDontUser(
      this.userProf,
      usr,
      isLike,
      isDontLike
    );
  }

  openUserCard() {
    this.options.isSelectedMatch = false;
    this.discoverUiStore.openUserCard();
  }

  showMatchesCard() {
    this.options.isSelectedMatch = false;
    this.discoverUiStore.showMatchesCard();
  }

  showMessages() {
    this.options.isSelectedMatch = false;
    this.discoverUiStore.showMessages(
      this.selectedMessProf ?? this.matches[0] ?? null
    );
  }

  toggleMatchDetails() {
    this.isMatchDetailsOpen = !this.isMatchDetailsOpen;
  }

  closeMatchDetails() {
    this.isMatchDetailsOpen = false;
  }

  async likeCurrentMatch() {
    const likedProfile = this.matchProf;

    await this.likeOrDontUser(likedProfile, true);
    const newMatch = await this.completeMutualMatchIfNeeded(likedProfile);
    this.removeLikedByProfile(likedProfile?.uid);

    this.changeMatchProf();

    if (newMatch) {
      await this.openItsAMatchModal(newMatch);
    }
  }

  async dislikeCurrentMatch() {
    if (this.matchProf?.uid) {
      this.rewindStack = [
        this.matchProf,
        ...this.rewindStack.filter(
          (profile) => profile.uid !== this.matchProf?.uid
        ),
      ].slice(0, 3);
    }

    await this.likeOrDontUser(this.matchProf, false, true);
    this.removeLikedByProfile(this.matchProf?.uid);
    this.changeMatchProf();
    this.syncMatchActionState();
  }

  async rewindCurrentMatch() {
    if (!this.hasRewindCandidate) {
      if (!this.hasPremiumAccess) {
        this.openActionPromoBottomSheet(this.getRewindPromotion());
      }

      return;
    }

    if (this.isRewindLocked) {
      this.openActionPromoBottomSheet(this.getRewindPromotion());
      return;
    }

    const previousMatch = this.rewindStack.shift();

    if (!previousMatch) {
      return;
    }

    await this.matchActionsStore.consumeDailyAction(
      this.userProf,
      'rewind',
      this.user?.uid
    );
    await this.matchActionsStore.restoreRewindCandidate(
      this.userProf,
      previousMatch
    );

    this.matchProf = previousMatch;
    this.matchProf['index'] = Number(previousMatch['index'] ?? 0);
    this.isMatchPlaceHolder = false;
    this.isMatchDetailsOpen = false;
    this.setUProfLabels();
    this.syncMatchActionState();
  }

  async superLikeCurrentMatch() {
    if (!this.matchProf?.uid) {
      return;
    }

    if (!this.canSuperLike) {
      this.openActionPromoBottomSheet(this.getPromoById('superLike'));
      return;
    }

    await this.matchActionsStore.consumeDailyAction(
      this.userProf,
      'super-like',
      this.user?.uid
    );
    const superLikedProfile = this.matchProf;

    await this.matchActionsStore.superLikeUser(this.userProf, superLikedProfile);
    const newMatch = await this.completeMutualMatchIfNeeded(superLikedProfile);

    this.changeMatchProf();
    this.syncMatchActionState();

    if (newMatch) {
      await this.openItsAMatchModal(newMatch);
    }
  }

  private async completeMutualMatchIfNeeded(
    likedProfile?: UserClass
  ): Promise<UserClass | null> {
    if (!this.userProf?.uid || !likedProfile?.uid) {
      return null;
    }

    const latestLikedProfile = await this.discoverRepository.getUserProfile(
      likedProfile.uid
    );

    if (!latestLikedProfile?.uid) {
      return null;
    }

    const myMatchParts = this.ensureMatchParts(this.userProf);
    const likedMatchParts = this.ensureMatchParts(latestLikedProfile);
    const likedBack = likedMatchParts.liked.includes(this.userProf.uid);
    const alreadyMatched =
      myMatchParts.matches.includes(latestLikedProfile.uid) ||
      likedMatchParts.matches.includes(this.userProf.uid);

    if (!likedBack || alreadyMatched) {
      return null;
    }

    const matchResult = await this.discoverRepository.createMutualMatch(
      latestLikedProfile.uid
    );

    if (!matchResult.created) {
      return null;
    }

    if (matchResult.matchParts) {
      this.userProf.matchParts = matchResult.matchParts;
    }

    this.profileStore.setProfile(this.userProf);
    this.discoverStore.addMatch(latestLikedProfile);
    this.matches = this.addMatchLocally(this.matches, latestLikedProfile);

    void this.analytics.track(this.userProf.uid, 'match_created', {
      matchUid: latestLikedProfile.uid,
    });

    return latestLikedProfile;
  }

  private async openItsAMatchModal(matchProfile: UserClass) {
    const modal = await this.modalCtrl.create({
      component: ItsAMatchModalComponent,
      componentProps: {
        userProfile: this.userProf,
        matchProfile,
      },
      cssClass: 'its-a-match-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss<{ action?: string }>();

    if (data?.action === 'message') {
      this.openMessWithMatch(matchProfile);
    }
  }

  private ensureMatchParts(profile: UserClass) {
    profile.matchParts ??= {
      matches: [],
      possMatches: [],
      liked: [],
      notLiked: [],
      superLiked: [],
    };
    profile.matchParts.matches ??= [];
    profile.matchParts.possMatches ??= [];
    profile.matchParts.liked ??= [];
    profile.matchParts.notLiked ??= [];
    profile.matchParts.superLiked ??= [];

    return profile.matchParts;
  }

  private addMatchLocally(matches: UserClass[], matchProfile: UserClass) {
    if (!matchProfile.uid) {
      return matches;
    }

    return [
      ...matches.filter((match) => match.uid !== matchProfile.uid),
      matchProfile,
    ];
  }

  async showProfPics(i: number) {
    const modal = await this.modalCtrl.create({
      component: IonModalPage,
      componentProps: { myPhotos: this.userProf?.pictures, chosenIndex: i },
    });
    await modal.present();
  }

  openMessWithMatch(match: UserClass) {
    this.selectedMessProf = match;
    this.options.isSelectedMatch = true;
    this.discoverUiStore.showMessages(match);
  }

  handleMessageSent(event: { matchProfile: UserClass; message: Message }) {
    const matchUid = event.matchProfile.uid;

    if (!matchUid) {
      return;
    }

    const existingPreview =
      this.matchConversationPreviewsStore.previews()[matchUid];

    this.matchConversationPreviewsStore.upsertPreview(matchUid, {
      hasMessages: true,
      isLastMessageMine: event.message.senderUid === this.userProf?.uid,
      lastMessage: event.message.message.trim(),
      unreadCount: existingPreview?.unreadCount ?? 0,
    });
  }

  handleMatchRemoved(matchProfile: UserClass) {
    const matchUid = matchProfile.uid;

    if (!matchUid) {
      return;
    }

    const remainingMatches = this.matches.filter(
      (match) => match.uid !== matchUid
    );

    this.matches = remainingMatches;
    this.discoverStore.removeMatch(matchUid);

    this.matchConversationPreviewsStore.removePreview(matchUid);

    if (this.selectedMessProf?.uid !== matchUid) {
      return;
    }

    const nextSelectedMatch = remainingMatches[0];

    if (nextSelectedMatch) {
      this.selectedMessProf = nextSelectedMatch;
      this.discoverUiStore.showMessages(nextSelectedMatch);
      this.options.isSelectedMatch = !this.options.phoneView;
      return;
    }

    this.selectedMessProf = undefined;
    this.options.isSelectedMatch = false;
    this.discoverUiStore.showMessages(null);
  }

  startUpdateUserProf() {
    this.startUpdUserProf = true;
  }

  async updateUserProf() {
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (!uid || !this.userProf || !this.hasRequiredProfilePictures()) {
      return;
    }

    const userProf = {
      ...this.userProf,
      uid,
    } as Partial<UserClass> & { uid: string };

    const profileSaved = await this.profileStore.updateProfile(uid, userProf);

    if (!profileSaved) {
      return;
    }

    void this.analytics.track(uid, 'profile_updated', {
      completionPercent: this.getProfileCompletionPercent(userProf),
    });

    if (this.getProfileCompletionPercent(userProf) >= 80) {
      void this.analytics.track(uid, 'profile_completed', {
        completionPercent: this.getProfileCompletionPercent(userProf),
      });
    }

    this.startUpdUserProf = false;
    this.discoverUiStore.showMatchesCard();
    this.loadedDiscoverUid = null;
    this.discoverStore.clearDiscoverData();
    this.resetActiveDiscoverView();

    try {
      const claims = await this.buildClaimsFromProfile(userProf);
      await this.authStore.setCustomClaims(uid, claims);
    } catch (error) {
      console.warn('Profile was saved, but claim refresh failed.', error);
    }

    await this.ensureDiscoverData(uid);
  }

  getProfileCompletionPercent(profile: Partial<UserClass>) {
    return getProfileCompleteness(profile);
  }

  isProfileReadyForDiscovery(profile?: Partial<UserClass> | null) {
    return isProfileCompleteForDiscovery(profile);
  }

  startProfileOnboarding() {
    this.startUpdUserProf = true;
    this.openUserCard();
  }

  private async buildClaimsFromProfile(
    userProf: Partial<UserClass>
  ): Promise<UserClaims> {
    let currentLocCoords = userProf.currentLocCoords;

    try {
      const currentPosition = await this.locationService.getLocation();

      currentLocCoords = {
        lat: currentPosition.coords.latitude,
        lon: currentPosition.coords.longitude,
      };
    } catch (error) {
      console.warn('Skipping profile claim location refresh.', error);
    }

    return {
      gender: userProf.gender,
      lookingForGender: userProf.lookingForGender,
      lookingForAge: userProf.lookingForAge,
      lookingForDistance: userProf.lookingForDistance,
      currentLocCoords,
      currentPlace: userProf.currentPlace ?? '',
    };
  }

  async deleteUserProf() {
    if (this.userProf?.uid) {
      await this.profileStore.deleteProfile(this.userProf.uid);
      this.profileStore.clearProfile();
      await this.authStore.deleteUser();
      this.authStore.setAutoFillEmail(undefined);
      this.authStore.clearUsers();
      this.discoverStore.clearDiscoverData();
      this.discoverUiStore.reset();
      this.router.navigate(['/amor/register']);
    }
  }

  async confirmDeleteUserProf() {
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('profile.deleteConfirm.title'),
      message: this.transloco.translate('profile.deleteConfirm.message'),
      cssClass: 'delete-profile-alert',
      buttons: [
        {
          text: this.transloco.translate('common.cancel'),
          role: 'cancel',
          cssClass: 'delete-profile-alert-cancel-button',
        },
        {
          text: this.transloco.translate('profile.deleteConfirm.confirm'),
          role: 'destructive',
          handler: () => this.deleteUserProf(),
          cssClass: 'delete-profile-alert-confirm-button',
        },
      ],
    });

    await alert.present();
  }

  onSelectChoices(eventObj: any, labelKey: any) {
    const { value } = eventObj.detail;
    const { checked: isChecked } = eventObj.detail;
    let isDeletedArrEl = false;

    if (this.userProf) {
      if (this.userProf[labelKey]?.length) {
        if (!isChecked && this.userProf[labelKey]?.includes(value.value)) {
          const alreadyInArrInd = this.userProf[labelKey].findIndex(
            (act: any) => act === value.value
          );
          this.userProf[labelKey].splice(alreadyInArrInd, 1);
          isDeletedArrEl = true;
        }

        if (isChecked) {
          this.userProf[labelKey].push(value.value);
        }
      }

      if (!this.userProf[labelKey]?.length && !isDeletedArrEl) {
        this.userProf![labelKey] = [value.value];
      }
    }
  }

  private hasRequiredProfilePictures() {
    return (this.userProf?.pictures?.length ?? 0) >= 1;
  }

  private normalizeProfilePictures(pictures: ProfilePicture[] = []) {
    return pictures
      .filter((picture) => !!picture?.url && !!picture?.name)
      .slice(0, this.maxProfilePictures);
  }

  private async persistProfilePictures(
    pictures: ProfilePicture[],
    preferredPrimaryUrl?: string
  ) {
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (!uid || !this.userProf) {
      return false;
    }

    const normalizedPictures = this.normalizeProfilePictures(pictures);

    if (!normalizedPictures.length) {
      return false;
    }

    const primaryPicture = normalizedPictures.some(
      (picture) => picture.url === preferredPrimaryUrl
    )
      ? preferredPrimaryUrl
      : normalizedPictures[0]?.url;

    this.userProf.pictures = normalizedPictures;
    this.userProf.profilePicture = primaryPicture;

    const profileSaved = await this.profileStore.updateProfile(uid, {
      pictures: normalizedPictures,
      profilePicture: primaryPicture,
    });

    if (!profileSaved) {
      return false;
    }

    this.userProf = this.profileStore.profile() ?? this.userProf;
    return true;
  }

  async savePictures() {
    if (!this.userProf?.uid || !this.selectedFiles.length) {
      return;
    }

    const availableSlots = Math.max(
      this.maxProfilePictures - (this.userProf.pictures?.length ?? 0),
      0
    );

    if (availableSlots <= 0) {
      this.config.clearSelectedFiles();
      return;
    }

    const updatedProfile = await this.profilePicturesRepository.addPictures(
      this.userProf.uid,
      this.userProf,
      this.selectedFiles.slice(0, availableSlots)
    );

    await this.persistProfilePictures(
      updatedProfile.pictures ?? [],
      updatedProfile.profilePicture
    );

    this.config.clearSelectedFiles();
  }

  async reorderProfilePhotos(event: { fromIndex: number; toIndex: number }) {
    if (!this.userProf?.pictures?.length) {
      return;
    }

    const pictures = this.normalizeProfilePictures(this.userProf.pictures);

    if (
      event.fromIndex < 0 ||
      event.toIndex < 0 ||
      event.fromIndex >= pictures.length ||
      event.toIndex >= pictures.length ||
      event.fromIndex === event.toIndex
    ) {
      return;
    }

    const reorderedPictures = [...pictures];
    const [movedPicture] = reorderedPictures.splice(event.fromIndex, 1);

    if (!movedPicture) {
      return;
    }

    reorderedPictures.splice(event.toIndex, 0, movedPicture);

    await this.persistProfilePictures(
      reorderedPictures,
      this.userProf.profilePicture
    );
  }

  async selectPrimaryProfilePhoto(index: number) {
    const pictures = this.normalizeProfilePictures(this.userProf?.pictures ?? []);
    const selectedPicture = pictures[index];

    if (!selectedPicture) {
      return;
    }

    await this.persistProfilePictures(pictures, selectedPicture.url);
  }

  async deleteProfilePhoto(index: number) {
    const pictures = this.normalizeProfilePictures(this.userProf?.pictures ?? []);

    if (!this.userProf?.uid || pictures.length <= 1 || index < 0 || index >= pictures.length) {
      return;
    }

    const removedPicture = pictures[index];

    if (!removedPicture) {
      return;
    }

    const remainingPictures = pictures.filter((_, pictureIndex) => pictureIndex !== index);
    const nextPrimaryPicture =
      this.userProf.profilePicture === removedPicture.url
        ? remainingPictures[0]?.url
        : this.userProf.profilePicture;

    try {
      await this.profilePicturesRepository.deleteFilesFromStorage(
        `pictures/${this.userProf.uid}`,
        removedPicture.name
      );
    } catch (error) {
      console.warn('Failed to delete profile picture from storage', error);
    }

    await this.persistProfilePictures(remainingPictures, nextPrimaryPicture);
  }

  handleChoiceSelected(choice: ProfileChoiceSelectedEvent) {
    this.onSelectChoices(choice.event, choice.labelKey);
  }

  async signOutAlert() {
    const alert = await this.alertCtrl.create({
      header: this.transloco.translate('auth.signOut.title'),
      message: this.transloco.translate('auth.signOut.message'),
      cssClass: 'signout-alert',
      buttons: [
        {
          text: this.transloco.translate('auth.signOut.confirm'),
          role: 'confirm',
          handler: () => this.signOut(),
          cssClass: 'signout-alert-button',
        },
        {
          text: this.transloco.translate('common.cancel'),
          role: 'cancel',
          cssClass: 'signout-alert-cancel-button',
        },
      ],
    });
    await alert.present();
  }

  async signOut() {
    const autoFillEmail = this.userProf?.email;

    await this.onlinePresenceService.setOffline(this.user?.uid ?? this.authStore.user()?.uid);
    await this.authStore.signOut();
    this.authStore.setAutoFillEmail(autoFillEmail);
    this.profileStore.clearProfile();
    this.discoverStore.clearDiscoverData();
    this.discoverUiStore.reset();

    this.user = null;
    this.userProf = undefined;
    this.matchProf = undefined;
    this.selectedMessProf = undefined;
    this.matches = [];
    this.possibleMatchIds = [];
    this.matchProfiles = [];
    this.isMatchPlaceHolder = false;
    this.isShowMessages = false;
    this.possMatchDetLists = [];
    this.matchConversationPreviewsStore.stop();
    this.loadedDiscoverUid = null;
    this.loadingDiscoverUid = null;
    this.promoBottomSheetShownForUid = null;
    this.router.navigate(['/amor/login']);
  }
}
