import { Component, OnInit } from '@angular/core';
import { UpdateService } from './services/update.service';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  constructor(
    private updateService: UpdateService,
    private swUpdate: SwUpdate
  ) {

  }

  ngOnInit() {
    if (this.swUpdate.isEnabled) {
        this.updateService.checkForUpdate();
    }
  }
}
