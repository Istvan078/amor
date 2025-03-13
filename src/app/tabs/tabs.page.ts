import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BaseService } from '../services/base.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit {
  loggedUser: any;
  userProf: any;
  constructor(
    private auth: AuthService,
    private base: BaseService,
    private router: Router
  ) {}
  async ngOnInit() {
    this.auth.loggedUserSubject.subscribe(async (usr) => {
      this.loggedUser = usr;
      if (this.loggedUser?.uid) {
        this.userProf = await this.base.getUserProf(this.loggedUser.uid);
        if (this.userProf) {
          this.base.userProfBehSubj.next(this.userProf);
          this.router.navigate(['/tabs/tab3']);
        }
      }
    });
  }
}
