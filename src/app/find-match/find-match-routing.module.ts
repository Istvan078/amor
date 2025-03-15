import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FindMatchPage } from './find-match.page';

const routes: Routes = [
  {
    path: '',
    component: FindMatchPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FindMatchPageRoutingModule {}
