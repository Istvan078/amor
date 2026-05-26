import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { IonIcon } from '@ionic/angular/standalone';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  checkmarkCircle,
  closeOutline,
  diamondOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
} from 'ionicons/icons';

import { AuthStore } from '../../../auth/store/auth.store';
import { BillingPackage } from '../../data-access/billing.repository';
import { BillingStore } from '../../store/billing.store';

@Component({
  selector: 'app-paywall',
  templateUrl: './paywall.component.html',
  styleUrls: ['./paywall.component.scss'],
  standalone: true,
  imports: [IonIcon, TranslocoDirective],
})
export class PaywallComponent implements OnInit {
  @Input() promotionId?: string;

  readonly selectedPackageId = signal<string | null>(null);
  readonly selectedPackage = computed(() => {
    const selectedId = this.selectedPackageId();

    return (
      this.billingStore.offerings().find((offer) => offer.id === selectedId) ??
      this.billingStore.offerings()[0] ??
      null
    );
  });
  readonly selectedPackageIdForTemplate = computed(
    () => this.selectedPackage()?.id ?? null
  );
  readonly selectedFeatureKeys = computed(
    () => this.selectedPackage()?.featureKeys ?? []
  );

  readonly billingStore = inject(BillingStore);
  private authStore = inject(AuthStore);
  private modalCtrl = inject(ModalController);
  private transloco = inject(TranslocoService);

  constructor() {
    addIcons({
      arrowForwardOutline,
      checkmarkCircle,
      closeOutline,
      diamondOutline,
      refreshOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
    });
  }

  async ngOnInit() {
    const uid = this.authStore.user()?.uid;

    await this.billingStore.initBilling(uid);
    this.selectInitialPackage();
  }

  packageTrackBy(_index: number, offer: BillingPackage) {
    return offer.id;
  }

  selectPackage(packageId: string) {
    this.selectedPackageId.set(packageId);
  }

  async purchaseSelectedPackage() {
    const selectedPackage = this.selectedPackage();

    if (!selectedPackage) {
      return;
    }

    const purchased = await this.billingStore.purchasePackage(selectedPackage.id);

    if (purchased) {
      await this.modalCtrl.dismiss({ purchased: true });
    }
  }

  async restorePurchases() {
    const restored = await this.billingStore.restorePurchases();

    if (restored && this.billingStore.isPremium()) {
      await this.modalCtrl.dismiss({ restored: true });
    }
  }

  close() {
    return this.modalCtrl.dismiss({ dismissed: true });
  }

  getTitle(offer: BillingPackage) {
    return this.transloco.translate(offer.titleKey);
  }

  private selectInitialPackage() {
    const offers = this.billingStore.offerings();

    if (!offers.length) {
      this.selectedPackageId.set(null);
      return;
    }

    const promotedOffer = offers.find(
      (offer) => offer.promotionId === this.promotionId
    );
    const featuredOffer = offers.find((offer) => offer.isFeatured);

    this.selectedPackageId.set(
      promotedOffer?.id ?? featuredOffer?.id ?? offers[0].id
    );
  }
}
