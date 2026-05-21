
import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonIcon,
  IonImg,
  IonInput,
  IonItem,
  IonLabel,
  IonRange,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { TranslocoDirective } from '@jsverse/transloco';
import { SwiperContainer } from 'swiper/element';

import {
  translatedFieldLabel,
  translatedOptionLabel,
} from '../../shared/i18n/profile-value-labels';
import { UserClass } from '../../shared/models/user.model';

@Component({
  selector: 'app-ion-modal',
  templateUrl: './ion-modal.page.html',
  styleUrls: ['./ion-modal.page.scss'],
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    FormsModule,
    TranslocoDirective,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonIcon,
    IonImg,
    IonInput,
    IonItem,
    IonLabel,
    IonRange,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
})
export class IonModalPage implements AfterViewInit {
  readonly fieldLabel = translatedFieldLabel;
  readonly optionLabel = translatedOptionLabel;

  @ViewChild('swiperRef') swiperRef?: ElementRef<SwiperContainer>;
  email?: string;
  password?: string;
  regFirstPhase?: boolean;
  regSecondPhase?: boolean;
  labels?: any = {};
  userProf: UserClass = new UserClass();
  myPhotos: { name: string; url: string }[] = [];
  chosenIndex: number = 0;

  constructor(private modalCtrl: ModalController) { }

  ngAfterViewInit() {
    if (this.myPhotos?.length) {
      this.swiperRef?.nativeElement.swiper.slideTo(this.chosenIndex)
      this.swiperRef?.nativeElement.swiper.autoplay.start()
    }
  }

  cancel() {
    return this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    let data: any = {};
    if (this.email) {
      data = { email: this.email, password: this.password };
      this.email = '';
      this.password = '';
      return this.modalCtrl.dismiss(data, 'confirm');
    }
    if (this.userProf.firstName) {
      data = { ...this.userProf };
      return this.modalCtrl.dismiss(data, 'created-successfully');
    }
    console.error(`PROBLEM HA ITT VAN`);
    return this.modalCtrl.dismiss(data, 'no-data');
  }
}
