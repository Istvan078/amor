import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MainViewContainerComponent } from './main-view-container.component';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule],
  declarations: [MainViewContainerComponent],
  exports: [MainViewContainerComponent],
})
export class MainViewComponentModule {}
