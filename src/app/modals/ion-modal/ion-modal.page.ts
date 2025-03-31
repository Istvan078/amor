import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { UserClass } from 'src/app/models/user.model';
import { SwiperContainer } from 'swiper/element';


@Component({
  selector: 'app-ion-modal',
  templateUrl: './ion-modal.page.html',
  styleUrls: ['./ion-modal.page.scss'],
  standalone: false,
})
export class IonModalPage implements AfterViewInit {
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
