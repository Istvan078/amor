import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { addIcons } from 'ionicons';
import {
  accessibilityOutline,
  arrowBackOutline,
  arrowDownOutline,
  arrowForwardOutline,
  briefcaseOutline,
  chatbubbleEllipsesOutline,
  chatbubblesOutline,
  closeCircle,
  closeOutline,
  createOutline,
  exitOutline,
  heart,
  heartOutline,
  logInOutline,
  mailOutline,
  peopleOutline,
  person,
  personAddOutline,
  refreshOutline,
  returnUpBackOutline,
  saveOutline,
  sendOutline,
  starOutline,
} from 'ionicons/icons';
import { register as registerSwiperElements } from 'swiper/element/bundle';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

registerSwiperElements();
addIcons({
  accessibilityOutline,
  arrowBackOutline,
  arrowDownOutline,
  arrowForwardOutline,
  briefcaseOutline,
  chatbubbleEllipsesOutline,
  chatbubblesOutline,
  closeCircle,
  closeOutline,
  createOutline,
  exitOutline,
  heart,
  heartOutline,
  logInOutline,
  mailOutline,
  peopleOutline,
  person,
  personAddOutline,
  refreshOutline,
  returnUpBackOutline,
  saveOutline,
  sendOutline,
  starOutline,
});

bootstrapApplication(AppComponent, {...appConfig, providers: [provideZoneChangeDetection(), ...appConfig.providers]}).catch((err) => {
  console.error(err);
});
