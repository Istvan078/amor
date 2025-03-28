import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MainViewContainerComponent } from './main-view-container.component';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { MessageComponentModule } from '../messages/message/message.module';

@NgModule({
 imports: [CommonModule, FormsModule, IonicModule, MessageComponentModule],
 declarations: [MainViewContainerComponent],
 exports: [MainViewContainerComponent],
 schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class MainViewComponentModule {}
