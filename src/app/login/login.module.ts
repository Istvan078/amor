import { IonicModule } from '@ionic/angular';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LoginPage } from './login.page';
import { MainViewComponentModule } from '../main-view-container/main-view-container.module';

import { LoginPageRoutingModule } from './login-routing.module';

@NgModule({
 imports: [
  IonicModule,
  CommonModule,
  FormsModule,
  MainViewComponentModule,
  LoginPageRoutingModule,
 ],
 declarations: [LoginPage],
})
export class LoginPageModule {}
