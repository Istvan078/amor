import {
  Component,
  HostListener,
  OnInit,
  ViewEncapsulation,
  effect,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonCard,
  IonCol,
  IonContent,
  IonGrid,
  IonRow,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoService } from '@jsverse/transloco';

import { IonModalPage } from '../../../modals/ion-modal/ion-modal.page';
import { ConfigService } from '../../../services/config.service';
import { LocationService } from '../../../services/location.service';
import { MessageComponent } from '../../messages/ui/message/message.component';
import { AuthStore } from '../../auth/store/auth.store';
import { DiscoverRepository } from '../data-access/discover.repository';
import { DiscoverStore } from '../store/discover.store';
import { DiscoverUiStore } from '../store/discover-ui.store';
import { DiscoverMatchCardComponent } from '../ui/discover-match-card/discover-match-card.component';
import { DiscoverMatchDetailsComponent } from '../ui/discover-match-details/discover-match-details.component';
import {
  DiscoverProfilePanelComponent,
  type ProfileChoiceSelectedEvent,
} from '../ui/discover-profile-panel/discover-profile-panel.component';
import {
  DiscoverSidebarComponent,
  type MatchConversationPreview,
} from '../ui/discover-sidebar/discover-sidebar.component';
import {
  PromoBottomSheetComponent,
  type PromoBottomSheetDismissEvent,
} from '../ui/promo-bottom-sheet/promo-bottom-sheet.component';
import { ProfilePicturesRepository } from '../../profile/data-access/profile-pictures.repository';
import { ProfileStore } from '../../profile/store/profile.store';
import { Options } from '../../../shared/models/options.model';
import { Promotions } from '../../../shared/models/promotions.model';
import { UserClass } from '../../../shared/models/user.model';
import { MessagesRepository } from '../../messages/data-access/messages.repository';
import { Message } from '../../../shared/models/message.model';
import { MatchActionsStore } from '../../matching/store/match-actions.store';
import { PromoStore } from '../../promotions/store/promo.store';
import { PaywallComponent } from '../../billing/ui/paywall/paywall.component';
import { BillingStore } from '../../billing/store/billing.store';

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
  ],
})
export class DiscoverPage implements OnInit {
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
  matchConversationPreviews: Record<string, MatchConversationPreview> = {};
  promoBottomSheetOpen = false;
  promoBottomSheetPromotions: Promotions[] = [];
  promoBottomSheetActiveIndex = 0;
  rewindStack: UserClass[] = [];

  hasPremiumAccess = false;
  hasRewindCandidate = false;
  freeRewindsRemaining = 0;
  isRewindLocked = false;
  canSuperLike = false;

  private loadedDiscoverUid: string | null = null;
  private loadingDiscoverUid: string | null = null;
  private matchPreviewRequestId = 0;
  private matchPreviewSignature = '';
  private promoBottomSheetQueued = false;
  private promoBottomSheetShownForUid: string | null = null;

  private authStore = inject(AuthStore);
  private profileStore = inject(ProfileStore);
  readonly discoverStore = inject(DiscoverStore);
  private discoverUiStore = inject(DiscoverUiStore);
  private matchActionsStore = inject(MatchActionsStore);
  private promoStore = inject(PromoStore);
  readonly billingStore = inject(BillingStore);
  private transloco = inject(TranslocoService);
  private messagesRepository = inject(MessagesRepository);
  private modalCtrl = inject(ModalController);
  private config = inject(ConfigService);
  private router = inject(Router);
  private locationService = inject(LocationService);
  private alertCtrl = inject(AlertController);
  private discoverRepository = inject(DiscoverRepository);
  private profilePicturesRepository = inject(ProfilePicturesRepository);

