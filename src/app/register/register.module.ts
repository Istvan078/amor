import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RegisterPage } from './register.page';
import { MainViewComponentModule } from '../main-view-container/main-view-container.module';

import { RegisterPageRoutingModule } from './register-routing.module';

@NgModule({
 imports: [
  IonicModule,
  CommonModule,
  FormsModule,
  MainViewComponentModule,
  RegisterPageRoutingModule,
 ],
 declarations: [RegisterPage],
})
export class RegisterPageModule {}
