import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
 {
  path: '',
  loadChildren: () =>
   import('./tabs/tabs.module').then((m) => m.TabsPageModule),
 },
 {
  path: 'ion-modal',
  loadChildren: () =>
   import('./modals/ion-modal/ion-modal.module').then(
    (m) => m.IonModalPageModule
   ),
 },
 {
  path: 'find-match',
  loadChildren: () =>
   import('./find-match/find-match.module').then((m) => m.FindMatchPageModule),
 },
];
@NgModule({
 imports: [
  RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
 ],
 exports: [RouterModule],
})
export class AppRoutingModule {}
