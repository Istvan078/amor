import {
  AfterViewInit,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { NgForm } from '@angular/forms';
import { ConfigService } from '../services/config.service';
import { ModalController } from '@ionic/angular';
import { IonModalPage } from '../modals/ion-modal/ion-modal.page';
import { AuthService } from '../services/auth.service';
import { Promotions } from '../models/promotions.model';
import { Router } from '@angular/router';

@Component({
  selector: 'app-main-view-container',
  templateUrl: './main-view-container.component.html',
  styleUrls: ['./main-view-container.component.scss'],
  standalone: false,
})
export class MainViewContainerComponent implements OnInit, AfterViewInit {
  @Input() name?: string;
  @Input() viewData: any;
  @Output() submitData: EventEmitter<any> = new EventEmitter();
  @ViewChild('ngForm') ngForm!: NgForm;
  viewArrayValues: any[] = [];
  viewArrayKeys: any[] = [];
  labels: any = {};
  user: any;
  promotions: Promotions[] = [];
  userProfSaved: boolean = false;
  constructor(
    private config: ConfigService,
    private modalCtrl: ModalController,
    private auth: AuthService,
    private router: Router
  ) {}
  ngOnInit(): void {
    this.auth.loggedUserSubject.subscribe((usr) => {
      this.user = usr;
    });
    setTimeout(() => {
      this.getViewData();
      console.log(this.viewData);
    }, 2000);
    this.setPromotion();
  }
  ngAfterViewInit(): void {
    // if (this.viewData?.data)
    //   setTimeout(() => {
    //     this.ngForm.form.setValue(this.viewData.data);
    //   }, 1000);
  }
  getViewData() {
    if (this.viewData?.firstName) {
      this.viewArrayValues = Object.values(this.viewData);
      this.labels = this.config.getLabels(true);
      this.viewArrayKeys = Object.keys(this.viewData);
    }
    if (this.viewData?.data) {
      this.viewArrayValues = Object.values(this.viewData.data);
      this.viewArrayKeys = Object.keys(this.viewData.data);
    }
  }

  setPromotion() {
    this.promotions = this.config.getPromotions();
  }
  onSubmit(form: NgForm) {
    console.log(form.value);
    this.submitData.emit(form.value);
  }

  async signOut() {
    await this.auth.signOut();
    this.user = null;
    this.router.navigate(['/tabs/tab2']);
  }
}
