import { Component, OnInit, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

type SupportedLang = 'en' | 'hu';

@Component({
  selector: 'app-language-switcher',
  standalone: true,
  template: `
    <div class="language-switcher" aria-label="Language selector">
      <button
        type="button"
        [class.active]="activeLang === 'en'"
        (click)="setLanguage('en')"
      >
        EN
      </button>
      <button
        type="button"
        [class.active]="activeLang === 'hu'"
        (click)="setLanguage('hu')"
      >
        HU
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        top: 54px;
        right: 18px;
        z-index: 10000;
        pointer-events: none;
      }

      .language-switcher {
        display: inline-flex;
        gap: 4px;
        padding: 4px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        background: rgba(12, 16, 30, 0.72);
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.24);
        backdrop-filter: blur(16px);
        pointer-events: auto;
      }

      button {
        min-width: 38px;
        min-height: 32px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: rgba(255, 255, 255, 0.68);
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0;
        cursor: pointer;
        transition:
          background 160ms ease,
          color 160ms ease,
          transform 160ms ease;
      }

      button:hover {
        color: #ffffff;
        transform: translateY(-1px);
      }

      button.active {
        background: linear-gradient(135deg, #ff5d8f, #ff7a59);
        color: #ffffff;
        box-shadow: 0 8px 20px rgba(255, 93, 143, 0.32);
      }

      @media screen and (max-width: 768px) {
        :host {
          top: 50px;
          right: 12px;
        }

        button {
          min-width: 36px;
          min-height: 30px;
        }
      }
    `,
  ],
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
