import { ApplicationConfig, importProvidersFrom, isDevMode } from '@angular/core';
import {
    PreloadAllModules,
    RouteReuseStrategy,
    provideRouter,
    withPreloading,
} from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';

import {
    IonicRouteStrategy,
    provideIonicAngular,
} from '@ionic/angular/standalone';

import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { getStorage, provideStorage } from '@angular/fire/storage';

import { provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';
import { environment } from '../environments/environment';

export const appConfig: ApplicationConfig = {
    providers: [
        provideIonicAngular(),

        {
            provide: RouteReuseStrategy,
            useClass: IonicRouteStrategy,
        },

        provideRouter(routes, withPreloading(PreloadAllModules)),
        provideHttpClient(),

        provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
        provideAuth(() => getAuth()),
        provideFirestore(() => getFirestore()),
        provideStorage(() => getStorage()),

        provideTransloco({
            config: {
                availableLangs: ['en', 'hu'],
                defaultLang: 'en',
                fallbackLang: 'en',
                reRenderOnLangChange: true,
                prodMode: !isDevMode(),
            },
            loader: TranslocoHttpLoader,
        }),

        provideServiceWorker('ngsw-worker.js', {
            enabled: environment.production,
            registrationStrategy: 'registerWhenStable:30000',
        }),
    ],
};