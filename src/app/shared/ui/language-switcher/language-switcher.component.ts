import { Component, OnInit, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

type SupportedLang = 'en' | 'hu';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  templateUrl: './language-switcher.component.html',
  styleUrls: ['./language-switcher.component.scss'],
})
export class LanguageSwitcherComponent implements OnInit {
  private transloco = inject(TranslocoService);
  activeLang: SupportedLang = 'en';

  ngOnInit() {
    this.activeLang = this.normalizeLang(this.transloco.getActiveLang());
  }

  setLanguage(lang: SupportedLang) {
    this.activeLang = lang;
    this.transloco.setActiveLang(lang);

    try {
      localStorage.setItem('amor.lang', lang);
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  private normalizeLang(lang: string): SupportedLang {
    return lang === 'hu' ? 'hu' : 'en';
  }
}
