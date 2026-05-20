import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
 {
  path: 'amor',
  component: TabsPage,
  children: [
   {
    path: 'register',
    loadChildren: () =>
     import('../register/register.module').then((m) => m.RegisterPageModule),
   },
   {
    path: 'login',
    loadChildren: () =>
     import('../login/login.module').then((m) => m.LoginPageModule),
   },
   {
    path: 'tab3',
    loadChildren: () =>
     import('../tab3/tab3.module').then((m) => m.Tab3PageModule),
   },
   {
    path: '',
    redirectTo: '/amor/register',
    pathMatch: 'full',
   },
  ],
 },
 {
  path: '',
  redirectTo: '/amor/register',
  pathMatch: 'full',
 },
];

@NgModule({
 imports: [RouterModule.forChild(routes)],
})
export class TabsPageRoutingModule {}
