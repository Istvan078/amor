import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import {
  IonIcon,
  IonLabel,
  IonTabBar,
  IonTabButton,
  IonTabs,
} from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { BaseService } from '../../services/base.service';
import { UserClass } from '../../shared/models/user.model';

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private base = inject(BaseService);

  loggedUser: any;
  userProf?: UserClass;

  private subscriptions = new Subscription();

  ngOnInit() {
    this.subscriptions.add(
      this.auth.loggedUserSubject.subscribe((user) => {
        this.loggedUser = user;
      })
    );

    this.subscriptions.add(
      this.base.userProfBehSubj.subscribe((profile) => {
        this.userProf = profile;
      })
    );
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
  }

  openUserCard() {
    this.base.mainDataSubject.next({
      userSettings: true,
      amor: true,
      phoneView: true,
    });
  }

  showMatchesCard() {
    this.base.mainDataSubject.next({
      userSettings: false,
    });
  }

  showMessages() {
    this.base.mainDataSubject.next({
      messaging: true,
      phoneView: true,
    });
  }
}