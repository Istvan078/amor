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
  type PromoBottomSheetDismissReason,
} from '../ui/promo-bottom-sheet/promo-bottom-sheet.component';
import { ProfilePicturesRepository } from '../../profile/data-access/profile-pictures.repository';
import { ProfileStore } from '../../profile/store/profile.store';
import { Options } from '../../../shared/models/options.model';
import { Promotions } from '../../../shared/models/promotions.model';
import { UserClass } from '../../../shared/models/user.model';
import { MessagesRepository } from '../../messages/data-access/messages.repository';
import { Message } from '../../../shared/models/message.model';

type PromoSheetState = {
  firstSeenAt: number;
  dailyShows: Record<string, number>;
  lastClosedAt?: number;
  lastMaybeLaterAt?: number;
  shownTriggers?: Record<string, number>;
};

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

  private loadedDiscoverUid: string | null = null;
  private loadingDiscoverUid: string | null = null;
  private matchPreviewRequestId = 0;
  private matchPreviewSignature = '';
  private promoBottomSheetQueued = false;
  private promoBottomSheetShownForUid: string | null = null;
  private readonly promoClosedCooldownMs = 24 * 60 * 60 * 1000;
  private readonly promoMaybeLaterCooldownMs = 12 * 60 * 60 * 1000;
  private readonly promoFirstDayMs = 24 * 60 * 60 * 1000;

  private authStore = inject(AuthStore);
  private profileStore = inject(ProfileStore);
  readonly discoverStore = inject(DiscoverStore);
  private discoverUiStore = inject(DiscoverUiStore);
  private transloco = inject(TranslocoService);
  private messagesRepository = inject(MessagesRepository);

  constructor(
    private modalCtrl: ModalController,
    private config: ConfigService,
    private router: Router,
    private locationService: LocationService,
    private alertCtrl: AlertController,
    private discoverRepository: DiscoverRepository,
    private profilePicturesRepository: ProfilePicturesRepository
  ) {
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

      if (!this.options.phoneView) {
        this.promoBottomSheetOpen = false;
      }

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
  }

  private syncDiscoverState() {
    this.possibleMatchIds = this.discoverStore.possibleMatchIds();
    this.progress = this.discoverStore.progress();
    this.buffer = this.discoverStore.buffer();
    this.matches = this.discoverStore.matches();
    void this.loadMatchConversationPreviews();
    this.schedulePromoBottomSheetCheck();
  }

  private async loadMatchConversationPreviews() {
    const userProfile = this.userProf;
    const matches = this.matches.filter(
      (match): match is UserClass & { uid: string; email: string } =>
        !!match.uid && !!match.email
    );

    if (!userProfile?.uid || !userProfile.email || !matches.length) {
      this.matchConversationPreviews = {};
      this.matchPreviewSignature = '';
      this.matchPreviewRequestId++;
      return;
    }

    const signature = [
      userProfile.uid,
      userProfile.email,
      ...matches.map((match) => `${match.uid}:${match.email}`),
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
            userProfile.email!,
            match.uid,
            match.email
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

  setPromotion() {
    this.promotions = this.config.getPromotions();
  }

  handlePromoBottomSheetDismiss(reason: PromoBottomSheetDismissReason) {
    const uid = this.userProf?.uid ?? this.user?.uid;

    if (uid) {
      const state = this.readPromoSheetState(uid);
      const now = Date.now();

      if (reason === 'maybeLater') {
        state.lastMaybeLaterAt = now;
      } else {
        state.lastClosedAt = now;
      }

      this.writePromoSheetState(uid, state);
    }

    this.promoBottomSheetOpen = false;
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

    if (
      !uid ||
      !this.options.phoneView ||
      !this.promotions.length ||
      this.promoBottomSheetOpen ||
      this.loadedDiscoverUid !== uid ||
      this.promoBottomSheetShownForUid === uid ||
      this.isPremiumUser()
    ) {
      return;
    }

    const now = Date.now();
    const state = this.readPromoSheetState(uid);
    const isFirstDay = now - state.firstSeenAt < this.promoFirstDayMs;

    if (!this.canShowPromoBottomSheet(state, isFirstDay, now)) {
      this.writePromoSheetState(uid, state);
      return;
    }

    const candidates = this.getPromoBottomSheetCandidates(state, isFirstDay);

    if (!candidates.length) {
      return;
    }

    this.promoBottomSheetPromotions = candidates;
    this.promoBottomSheetActiveIndex = 0;
    this.promoBottomSheetOpen = true;
    this.promoBottomSheetShownForUid = uid;
    this.markPromoBottomSheetShown(uid, state, candidates[0]?.['id']);
  }

  private canShowPromoBottomSheet(
    state: PromoSheetState,
    isFirstDay: boolean,
    now: number
  ) {
    const dailyLimit = isFirstDay ? 2 : 1;
    const todayKey = this.getTodayKey();
    const todaysShows = state.dailyShows[todayKey] ?? 0;

    if (todaysShows >= dailyLimit) {
      return false;
    }

    if (
      state.lastClosedAt &&
      now - state.lastClosedAt < this.promoClosedCooldownMs
    ) {
      return false;
    }

    if (
      state.lastMaybeLaterAt &&
      now - state.lastMaybeLaterAt < this.promoMaybeLaterCooldownMs
    ) {
      return false;
    }

    return true;
  }

  private getPromoBottomSheetCandidates(
    state: PromoSheetState,
    isFirstDay: boolean
  ) {
    const orderedIds: string[] = [];
    const likedCount = this.userProf?.matchParts?.liked?.length ?? 0;
    const notLikedCount = this.userProf?.matchParts?.notLiked?.length ?? 0;
    const hiddenLikesCount = this.getHiddenLikesCount();
    const possibleCount = this.possibleMatchIds.length;
    const matchCount = this.matches.length;

    if (isFirstDay) {
      orderedIds.push('firstMonth');
    }

    if (hiddenLikesCount > 0) {
      orderedIds.push('seeLikes');
    }

    if (likedCount >= 8 || (likedCount >= 3 && possibleCount <= 1)) {
      orderedIds.push('amorinoGold');
    }

    if ((matchCount <= 1 && possibleCount <= 2) || this.isMatchPlaceHolder) {
      orderedIds.push('profileBoost');
    }

    if (likedCount + notLikedCount >= 8 && notLikedCount >= likedCount) {
      orderedIds.push('superLike');
    }

    orderedIds.push(
      'amorinoGold',
      'profileBoost',
      'seeLikes',
      'superLike',
      'firstMonth'
    );

    const candidates = this.uniquePromoIds(orderedIds)
      .map((id) => this.getPromoById(id))
      .filter((promotion): promotion is Promotions => !!promotion);

    return this.preferPromosNotShownToday(candidates, state).slice(0, 3);
  }

  private preferPromosNotShownToday(
    promotions: Promotions[],
    state: PromoSheetState
  ) {
    const todayKey = this.getTodayKey();
    const shownToday = new Set(
      Object.entries(state.shownTriggers ?? {})
        .filter(([, shownAt]) => this.getTodayKey(new Date(shownAt)) === todayKey)
        .map(([id]) => id)
    );
    const freshPromotions = promotions.filter(
      (promotion) => !shownToday.has(String(promotion['id']))
    );

    return freshPromotions.length ? freshPromotions : promotions;
  }

  private markPromoBottomSheetShown(
    uid: string,
    state: PromoSheetState,
    promoId?: string
  ) {
    const todayKey = this.getTodayKey();
    const now = Date.now();

    state.dailyShows[todayKey] = (state.dailyShows[todayKey] ?? 0) + 1;
    state.shownTriggers ??= {};

    if (promoId) {
      state.shownTriggers[promoId] = now;
    }

    this.writePromoSheetState(uid, state);
  }

  private readPromoSheetState(uid: string): PromoSheetState {
    const fallbackState: PromoSheetState = {
      firstSeenAt: Date.now(),
      dailyShows: {},
      shownTriggers: {},
    };

    try {
      const storedState = window.localStorage.getItem(
        this.getPromoSheetStorageKey(uid)
      );

      if (!storedState) {
        return fallbackState;
      }

      const parsedState = JSON.parse(storedState) as Partial<PromoSheetState>;

      return {
        firstSeenAt: parsedState.firstSeenAt ?? Date.now(),
        dailyShows: parsedState.dailyShows ?? {},
        lastClosedAt: parsedState.lastClosedAt,
        lastMaybeLaterAt: parsedState.lastMaybeLaterAt,
        shownTriggers: parsedState.shownTriggers ?? {},
      };
    } catch (error) {
      console.error(error);
      return fallbackState;
    }
  }

  private writePromoSheetState(uid: string, state: PromoSheetState) {
    try {
      window.localStorage.setItem(
        this.getPromoSheetStorageKey(uid),
        JSON.stringify(state)
      );
    } catch (error) {
      console.error(error);
    }
  }

  private getPromoSheetStorageKey(uid: string) {
    return `amor:mobile-promo-sheet:${uid}`;
  }

  private getTodayKey(date = new Date()) {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }

  private uniquePromoIds(ids: string[]) {
    return [...new Set(ids)];
  }

  private getPromoById(id: string) {
    return this.promotions.find((promotion) => promotion['id'] === id);
  }

  private getHiddenLikesCount() {
    const profile = this.userProf as Record<string, unknown> | undefined;
    const hiddenLikeKeys = [
      'hiddenLikes',
      'likedBy',
      'likesReceived',
      'receivedLikes',
      'profileLikes',
    ];

    if (!profile) {
      return 0;
    }

    for (const key of hiddenLikeKeys) {
      const value = profile[key];

      if (Array.isArray(value)) {
        return value.length;
      }

      if (typeof value === 'number') {
        return value;
      }

      if (value && typeof value === 'object' && 'count' in value) {
        const count = (value as { count?: unknown }).count;

        if (typeof count === 'number') {
          return count;
        }
      }
    }

    return 0;
  }

  private isPremiumUser() {
    const subscriptions = this.userProf?.subscriptions;

    return !!(
      subscriptions?.gold ||
      subscriptions?.silver ||
      subscriptions?.bronze
    );
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
    if (this.userProf && usr?.uid) {
      if (isLike) {
        if (!this.userProf?.matchParts?.liked) {
          this.userProf.matchParts!.liked = [usr.uid];
        } else {
          this.userProf?.matchParts?.liked.push(usr.uid);
        }
      } else if (isDontLike) {
        if (!this.userProf?.matchParts?.notLiked) {
          this.userProf.matchParts!.notLiked = [usr.uid];
        } else {
          this.userProf?.matchParts?.notLiked.push(usr.uid);
        }
      }

      if (this.userProf?.matchParts?.possMatches?.includes(usr.uid)) {
        this.userProf.matchParts.possMatches =
          this.userProf.matchParts?.possMatches.filter((uid) => uid !== usr.uid);
      }

      await this.profileStore.updateProfile(
        this.userProf?.uid!,
        this.userProf.setDataForFireStore()
      );
      this.profileStore.setProfile(this.userProf);
    }
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
    await this.likeOrDontUser(this.matchProf, false, true);
    this.changeMatchProf();
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
