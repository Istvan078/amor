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
import { DiscoverSidebarComponent } from '../ui/discover-sidebar/discover-sidebar.component';
import { ProfilePicturesRepository } from '../../profile/data-access/profile-pictures.repository';
import { ProfileStore } from '../../profile/store/profile.store';
import { Options } from '../../../shared/models/options.model';
import { Promotions } from '../../../shared/models/promotions.model';
import { UserClass } from '../../../shared/models/user.model';

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

  private authStore = inject(AuthStore);
  private profileStore = inject(ProfileStore);
  readonly discoverStore = inject(DiscoverStore);
  private discoverUiStore = inject(DiscoverUiStore);
  private transloco = inject(TranslocoService);

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
    });

    effect(() => {
      this.userProf = this.profileStore.profile() ?? undefined;
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

    await this.discoverStore.loadDiscoverData();
    this.syncDiscoverState();
    this.initMainView();
  }

  private updatePhoneView() {
    this.discoverUiStore.setPhoneView(window.innerWidth <= 768);
  }

  private initMainView() {
    void this.setMatchProfiles(this.possibleMatchIds);
    this.setPromotion();
    this.setUProfLabels();
  }

  private syncDiscoverState() {
    this.possibleMatchIds = this.discoverStore.possibleMatchIds();
    this.progress = this.discoverStore.progress();
    this.buffer = this.discoverStore.buffer();
    this.matches = this.discoverStore.matches();
  }

  setPromotion() {
    this.promotions = this.config.getPromotions();
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

    if (this.matchProf!['index'] !== this.matchProfiles.length - 1) {
      const index = this.matchProf!['index'];
      this.matchProf = this.matchProfiles[index + 1];
      this.matchProf!['index'] = index + 1;
      this.setUProfLabels();
    }

    if (this.matchProf!['index'] === this.matchProfiles.length - 1) {
      this.matchProf = undefined;
      this.possMatchDetLists = [];
      this.isMatchPlaceHolder = true;
    }
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
    this.router.navigate(['/amor/login']);
  }
}
