import { Routes } from '@angular/router';

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
                loadComponent: () =>
                    import('./features/auth/register/register.page').then(
                        (m) => m.RegisterPage
                    ),
            },
            {
                path: 'login',
                loadComponent: () =>
                    import('./features/auth/login/login.page').then((m) => m.LoginPage),
            },
            {
                path: 'discover',
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