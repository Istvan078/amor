import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { interval } from 'rxjs';
import { Platform, ToastController } from '@ionic/angular';
import { TranslocoService } from '@jsverse/transloco';

@Injectable({
  providedIn: 'root'
})
export class UpdateService {

  constructor(
    private swUpdate: SwUpdate,
    private toastController: ToastController,
    private platform: Platform,
    private transloco: TranslocoService
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
      message: this.transloco.translate('update.available'),
      position: 'top',
      duration: 120000,
      buttons: [
        {
          text: this.transloco.translate('update.reload'),
          role: 'update',
          handler: () => {
            this.activateUpdate();
          }
        },
        {
          text: this.transloco.translate('update.dismiss'),
          role: 'cancel'
        }
      ]
    });
    await toast.present();
  }
} 
