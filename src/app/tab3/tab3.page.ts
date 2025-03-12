import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit {
  loggedUser: any;
  userProf: any;

  constructor(private auth: AuthService, private base: BaseService) {}

  async ngOnInit() {
    this.auth.loggedUserSubject.subscribe(async (usr) => {
      this.loggedUser = usr;
      this.userProf = await this.base.getUserProf(this.loggedUser?.uid);
    });
  }
}
