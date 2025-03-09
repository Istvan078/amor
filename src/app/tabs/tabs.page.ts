import { Component, OnInit } from '@angular/core';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  standalone: false,
})
export class TabsPage implements OnInit{
  loggedUser:any
  constructor(private auth: AuthService) {}
  ngOnInit(): void {
    this.auth.loggedUserSubject.subscribe(usr => {
      this.loggedUser = usr
    })
  }
}
