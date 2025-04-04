import {
  AfterViewInit,
  Component,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { ConfigService } from '../services/config.service';
import { AlertController, ModalController } from '@ionic/angular';
import { AuthService } from '../services/auth.service';
import { Promotions } from '../models/promotions.model';
import { Router } from '@angular/router';
import { BaseService } from '../services/base.service';
import { UserClass } from '../models/user.model';
import { Observable, Subscription } from 'rxjs';
import { FilesService } from '../services/files.service';
import { LocationService } from '../services/location.service';
import { Options } from '../models/options.model';
import { IonModalPage } from '../modals/ion-modal/ion-modal.page';

@Component({
  selector: 'app-main-view-container',
  templateUrl: './main-view-container.component.html',
  styleUrls: ['./main-view-container.component.scss'],
  standalone: false,
})
export class MainViewContainerComponent
  implements OnInit, AfterViewInit, OnDestroy {
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
  loggedUserSub: Subscription = Subscription.EMPTY;
  userProfSub: Subscription = Subscription.EMPTY;
  selectedFilesSub: Subscription = Subscription.EMPTY;
  initMainViewSubjectSub: Subscription = Subscription.EMPTY;

  constructor(
    private modalCtrl: ModalController,
    private auth: AuthService,
    private config: ConfigService,
    private router: Router,
    private base: BaseService,
    private fileServ: FilesService,
    private locationService: LocationService,
    private alertCtrl: AlertController
  ) { }
  ngOnInit(): void {
    if (window.innerWidth < 400) this.isMatchDetailsOpen = true;
    this.config.initMainViewSubject.subscribe((isInit) => {
      if (isInit) {
        this.setMatchProfiles();
        this.setPromotion();
        this.setUProfLabels();
        console.log(`****INIT MAIN VIEW****`);
      }
    });
    this.loggedUserSub = this.auth.loggedUserSubject.subscribe((usr) => {
      this.user = usr;
    });
    this.userProfSub = this.base.userProfBehSubj.subscribe((uProf) => {
      this.userProf = uProf;
    });
    this.selectedFilesSub = this.config.selectedFilesSubj.subscribe((files) => {
      this.selectedFiles = files;
    });
    this.base.mainDataSubject.subscribe(data => {
      if (data?.messaging) {
        this.isShowMessages = true;
        this.selectedMessProf = this.matches[0]
        this.isUserCardOpen = false;
        this.isMatchDetailsOpen = false;
      }
      if (data?.amor) {
        this.isShowMessages = false;
        this.selectedMessProf = undefined
      }
      if (data?.userSettings) {
        this.isUserCardOpen = true
        this.startUpdUserProf = true;
      };
      if (data?.userSettings === false) {
        this.isUserCardOpen = false;
        this.isMatchDetailsOpen = true;
        this.isShowMessages = false;

      }
      if (data?.phoneView) {
        this.options.phoneView = true
      }
    })
  }
  ngAfterViewInit(): void { }
  ngOnDestroy(): void {
    if (this.loggedUserSub) this.loggedUserSub.unsubscribe();
    if (this.userProfSub) this.userProfSub.unsubscribe();
    if (this.initMainViewSubjectSub) this.initMainViewSubjectSub.unsubscribe();
    if (this.selectedFilesSub) this.selectedFilesSub.unsubscribe();
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

  setMatchProfiles() {
    let matchProfsArr: any[] = [];
    let isMapFuncStarted: boolean = false;
    const obs = new Observable((obs) => {
      const int = setInterval(() => {
        if (this.progress === 100 && !this.matchProfiles?.length) {
          obs.next([]);
          clearInterval(int);
        }
        if (this.matchProfiles?.length && !isMapFuncStarted) {
          this.matchProfiles.map(async (matchUid: any) => {
            isMapFuncStarted = true;
            const matchProf = await this.base.getPossibleMatch(matchUid);
            matchProfsArr.push(matchProf);
          });
        }
        if (
          matchProfsArr.length === this.matchProfiles?.length &&
          isMapFuncStarted
        ) {
          obs.next(matchProfsArr);
          clearInterval(int);
        }
      }, 200);
    }).subscribe((matchProfsArr: any) => {
      if (matchProfsArr.length) {
        this.matchProfiles = matchProfsArr;
        this.matchProf = this.matchProfiles[0];
        this.matchProf!['index'] = 0;
        this.setUProfLabels();
      }
      if (!matchProfsArr.length) {
        this.isMatchPlaceHolder = true
        this.possMatchDetLists = []
      };
      obs.unsubscribe();
    });
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
  likeOrDontUser(
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
      this.base.updateUserProf(
        this.userProf?.uid!,
        this.userProf.setDataForFireStore()
      );
    }
  }
  openUserCard() {
    this.isUserCardOpen = true;
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
    const claims = {
      gender: userProf.gender,
      lookingForGender: userProf.lookingForGender,
      lookingForAge: userProf.lookingForAge,
      lookingForDistance: userProf.lookingForDistance,
      currentLocCoords: await this.locationService.getLocation(),
      currentPlace: this.userProf!.currentPlace as string,
    };
    if (userProf?.uid) {
      await this.base.updateUserProf(userProf.uid, userProf);
      this.auth.setCustomClaims(userProf.uid, claims);
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

  savePictures() {
    this.fileServ.addPictures(this.userProf!.uid!, { ...this.userProf });
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
    await this.auth.signOut();
    this.user = null;
    this.auth.authAutoFillSubj.next(this.userProf?.email);
    this.userProf = undefined;
    this.base.userProfBehSubj.next({});
    this.auth.usersSubject.next([])
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
