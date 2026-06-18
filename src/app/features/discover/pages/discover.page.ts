import {
  Component,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewEncapsulation,
  effect,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Auth } from '@angular/fire/auth';
import {
  IonCard,
  IonCol,
  IonContent,
  IonGrid,
  IonRow,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';

import { IonModalPage } from '../../../modals/ion-modal/ion-modal.page';
import { ConfigService } from '../../../services/config.service';
import { MessageComponent } from '../../messages/ui/message/message.component';
import { AuthStore } from '../../auth/store/auth.store';
import { AnalyticsService } from '../../analytics/data-access/analytics.service';
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
import { Options } from '../../../shared/models/options.model';
import { Promotions } from '../../../shared/models/promotions.model';
import { PublicProfile } from '../../../shared/models/public-profile.model';
import { UserClass } from '../../../shared/models/user.model';
import { Message } from '../../../shared/models/message.model';
import { MatchConversationPreviewsStore } from '../../messages/store/match-conversation-previews.store';
import { MatchActionsStore } from '../../matching/store/match-actions.store';
import { type MatchActionResponse } from '../../matching/data-access/match-actions.repository';
import {
  DiscoveryFeedMode,
  DiscoveryPremiumFilters,
} from '../../matching/data-access/match-index.repository';
import { PromoStore } from '../../promotions/store/promo.store';
import { ItsAMatchModalComponent } from '../ui/its-a-match-modal/its-a-match-modal.component';
import { BillingFacade } from '../facades/billing.facade';
import { ChatFacade } from '../facades/chat.facade';
import { DiscoverFacade } from '../facades/discover.facade';
import { PresenceFacade } from '../facades/presence.facade';
import { ProfileEditorFacade } from '../facades/profile-editor.facade';
import { PictureUploadState } from '../../profile/data-access/profile-pictures.repository';

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
  matchProfiles: PublicProfile[] = [];
  progress = 0;
  buffer = 0;
  matches: PublicProfile[] = [];
  isShowMessages = false;
  isUserCardOpen = false;

  labels: any = {};
  possMatchDetLists: number[] = [];
  matchProf?: PublicProfile;
  user: any;
  promotions: Promotions[] = [];
  startUpdUserProf = false;
  isMatchDetailsOpen = false;
  isMatchPlaceHolder = false;
  userProf?: UserClass;
  selectedFiles: File[] = [];
  selectedMessProf?: PublicProfile;
  options: Options = new Options();
  promoBottomSheetOpen = false;
  promoBottomSheetPromotions: Promotions[] = [];
  promoBottomSheetActiveIndex = 0;
  rewindStack: PublicProfile[] = [];
  likedByProfiles: PublicProfile[] = [];
  discoveryFeedMode: DiscoveryFeedMode = 'recommended';
  premiumDiscoveryFilters: DiscoveryPremiumFilters = {};
  isLoadingMoreCandidates = false;
  verificationSubmitting = false;
  pictureUploadState: PictureUploadState = { phase: 'idle' };
  hideProfileSaveButton = false;
  isRequestingLocationPermission = false;

  readonly discoveryFeedModes: Array<{
    mode: DiscoveryFeedMode;
    labelKey: string;
  }> = [
      { mode: 'recommended', labelKey: 'discover.feed.recommended' },
      { mode: 'nearby', labelKey: 'discover.feed.nearby' },
      { mode: 'recentlyActive', labelKey: 'discover.feed.recentlyActive' },
      { mode: 'newProfiles', labelKey: 'discover.feed.newProfiles' },
    ];

  readonly premiumDiscoveryFilterButtons: Array<{
    key: keyof DiscoveryPremiumFilters;
    labelKey: string;
    value: number | boolean;
  }> = [
      {
        key: 'maxDistanceKm',
        labelKey: 'discover.feed.filters.closeRange',
        value: 25,
      },
      {
        key: 'recentlyActiveOnly',
        labelKey: 'discover.feed.filters.active',
        value: true,
      },
      {
        key: 'verifiedOnly',
        labelKey: 'discover.feed.filters.verified',
        value: true,
      },
      {
        key: 'minSharedInterests',
        labelKey: 'discover.feed.filters.sharedInterests',
        value: 2,
      },
    ];

  hasPremiumAccess = false;
  hasRewindCandidate = false;
  freeRewindsRemaining = 0;
  isRewindLocked = false;
  canSuperLike = false;
  profileBoostedUntil: unknown = null;
  boostCountdownNow = Date.now();

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
  private boostCountdownInterval: ReturnType<typeof setInterval> | null = null;
  private adminAccessCheckedUid: string | null = null;
  private loadedMatchProfileUids = new Set<string>();

  private authStore = inject(AuthStore);
  private firebaseAuth = inject(Auth);
  private analytics = inject(AnalyticsService);
  private billingFacade = inject(BillingFacade);
  private chatFacade = inject(ChatFacade);
  private discoverFacade = inject(DiscoverFacade);
  private presenceFacade = inject(PresenceFacade);
  private profileEditorFacade = inject(ProfileEditorFacade);
  readonly billingStore = this.billingFacade.store;
  readonly discoverStore = this.discoverFacade.store;
  private discoverUiStore = this.chatFacade.uiStore;
  readonly matchConversationPreviewsStore = inject(MatchConversationPreviewsStore);
  private matchActionsStore = inject(MatchActionsStore);
  private promoStore = inject(PromoStore);
  private modalCtrl = inject(ModalController);
  private config = inject(ConfigService);
  private document = inject(DOCUMENT);

  constructor() {
    effect(() => {
      this.user = this.authStore.user();
      const canModerate = this.authStore.canModerate();
      this.canOpenAdminPanelResult = canModerate;

      const uid = this.user?.uid ?? null;

      if (!uid) {
        void this.presenceFacade.setOffline();
        this.billingFacade.clearDailyUsage();
        this.loadedDiscoverUid = null;
        this.loadingDiscoverUid = null;
        this.promoBottomSheetShownForUid = null;
        this.likedByProfiles = [];
        this.profileBoostedUntil = null;
        this.adminAccessCheckedUid = null;
        this.stopBoostCountdownTimer();
        return;
      }

      if (!canModerate && this.adminAccessCheckedUid !== uid) {
        this.adminAccessCheckedUid = uid;
        void this.refreshAdminAccessFromToken(uid);
      }

      queueMicrotask(() => {
        if (this.authStore.user()?.uid === uid) {
          void this.presenceFacade.setOnline(uid);
          void this.billingFacade.loadDailyUsage(uid);
          void this.ensureDiscoverData(uid);
        }
      });
    });

    effect(() => {
      this.userProf = this.profileEditorFacade.profile() ?? undefined;
      this.matchConversationPreviewsStore.start(this.userProf, this.matches);
      this.schedulePromoBottomSheetCheck();
      this.syncMatchActionState();
    });

    effect(() => {
      this.selectedFiles = this.profileEditorFacade.selectedFiles();
      this.pictureUploadState = this.profileEditorFacade.pictureUploadState();
    });

    effect(() => {
      this.syncDiscoverState();
    });

    effect(() => {
      this.isUserCardOpen = this.discoverUiStore.isUserCardOpen();
      this.isShowMessages = this.discoverUiStore.isShowMessages();
      this.options.phoneView = this.discoverUiStore.phoneView();
      this.syncMobilePromoSheetState();
      this.syncMobileDiscoverViewState();

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

  @HostListener('window:resize')
  handleResize() {
    this.updatePhoneView();
  }

  @HostListener('window:pagehide')
  handlePageHide() {
    void this.presenceFacade.setOffline(this.user?.uid ?? this.authStore.user()?.uid);
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
    this.billingFacade.clearDailyUsage();
    this.stopBoostCountdownTimer();
    this.document.body.classList.remove('is-mobile-promo-sheet-open');
    this.document.body.classList.remove('is-mobile-discover-view');
    void this.presenceFacade.setOffline(this.user?.uid ?? this.authStore.user()?.uid);
  }

  private updatePhoneView() {
    this.chatFacade.setPhoneView(window.innerWidth <= 768);
  }

  private syncMobileDiscoverViewState() {
    this.document.body.classList.toggle(
      'is-mobile-discover-view',
      !!this.options.phoneView && !this.isShowMessages && !this.isUserCardOpen
    );
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
      await this.discoverFacade.loadDiscoverData();

      if (this.authStore.user()?.uid !== uid) {
        return;
      }

      this.syncDiscoverState();
      await this.loadLikedByProfiles(uid);
      await this.loadActiveProfileBoost(uid);
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
    this.loadedMatchProfileUids.clear();
    this.likedByProfiles = [];
    this.possMatchDetLists = [];
    this.isMatchDetailsOpen = false;
    this.isMatchPlaceHolder = false;
    this.progress = 0;
    this.buffer = 0;
    this.setPromoBottomSheetOpen(false);
    this.promoBottomSheetPromotions = [];
    this.rewindStack = [];
    this.syncMatchActionState();
  }

  private setPromoBottomSheetOpen(isOpen: boolean) {
    this.promoBottomSheetOpen = isOpen;
    this.syncMobilePromoSheetState();
  }

  private syncMobilePromoSheetState() {
    this.document.body.classList.toggle(
      'is-mobile-promo-sheet-open',
      this.promoBottomSheetOpen && !!this.options.phoneView
    );
  }

  private subscribeToDeepLinkQueryParams() {
    this.routeQueryParamSubscription?.unsubscribe();
    this.routeQueryParamSubscription = this.chatFacade.listenForDeepLinks({
      messageMatchUid: (matchUid) => {
        this.pendingMessageMatchUid = matchUid;
        void this.resolvePendingMessageDeepLink();
      },
      targetProfileUid: (targetUid) => {
        this.pendingTargetProfileUid = targetUid;
        void this.resolvePendingTargetProfileDeepLink();
      },
    });
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
        await this.chatFacade.clearDiscoverDeepLink();
        return;
      }

      let match = this.matches.find((matchProfile) => matchProfile.uid === matchUid);

      if (!match) {
        match = await this.discoverFacade.getPossibleMatchProfile(matchUid);

        if (!match?.uid) {
          return;
        }

        this.matches = this.addMatchLocally(this.matches, match);
        this.discoverFacade.addMatch(match);
      }

      this.matchConversationPreviewsStore.start(this.userProf, this.matches);
      this.openMessWithMatch(match);
      this.pendingMessageMatchUid = null;
      await this.chatFacade.clearDiscoverDeepLink();
    } finally {
      this.resolvingMessageDeepLink = false;
    }
  }

  private async resolvePendingTargetProfileDeepLink() {
    if (this.resolvingTargetProfileDeepLink || this.loadingDiscoverUid) {
      return;
    }

    const targetUid = this.pendingTargetProfileUid;
    const myUid = this.userProf?.uid ?? this.authStore.user()?.uid;

    if (!targetUid || targetUid === this.userProf?.uid || !myUid) {
      return;
    }

    this.resolvingTargetProfileDeepLink = true;

    try {
      const isAlreadyMatch = await this.ensureDeepLinkedMatchIsAvailable(
        myUid,
        targetUid
      );

      if (isAlreadyMatch) {
        let match = this.matches.find(
          (matchProfile) => matchProfile.uid === targetUid
        );

        if (!match) {
          match = await this.discoverFacade.getPossibleMatchProfile(targetUid);

          if (match?.uid) {
            this.matches = this.addMatchLocally(this.matches, match);
            this.discoverFacade.addMatch(match);
          }
        }

        if (match?.uid) {
          this.removeCandidateLocally(targetUid);
          this.matchConversationPreviewsStore.start(this.userProf, this.matches);
          this.openMessWithMatch(match);
        }

        this.pendingTargetProfileUid = null;
        await this.chatFacade.clearDiscoverDeepLink();
        return;
      }
      const targetProfile =
        await this.discoverFacade.getPossibleMatchProfile(targetUid);

      if (!targetProfile?.uid) {
        return;
      }

      this.options.isSelectedMatch = false;
      this.chatFacade.showMatchesCard();
      this.matchProf = targetProfile;
      this.matchProf['index'] = -1;
      this.isMatchPlaceHolder = false;
      this.isMatchDetailsOpen = false;
      this.setUProfLabels();
      this.pendingTargetProfileUid = null;
      await this.chatFacade.clearDiscoverDeepLink();
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

    const latestProfile = await this.discoverFacade.getUserProfile(myUid);
    const latestMatchUids = latestProfile?.matchParts?.matches ?? [];

    if (!latestProfile?.uid || !latestMatchUids.includes(matchUid)) {
      return false;
    }

    this.userProf = latestProfile;
    this.profileEditorFacade.setProfile(latestProfile);
    return true;
  }

  private syncDiscoverState() {
    this.possibleMatchIds = this.discoverStore.possibleMatchIds();
    this.progress = this.discoverStore.progress();
    this.buffer = this.discoverStore.buffer();
    this.matches = this.discoverStore.matches();
    this.discoveryFeedMode = this.discoverStore.feedMode();
    this.premiumDiscoveryFilters = this.discoverStore.premiumFilters();
    this.isLoadingMoreCandidates = this.discoverStore.loadingMoreCandidates();
    this.matchConversationPreviewsStore.start(this.userProf, this.matches);
    this.schedulePromoBottomSheetCheck();
    this.syncMatchActionState();
    void this.resolvePendingMessageDeepLink();
    void this.resolvePendingTargetProfileDeepLink();
  }

  private async refreshAdminAccessFromToken(uid: string) {
    try {
      const tokenResult = await this.firebaseAuth.currentUser?.getIdTokenResult(true);
      const hasAdminAccess =
        tokenResult?.claims?.['admin'] === true ||
        tokenResult?.claims?.['moderator'] === true;

      if (!hasAdminAccess || this.authStore.user()?.uid !== uid) {
        return;
      }

      const currentUser = this.authStore.user();

      this.canOpenAdminPanelResult = true;

      if (!currentUser) {
        return;
      }

      this.authStore.setUser({
        ...currentUser,
        claims: {
          ...(currentUser.claims ?? {}),
          ...(tokenResult.claims['admin'] === true ? { admin: true } : {}),
          ...(tokenResult.claims['moderator'] === true ? { moderator: true } : {}),
        },
      });
    } catch (error) {
      console.warn('Admin token claims could not be refreshed.', error);
    }
  }

  private async loadLikedByProfiles(uid: string) {
    const profiles = await this.discoverFacade.getProfilesWhoLikedUser(uid);

    this.likedByProfiles = this.filterLikedByProfiles(profiles);
  }

  private async loadActiveProfileBoost(uid: string) {
    this.profileBoostedUntil = await this.billingFacade.loadActiveProfileBoost(uid);
    this.syncBoostCountdownTimer();
  }

  isProfileBoostActive() {
    return this.billingFacade.isProfileBoostActive(
      this.profileBoostedUntil,
      this.boostCountdownNow
    );
  }

  profileBoostMinutesLeft() {
    return this.billingFacade.profileBoostMinutesLeft(
      this.profileBoostedUntil,
      this.boostCountdownNow
    );
  }

  private filterLikedByProfiles(profiles: PublicProfile[]) {
    const profile = this.userProf ?? this.profileEditorFacade.profile() ?? undefined;
    const excludedUids = new Set(
      [
        profile?.uid,
        ...(profile?.matchParts?.matches ?? []),
        ...this.matches.map((match) => match.uid),
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

      return likedByProfile.profileCompleted !== false;
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

  private syncBoostCountdownTimer() {
    this.boostCountdownNow = Date.now();

    if (!this.isProfileBoostActive()) {
      this.stopBoostCountdownTimer();
      return;
    }

    if (this.boostCountdownInterval) {
      return;
    }

    this.boostCountdownInterval = setInterval(() => {
      this.boostCountdownNow = Date.now();

      if (!this.isProfileBoostActive()) {
        this.stopBoostCountdownTimer();
      }
    }, 1000);
  }

  private stopBoostCountdownTimer() {
    if (!this.boostCountdownInterval) {
      return;
    }

    clearInterval(this.boostCountdownInterval);
    this.boostCountdownInterval = null;
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

    this.setPromoBottomSheetOpen(false);

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
      incomingLikeCount: this.likedByProfiles.length,
      isMatchPlaceHolder: this.isMatchPlaceHolder,
    });

    if (!decision || !uid) {
      return;
    }

    this.promoBottomSheetPromotions = decision.promotions;
    this.promoBottomSheetActiveIndex = decision.activeIndex;
    this.setPromoBottomSheetOpen(true);
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
    this.setPromoBottomSheetOpen(true);
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

  openReadReceiptsPremiumPromotion() {
    const promotion = this.getPromoById('amorinoGold');

    if (promotion) {
      this.openActionPromoBottomSheet(promotion);
      return;
    }

    void this.openPaywall();
  }

  async openPaywall(promotion?: Promotions) {
    const data = await this.billingFacade.openPaywall(
      this.userProf?.uid ?? this.user?.uid,
      promotion
    );

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

    const boostedUntil = await this.billingFacade.activateProfileBoost(uid);

    if (!boostedUntil) {
      return false;
    }

    this.profileBoostedUntil = boostedUntil.toISOString();
    this.syncBoostCountdownTimer();
    return true;
  }

  private async canUseDailyLike(uid: string, likeLimit: number) {
    return this.billingFacade.canUseDailyLike(uid, likeLimit);
  }

  private getDailyLikeLimit() {
    return this.billingFacade.getDailyLikeLimit();
  }

  private openDailyLikeLimitPromotion() {
    const promotion = this.isFirstMonthPremiumActive()
      ? this.getPromoById('amorinoGold')
      : this.getPromoById('firstMonth') ?? this.getPromoById('amorinoGold');

    if (promotion) {
      this.openActionPromoBottomSheet(promotion);
      return;
    }

    void this.openPaywall();
  }

  private isFirstMonthPremiumActive() {
    return this.billingFacade.isFirstMonthPremiumActive();
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
      if (await this.loadMoreMatchProfiles()) {
        return;
      }

      this.isMatchPlaceHolder = true;
      this.matchProf = undefined;
      this.matchProfiles = [];
      this.possMatchDetLists = [];
      return;
    }

    if (!possibleMatchIds.length) {
      return;
    }

    const matchProfiles = this.withCandidateSummaries(
      await this.discoverFacade.getMatchProfiles(possibleMatchIds)
    );

    if (matchProfiles.length) {
      this.matchProfiles = matchProfiles;
      this.loadedMatchProfileUids = new Set(
        matchProfiles
          .map((profile) => profile.uid)
          .filter((uid): uid is string => typeof uid === 'string' && !!uid)
      );
      this.matchProf = this.matchProfiles[0];
      this.matchProf!['index'] = 0;
      this.isMatchPlaceHolder = false;
      this.setUProfLabels();
      return;
    }

    this.isMatchPlaceHolder = true;
    this.possMatchDetLists = [];
  }

  async setDiscoveryFeedMode(feedMode: DiscoveryFeedMode) {
    if (this.discoveryFeedMode === feedMode) {
      return;
    }

    this.discoveryFeedMode = feedMode;
    this.discoverStore.setFeedMode(feedMode);
    await this.reloadDiscoveryFeed();
  }

  async togglePremiumDiscoveryFilter(
    filter: (typeof this.premiumDiscoveryFilterButtons)[number]
  ) {
    if (!this.billingStore.isPremium()) {
      this.openActionPromoBottomSheet(this.getPromoById('amorinoGold'));
      return;
    }

    const currentValue = this.premiumDiscoveryFilters[filter.key];
    const isEnabled = currentValue === filter.value;
    const nextFilters: DiscoveryPremiumFilters = {
      ...this.premiumDiscoveryFilters,
      [filter.key]: isEnabled ? undefined : filter.value,
    };

    Object.keys(nextFilters).forEach((key) => {
      const filterKey = key as keyof DiscoveryPremiumFilters;

      if (nextFilters[filterKey] === undefined) {
        delete nextFilters[filterKey];
      }
    });

    this.premiumDiscoveryFilters = nextFilters;
    this.discoverStore.setPremiumFilters(nextFilters);
    await this.reloadDiscoveryFeed();
  }

  isPremiumDiscoveryFilterActive(
    filter: (typeof this.premiumDiscoveryFilterButtons)[number]
  ) {
    return this.premiumDiscoveryFilters[filter.key] === filter.value;
  }

  private async reloadDiscoveryFeed() {
    const uid = this.authStore.user()?.uid;

    if (!uid) {
      return;
    }

    this.loadedDiscoverUid = null;
    this.loadingDiscoverUid = null;
    this.loadedMatchProfileUids.clear();
    this.resetActiveDiscoverView();
    await this.ensureDiscoverData(uid);
  }

  async requestLocationFromFallback() {
    if (this.isRequestingLocationPermission) {
      return;
    }

    this.isRequestingLocationPermission = true;

    try {
      await this.reloadDiscoveryFeed();
    } finally {
      this.isRequestingLocationPermission = false;
    }
  }

  private async loadMoreMatchProfiles() {
    if (this.isLoadingMoreCandidates) {
      return false;
    }

    if (!this.discoverStore.candidateHasMore()) {
      return false;
    }

    this.isLoadingMoreCandidates = true;

    try {
      let hasNewCandidates = false;
      let newMatchIds: string[] = [];

      for (let attempt = 0; attempt < 3; attempt++) {
        hasNewCandidates = await this.discoverFacade.loadMoreCandidates();
        this.syncDiscoverState();

        newMatchIds = this.discoverStore
          .possibleMatchIds()
          .filter((uid) => !this.loadedMatchProfileUids.has(uid));

        if (hasNewCandidates && newMatchIds.length) {
          break;
        }

        if (!this.discoverStore.candidateHasMore()) {
          break;
        }
      }

      if (!hasNewCandidates || !newMatchIds.length) {
        return false;
      }

      const newProfiles = this.withCandidateSummaries(
        await this.discoverFacade.getMatchProfiles(newMatchIds)
      );

      newProfiles.forEach((profile) => {
        if (profile.uid) {
          this.loadedMatchProfileUids.add(profile.uid);
        }
      });

      this.matchProfiles = [...this.matchProfiles, ...newProfiles];

      if (!this.matchProf && newProfiles.length) {
        this.matchProf = newProfiles[0];
        this.matchProf['index'] = this.matchProfiles.indexOf(newProfiles[0]);
        this.isMatchPlaceHolder = false;
        this.setUProfLabels();
      }

      return newProfiles.length > 0;
    } finally {
      this.isLoadingMoreCandidates = false;
    }
  }

  private withCandidateSummaries(profiles: PublicProfile[]) {
    const summaries = this.discoverStore.candidateSummaries();

    return profiles.map((profile) => {
      const summary = summaries[profile.uid];

      return summary ? { ...profile, ...summary } : profile;
    });
  }

  openLikedByProfile(profile: PublicProfile) {
    if (!this.billingStore.isPremium()) {
      this.openSeeLikesPaywall();
      return;
    }

    this.options.isSelectedMatch = false;
    this.chatFacade.showMatchesCard();
    this.matchProf = profile;
    this.matchProf['index'] = -1;
    this.isMatchPlaceHolder = false;
    this.isMatchDetailsOpen = false;
    this.setUProfLabels();
  }

  async changeMatchProf() {
    if (!this.matchProf) return;

    const currentIndex = Number(this.matchProf['index'] ?? 0);
    const nextIndex = currentIndex + 1;

    this.isMatchDetailsOpen = false;

    if (nextIndex < this.matchProfiles.length) {
      this.matchProf = this.matchProfiles[nextIndex];
      this.matchProf!['index'] = nextIndex;
      this.setUProfLabels();

      if (this.matchProfiles.length - nextIndex <= 3) {
        void this.loadMoreMatchProfiles();
      }

      return;
    }

    if (await this.loadMoreMatchProfiles()) {
      if (nextIndex < this.matchProfiles.length) {
        this.matchProf = this.matchProfiles[nextIndex];
        this.matchProf!['index'] = nextIndex;
        this.isMatchPlaceHolder = false;
        this.setUProfLabels();
        return;
      }
    }

    this.matchProf = undefined;
    this.possMatchDetLists = [];
    this.isMatchPlaceHolder = true;
  }

  async likeOrDontUser(
    usr: PublicProfile | undefined,
    isLike?: boolean,
    isDontLike?: boolean
  ) {
    return this.matchActionsStore.likeOrDontUser(
      this.userProf,
      usr,
      isLike,
      isDontLike
    );
  }

  openUserCard() {
    this.options.isSelectedMatch = false;
    this.chatFacade.openUserCard();
  }

  showMatchesCard() {
    this.options.isSelectedMatch = false;
    this.chatFacade.showMatchesCard();
  }

  showMessages() {
    this.options.isSelectedMatch = false;
    this.chatFacade.showMessages(
      this.selectedMessProf ?? this.matches[0] ?? null
    );
  }

  toggleMatchDetails() {
    this.isMatchDetailsOpen = !this.isMatchDetailsOpen;

    if (this.isMatchDetailsOpen) {
      this.scrollMatchDetailsIntoView();
    }
  }

  closeMatchDetails() {
    this.isMatchDetailsOpen = false;
  }

  private scrollMatchDetailsIntoView() {
    this.document.defaultView?.setTimeout(() => {
      this.document
        .querySelector('.poss-match-details-container')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async likeCurrentMatch() {
    const likedProfile = this.matchProf;
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (!likedProfile?.uid || !uid) {
      return;
    }

    const likeLimit = this.getDailyLikeLimit();

    if (!(await this.canUseDailyLike(uid, likeLimit))) {
      this.openDailyLikeLimitPromotion();
      return;
    }

    const likeResult = await this.likeOrDontUser(likedProfile, true);

    if (!likeResult) {
      return;
    }

    if (Number.isFinite(likeLimit)) {
      await this.billingFacade.incrementDailyUsage(uid, 'like');
    }

    const newMatch = this.completeMutualMatchFromAction(
      likedProfile,
      likeResult
    );
    this.removeLikedByProfile(likedProfile?.uid);

    await this.changeMatchProf();

    if (likedProfile.uid) {
      this.removeCandidateLocally(likedProfile.uid);
    }

    if (newMatch) {
      await this.openItsAMatchModal(newMatch);
    }
  }

  async dislikeCurrentMatch() {
    const dislikedUid = this.matchProf?.uid;
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
    await this.changeMatchProf();
    if (dislikedUid) {
      this.removeCandidateLocally(dislikedUid);
    }
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

    let rewindResult: MatchActionResponse | false;

    try {
      rewindResult = await this.matchActionsStore.restoreRewindCandidate(
        this.userProf,
        previousMatch
      );
    } catch (error) {
      console.warn('Failed to rewind match candidate.', error);
      this.rewindStack = [previousMatch, ...this.rewindStack].slice(0, 3);
      return;
    }

    if (!rewindResult) {
      this.rewindStack = [previousMatch, ...this.rewindStack].slice(0, 3);
      return;
    }

    const uid = this.userProf?.uid ?? this.user?.uid;

    if (uid) {
      await this.billingFacade.loadDailyUsage(uid, true);
    }

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

    const superLikedProfile = this.matchProf;

    const superLikeResult = await this.matchActionsStore.superLikeUser(
      this.userProf,
      superLikedProfile
    );

    if (!superLikeResult) {
      return;
    }

    const uid = this.userProf?.uid ?? this.user?.uid;

    if (uid) {
      await Promise.all([
        this.billingFacade.loadDailyUsage(uid, true),
        this.billingStore.refreshCustomerInfo(uid),
      ]);
    }

    const newMatch = this.completeMutualMatchFromAction(
      superLikedProfile,
      superLikeResult
    );

    await this.changeMatchProf();
    if (superLikedProfile.uid) {
      this.removeCandidateLocally(superLikedProfile.uid);
    }
    this.syncMatchActionState();

    if (newMatch) {
      await this.openItsAMatchModal(newMatch);
    }
  }

  private completeMutualMatchFromAction(
    matchProfile: PublicProfile,
    actionResult: MatchActionResponse
  ) {
    if (!this.userProf?.uid || !matchProfile.uid || !actionResult.created) {
      return null;
    }

    if (actionResult.matchParts) {
      this.userProf.matchParts = actionResult.matchParts;
    }

    this.profileEditorFacade.setProfile(this.userProf);
    this.discoverFacade.addMatch(matchProfile);
    this.matches = this.addMatchLocally(this.matches, matchProfile);

    void this.analytics.track(this.userProf.uid, 'match_created', {
      matchUid: matchProfile.uid,
    });

    return matchProfile;
  }

  private async openItsAMatchModal(matchProfile: PublicProfile) {
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

  private addMatchLocally(
    matches: PublicProfile[],
    matchProfile: PublicProfile
  ) {
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

  openMessWithMatch(match: PublicProfile) {
    this.selectedMessProf = match;
    this.options.isSelectedMatch = true;
    this.chatFacade.showMessages(match);
  }

  handleMessageSent(event: { matchProfile: PublicProfile; message: Message }) {
    const matchUid = event.matchProfile.uid;

    if (!matchUid) {
      return;
    }

    const existingPreview =
      this.matchConversationPreviewsStore.previews()[matchUid];

    this.matchConversationPreviewsStore.upsertPreview(matchUid, {
      hasMessages: true,
      isLastMessageMine: event.message.senderUid === this.userProf?.uid,
      lastMessage: this.getSentMessagePreviewText(event.message),
      unreadCount: existingPreview?.unreadCount ?? 0,
    });
  }

  onProfileScroll(event: CustomEvent) {
    const scrollTop = event.detail.scrollTop ?? 0;
    this.hideProfileSaveButton = scrollTop < 2200;
  }

  private getSentMessagePreviewText(message: Message) {
    const text = message.message.trim();

    if (text) {
      return text;
    }

    if (message.messageType === 'gif') {
      return message.gif?.title || 'GIF';
    }

    return '';
  }

  private removeCandidateLocally(uid: string) {
    this.discoverStore.removeCandidate(uid);
    this.matchProfiles = this.matchProfiles.filter((profile) => profile.uid !== uid);
    this.possibleMatchIds = this.possibleMatchIds.filter((candidateUid) => candidateUid !== uid);
    this.loadedMatchProfileUids.delete(uid);
  }

  handleMatchRemoved(matchProfile: PublicProfile) {
    const matchUid = matchProfile.uid;

    if (!matchUid) {
      return;
    }

    const remainingMatches = this.matches.filter(
      (match) => match.uid !== matchUid
    );

    this.matches = remainingMatches;
    this.discoverFacade.removeMatch(matchUid);

    this.matchConversationPreviewsStore.removePreview(matchUid);

    if (this.selectedMessProf?.uid !== matchUid) {
      return;
    }

    const nextSelectedMatch = remainingMatches[0];

    if (nextSelectedMatch) {
      this.selectedMessProf = nextSelectedMatch;
      this.chatFacade.showMessages(nextSelectedMatch);
      this.options.isSelectedMatch = !this.options.phoneView;
      return;
    }

    this.selectedMessProf = undefined;
    this.options.isSelectedMatch = false;
    this.chatFacade.showMessages(null);
  }

  startUpdateUserProf() {
    this.startUpdUserProf = true;
  }

  openPremiumProfileFeature(_featureKey: string) {
    this.openActionPromoBottomSheet(this.getPromoById('amorinoGold'));
  }

  async updateUserProf() {
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (
      !uid ||
      !this.userProf ||
      !this.profileEditorFacade.hasRequiredProfilePictures(this.userProf)
    ) {
      return;
    }

    const userProf = this.profileEditorFacade.buildEditableProfilePayload(
      this.userProf,
      uid
    );

    const profileSaved = await this.profileEditorFacade.updateProfile(uid, userProf);

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
    this.chatFacade.showMatchesCard();
    this.loadedDiscoverUid = null;
    this.discoverFacade.clearDiscoverData();
    this.resetActiveDiscoverView();

    await this.ensureDiscoverData(uid);
  }

  getProfileCompletionPercent(profile: Partial<UserClass>) {
    return this.profileEditorFacade.getProfileCompletionPercent(profile);
  }

  isProfileReadyForDiscovery(profile?: Partial<UserClass> | null) {
    return this.profileEditorFacade.isProfileReadyForDiscovery(profile);
  }

  startProfileOnboarding() {
    this.startUpdUserProf = true;
    this.openUserCard();
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

  async savePictures() {
    if (!this.userProf?.uid || !this.selectedFiles.length) {
      return;
    }

    this.userProf = await this.profileEditorFacade.savePictures(
      this.userProf,
      this.selectedFiles
    );
  }

  async requestProfileVerification(selfieFile: File) {
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (!uid || !this.userProf || !selfieFile || this.verificationSubmitting) {
      return;
    }

    this.verificationSubmitting = true;

    try {
      this.userProf = await this.profileEditorFacade.requestProfileVerification(
        this.userProf,
        selfieFile,
        uid
      );
    } catch (error) {
      console.warn('Profile verification request failed.', error);
    } finally {
      this.verificationSubmitting = false;
    }
  }

  async reorderProfilePhotos(event: { fromIndex: number; toIndex: number }) {
    if (!this.userProf?.pictures?.length) {
      return;
    }

    this.userProf = await this.profileEditorFacade.reorderProfilePhotos(
      this.userProf,
      event
    );
  }

  async selectPrimaryProfilePhoto(index: number) {
    if (!this.userProf) {
      return;
    }

    this.userProf = await this.profileEditorFacade.selectPrimaryProfilePhoto(
      this.userProf,
      index
    );
  }

  async deleteProfilePhoto(index: number) {
    if (!this.userProf) {
      return;
    }

    this.userProf = await this.profileEditorFacade.deleteProfilePhoto(
      this.userProf,
      index
    );
  }

  handleChoiceSelected(choice: ProfileChoiceSelectedEvent) {
    this.onSelectChoices(choice.event, choice.labelKey);
  }
}
