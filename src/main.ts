import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { register as registerSwiperElements } from 'swiper/element/bundle';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

registerSwiperElements();

bootstrapApplication(AppComponent, {...appConfig, providers: [provideZoneChangeDetection(), ...appConfig.providers]}).catch((err) => {
  console.error(err);
});