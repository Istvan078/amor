import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FindMatchPageRoutingModule } from './find-match-routing.module';

import { FindMatchPage } from './find-match.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FindMatchPageRoutingModule
  ],
  declarations: [FindMatchPage]
})
export class FindMatchPageModule {}
