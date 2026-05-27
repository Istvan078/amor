import { Routes } from '@angular/router';
import { publicOnlyGuard } from './features/auth/guards/public-only.guard';
import { authGuard } from './features/auth/guards/auth.guard';
import { privacyConsentGuard } from './features/privacy/guards/privacy-consent.guard';
import { adminGuard } from './features/admin/guards/admin.guard';

export const routes: Routes = [
    {
        path: '',
        redirectTo: 'amor/register',
        pathMatch: 'full',
    },
    {
        path: 'amor',
        loadComponent: () =>
            import('./layout/tabs/tabs.page').then((m) => m.TabsPage),
        children: [
            {
                path: 'register',
                canMatch: [publicOnlyGuard],
                loadComponent: () =>
                    import('./features/auth/register/register.page').then(
                        (m) => m.RegisterPage
                    ),
            },
            {
                path: 'login',
                canMatch: [publicOnlyGuard],
                loadComponent: () =>
                    import('./features/auth/login/login.page').then((m) => m.LoginPage),
            },
            {
                path: 'discover',
                canMatch: [privacyConsentGuard],
                loadComponent: () =>
                    import('./features/discover/pages/discover.page').then(
                        (m) => m.DiscoverPage
                    ),
            },
            {
                path: 'privacy',
                canMatch: [authGuard],
                loadComponent: () =>
                    import('./features/privacy/privacy-preferences/privacy-preferences.page').then(
                        (m) => m.PrivacyPreferencesPage
                    ),
            },
            {
                path: '',
                redirectTo: 'register',
                pathMatch: 'full',
            },
        ],
    },
    {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
            import('./features/admin/admin.page').then((m) => m.AdminPage),
    },
    {
        path: '**',
        redirectTo: 'amor/register',
    },
];
