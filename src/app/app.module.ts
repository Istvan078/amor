import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

// import { environment } from 'src/environments/environment';
import { environment } from 'src/environments/environment.prod';
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { AngularFireStorageModule } from '@angular/fire/compat/storage';

@NgModule({
 declarations: [AppComponent],
 schemas: [CUSTOM_ELEMENTS_SCHEMA],
 imports: [
  BrowserModule,
  IonicModule.forRoot(),
  AppRoutingModule,
  AngularFireModule.initializeApp(environment.firebaseConfig),
  AngularFirestoreModule,
  AngularFireAuthModule,
  AngularFireStorageModule,
 ],
 providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
 bootstrap: [AppComponent],
})
export class AppModule {}
