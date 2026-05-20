import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { interval } from 'rxjs';
import { Platform, ToastController } from '@ionic/angular';

@Injectable({
  providedIn: 'root'
})
export class UpdateService {

  constructor(
    private swUpdate: SwUpdate,
    private toastController: ToastController,
    private platform: Platform
  ) {
  }

  // Frissítés ellenőrzése
  async checkForUpdate(): Promise<void> {
    try {
      interval(10 * 1000).subscribe(async () => {
        const sub =this.swUpdate.versionUpdates.subscribe(val => {
          console.log(val.type)
          sub.unsubscribe();
        });
        const hasUpdate = await this.swUpdate.checkForUpdate();
        if (hasUpdate) {
          await this.onUpdateAvailable();
        }
      });

    } catch (err) {
      console.error('Hiba a frissítés ellenőrzésekor:', err);
    }
  }

  // Frissítés aktiválása
  async activateUpdate(): Promise<void> {
    try {
      window.location.reload();
    } catch (err) {
      console.error('Hiba a frissítés aktiválásakor:', err);
    }
  }

  // Frissítés elérhető
  private async onUpdateAvailable(): Promise<void> {
    try {
      if (this.platform.is('cordova')) {
        // Mobil alkalmazás esetén
        await this.showUpdateNotification();
      } else {
        // Web alkalmazás esetén
        await this.showUpdateNotification();
      }
    } catch (err) {
      console.error('Hiba a toast megjelenítésekor:', err);
    }
  }

  private async showUpdateNotification(): Promise<void> {
    const toast = await this.toastController.create({
      message: 'Új verzió elérhető!',
      position: 'top',
      duration: 120000,
      buttons: [
        {
          text: 'Frissítés',
          role: 'update',
          handler: () => {
            this.activateUpdate();
          }
        },
        {
          text: 'Mégse',
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }
} 