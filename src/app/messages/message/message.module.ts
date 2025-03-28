import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { MessageComponent } from './message.component';

@NgModule({
 imports: [CommonModule, FormsModule, IonicModule],
 declarations: [MessageComponent],
 exports: [MessageComponent],
 schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class MessageComponentModule {}
