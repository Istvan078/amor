import {
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  HostListener,
  Input,
  OnInit,
  ViewChild,
  effect,
  inject,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { ConfigService } from '../services/config.service';
import { Promotions } from '../shared/models/promotions.model';
import { Router } from '@angular/router';
import { UserClass } from '../shared/models/user.model';
import { LocationService } from '../services/location.service';
import { Options } from '../shared/models/options.model';
import { IonModalPage } from '../modals/ion-modal/ion-modal.page';
import { AuthStore } from '../features/auth/store/auth.store';
import { DiscoverRepository } from '../features/discover/data-access/discover.repository';
import { DiscoverStore } from '../features/discover/store/discover.store';
import { DiscoverUiStore } from '../features/discover/store/discover-ui.store';
import { ProfilePicturesRepository } from '../features/profile/data-access/profile-pictures.repository';
import { ProfileStore } from '../features/profile/store/profile.store';


import { FormsModule } from '@angular/forms';
import {
  IonAvatar,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonCol,
  IonGrid,
  IonIcon,
  IonImg,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonProgressBar,
  IonRange,
  IonRow,
  IonText,
  IonTextarea,
  AlertController,
  ModalController,
} from '@ionic/angular/standalone';

import { MessageComponent } from '../features/messages/ui/message/message.component';

@Component({
  selector: 'app-main-view-container',
  templateUrl: './main-view-container.component.html',
  styleUrls: ['./main-view-container.component.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    FormsModule,
    MessageComponent,
    IonAvatar,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCheckbox,
    IonCol,
    IonGrid,
    IonIcon,
    IonImg,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonProgressBar,
    IonRange,
    IonRow,
    IonText,
    IonTextarea
  ],
})
export class MainViewContainerComponent
  implements OnInit {
  @Input() matchProfiles: any;
  @Input() progress: number = 0;
  @Input() buffer: number = 0;
  @Input() matches: UserClass[] = [];
  isShowMessages: boolean = false;
  isUserCardOpen: boolean = false;
  @ViewChild('ngForm') ngForm!: NgForm;
  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: KeyboardEvent) {
    this.signOut();
  }

  labels: any = {};
  possMatchDetLists: any[] = [];
  matchProf?: UserClass;
  user: any;
  promotions: Promotions[] = [];
  userProfSaved: boolean = false;
  startUpdUserProf: boolean = false;
  isMatchDetailsOpen: boolean = false;
  isMatchPlaceHolder: boolean = false;
  userProf?: UserClass;
  selectedFiles: File[] = [];
  selectedMessProf?: UserClass;
  options: Options = new Options()
  private authStore = inject(AuthStore);
  private profileStore = inject(ProfileStore);
  private discoverStore = inject(DiscoverStore);
  private discoverUiStore = inject(DiscoverUiStore);

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
      const initVersion = this.config.mainViewInitVersion();

      if (initVersion > 0) {
        this.initMainView();
      }
    });

    effect(() => {
      this.isUserCardOpen = this.discoverUiStore.isUserCardOpen();
      this.isShowMessages = this.discoverUiStore.isShowMessages();
      this.options.phoneView = this.discoverUiStore.phoneView();

      const selectedMessageProfile =
        this.discoverUiStore.selectedMessageProfile();

      if (selectedMessageProfile) {
        this.selectedMessProf = selectedMessageProfile;
      }

      if (this.isShowMessages && !this.selectedMessProf) {
        this.selectedMessProf = this.matches[0];
      }
    });
  }

  ngOnInit(): void {
    if (window.innerWidth < 400) this.isMatchDetailsOpen = true;
  }

  private initMainView() {
    void this.setMatchProfiles();
    this.setPromotion();
    this.setUProfLabels();
  }

  setPromotion() {
    this.promotions = this.config.getPromotions();
  }
  setUProfLabels() {
    this.possMatchDetLists = [];
    this.labels = this.config.getLabels(true);
    let isListNumber: any;
    this.labels.userProfLabels.map((label: any, i: number) => {
      if (typeof label?.listNum !== 'number' && label?.listNum) {
        isListNumber = label?.listNum(this.matchProf);
        label.listNum = isListNumber;
      }
      if (
        label?.listNum &&
        !this.possMatchDetLists.includes(label?.listNum) &&
        typeof label?.listNum === 'number'
      )
        this.possMatchDetLists.push(label?.listNum);
      if (isListNumber && !this.possMatchDetLists.includes(isListNumber))
        this.possMatchDetLists.push(isListNumber);
    });
  }

  async setMatchProfiles() {
    const matchIds = Array.isArray(this.matchProfiles) ? this.matchProfiles : [];

    if (this.progress === 100 && !matchIds.length) {
      this.isMatchPlaceHolder = true;
      this.possMatchDetLists = [];
      return;
    }

    if (!matchIds.length) {
      return;
    }

    const matchProfiles = await this.discoverRepository.getMatchProfiles(matchIds);

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
        if (!this.userProf?.matchParts?.liked)
          this.userProf.matchParts!.liked = [usr.uid];
        else this.userProf?.matchParts?.liked.push(usr.uid);
      } else if (isDontLike) {
        if (!this.userProf?.matchParts?.notLiked)
          this.userProf.matchParts!.notLiked = [usr.uid];
        else this.userProf?.matchParts?.notLiked.push(usr.uid);
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
    this.discoverUiStore.openUserCard();
  }
  async showProfPics(i: number) {
    const modal = await this.modalCtrl.create({
      component: IonModalPage,
      componentProps: { myPhotos: this.userProf?.pictures, chosenIndex: i }
    });
    await modal.present();
  }


  openMessWithMatch(match: any) {
    this.isShowMessages = true;
    this.selectedMessProf = match;
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
    let isDeletedArrEl: boolean = false;
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
      if (!this.userProf[labelKey]?.length && !isDeletedArrEl)
        this.userProf![labelKey] = [value.value];
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
  async signOutAlert() {
    const alert = await this.alertCtrl.create({
      header: 'Kilépés',
      message: 'Biztosan ki szeretnél lépni?',
      cssClass: 'signout-alert',
      buttons: [{ text: 'Kilépés', role: 'confirm', handler: () => this.signOut(), cssClass: 'signout-alert-button' }, { text: 'Mégsem', role: 'cancel', cssClass: 'signout-alert-cancel-button' }]
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
    this.matchProfiles = [];
    this.isMatchPlaceHolder = false;
    this.isShowMessages = false;
    this.possMatchDetLists = [];
    this.router.navigate(['/amor/login']);
  }
}
