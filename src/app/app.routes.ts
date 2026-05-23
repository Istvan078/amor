import { Routes } from '@angular/router';
import { publicOnlyGuard } from './features/auth/guards/public-only.guard';
import { authGuard } from './features/auth/guards/auth.guard';

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
                canMatch: [authGuard],
                loadComponent: () =>
                    import('./features/discover/pages/discover.page').then(
                        (m) => m.DiscoverPage
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
        path: '**',
        redirectTo: 'amor/register',
    },
];