import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { IonModalPageRoutingModule } from './ion-modal-routing.module';

import { IonModalPage } from './ion-modal.page';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    IonModalPageRoutingModule,
  ],
  declarations: [IonModalPage],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class IonModalPageModule { }