  constructor() {
    effect(() => {
      this.user = this.authStore.user();

      const uid = this.user?.uid ?? null;

      if (!uid) {
        this.loadedDiscoverUid = null;
        this.loadingDiscoverUid = null;
        this.promoBottomSheetShownForUid = null;
        return;
      }

      queueMicrotask(() => {
        if (this.authStore.user()?.uid === uid) {
          void this.ensureDiscoverData(uid);
        }
      });
    });

    effect(() => {
      this.userProf = this.profileStore.profile() ?? undefined;
      void this.loadMatchConversationPreviews();
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

  async ngOnInit() {
    this.updatePhoneView();
    this.setPromotion();

    await this.ensureDiscoverData(this.authStore.user()?.uid);
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
      await this.initMainView();

      if (!this.discoverStore.error()) {
        this.loadedDiscoverUid = uid;
        this.schedulePromoBottomSheetCheck();
      }
    } finally {
      if (this.loadingDiscoverUid === uid) {
        this.loadingDiscoverUid = null;
      }
    }
  }

  private resetActiveDiscoverView() {
    this.matchProf = undefined;
    this.selectedMessProf = undefined;
    this.matches = [];
    this.possibleMatchIds = [];
    this.matchProfiles = [];
    this.possMatchDetLists = [];
    this.isMatchDetailsOpen = false;
    this.isMatchPlaceHolder = false;
    this.progress = 0;
    this.buffer = 0;
    this.matchConversationPreviews = {};
    this.matchPreviewSignature = '';
    this.matchPreviewRequestId++;
    this.promoBottomSheetOpen = false;
    this.promoBottomSheetPromotions = [];
    this.rewindStack = [];
    this.syncMatchActionState();
  }

  private syncDiscoverState() {
    this.possibleMatchIds = this.discoverStore.possibleMatchIds();
    this.progress = this.discoverStore.progress();
    this.buffer = this.discoverStore.buffer();
    this.matches = this.discoverStore.matches();
    void this.loadMatchConversationPreviews();
    this.schedulePromoBottomSheetCheck();
    this.syncMatchActionState();
  }

  private async loadMatchConversationPreviews() {
    const userProfile = this.userProf;
    const matches = this.matches.filter(
      (match): match is UserClass & { uid: string } => !!match.uid
    );

    if (!userProfile?.uid || !matches.length) {
      this.matchConversationPreviews = {};
      this.matchPreviewSignature = '';
      this.matchPreviewRequestId++;
      return;
    }

    const signature = [
      userProfile.uid,
      ...matches.map((match) => match.uid),
    ].join('|');

    if (signature === this.matchPreviewSignature) {
      return;
    }

    this.matchPreviewSignature = signature;
    const requestId = ++this.matchPreviewRequestId;

    const previewEntries = await Promise.all(
      matches.map(async (match) => {
        try {
          const messages = await this.messagesRepository.getMessages(
            userProfile.uid!,
            userProfile.email ?? '',
            match.uid,
            match.email ?? ''
          );
          const lastMessage = messages.at(-1);
          const unreadCount = messages.filter(
            (message) =>
              message.senderUid === match.uid &&
              message.sentToUid === userProfile.uid &&
              message.isRead !== true
          ).length;

          return [
            match.uid,
            {
              hasMessages: messages.length > 0,
              isLastMessageMine: lastMessage?.senderUid === userProfile.uid,
              lastMessage: lastMessage?.message?.trim() ?? '',
              unreadCount,
            },
          ] as const;
        } catch (error) {
          console.error(error);
          return [
            match.uid,
            {
              hasMessages: false,
              isLastMessageMine: false,
              lastMessage: '',
              unreadCount: 0,
            },
          ] as const;
        }
      })
    );

    if (requestId !== this.matchPreviewRequestId) {
      return;
    }

    this.matchConversationPreviews = Object.fromEntries(previewEntries);
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

    if (event.reason === 'cta') {
      void this.openPaywall(event.promotion);
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

  async openPaywall(promotion?: Promotions) {
    const modal = await this.modalCtrl.create({
      component: PaywallComponent,
      componentProps: {
        promotionId: promotion?.['id'],
      },
      cssClass: 'paywall-modal',
    });

    await modal.present();
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
    await this.likeOrDontUser(this.matchProf, true);
    this.changeMatchProf();
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

    this.matchActionsStore.consumeDailyAction(
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

    this.matchActionsStore.consumeDailyAction(
      this.userProf,
      'super-like',
      this.user?.uid
    );
    await this.matchActionsStore.superLikeUser(this.userProf, this.matchProf);
    this.changeMatchProf();
    this.syncMatchActionState();
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

    const existingPreview = this.matchConversationPreviews[matchUid];

    this.matchConversationPreviews = {
      ...this.matchConversationPreviews,
      [matchUid]: {
        hasMessages: true,
        isLastMessageMine: event.message.senderUid === this.userProf?.uid,
        lastMessage: event.message.message.trim(),
        unreadCount: existingPreview?.unreadCount ?? 0,
      },
    };
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

    const { [matchUid]: _removedPreview, ...remainingPreviews } =
      this.matchConversationPreviews;
    this.matchConversationPreviews = remainingPreviews;
    this.matchPreviewSignature = '';
    this.matchPreviewRequestId++;

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
    const userProf = { ...this.userProf };
    userProf.uid = this.user.uid;
    const currentPosition = await this.locationService.getLocation();
    const claims = {
      gender: userProf.gender,
      lookingForGender: userProf.lookingForGender,
      lookingForAge: userProf.lookingForAge,
      lookingForDistance: userProf.lookingForDistance,
      currentLocCoords: {
        lat: currentPosition.coords.latitude,
        lon: currentPosition.coords.longitude,
      },
      currentPlace: this.userProf!.currentPlace as string,
    };

    if (userProf?.uid) {
      await this.profileStore.updateProfile(userProf.uid, userProf);
      await this.authStore.setCustomClaims(userProf.uid, claims);
    }
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

  async savePictures() {
    if (!this.userProf?.uid || !this.selectedFiles.length) {
      return;
    }

    const updatedProfile = await this.profilePicturesRepository.addPictures(
      this.userProf.uid,
      this.userProf,
      this.selectedFiles
    );

    this.profileStore.setProfile(updatedProfile);
    this.config.clearSelectedFiles();
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
    this.matchConversationPreviews = {};
    this.matchPreviewSignature = '';
    this.matchPreviewRequestId++;
    this.loadedDiscoverUid = null;
    this.loadingDiscoverUid = null;
    this.promoBottomSheetShownForUid = null;
    this.router.navigate(['/amor/login']);
  }
}
