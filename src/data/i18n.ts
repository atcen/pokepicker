export interface Language { code: string; label: string }

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: 'en',      label: 'English'     },
  { code: 'de',      label: 'Deutsch'     },
  { code: 'fr',      label: 'Français'    },
  { code: 'es',      label: 'Español'     },
  { code: 'it',      label: 'Italiano'    },
  { code: 'ja',      label: '日本語'       },
  { code: 'ja-Hrkt', label: 'かな'         },
  { code: 'ko',      label: '한국어'       },
  { code: 'zh-Hans', label: '中文'         },
];

const LANG_KEY = 'pkm_lang';

let currentLang: string = localStorage.getItem(LANG_KEY) ?? 'en';
let names: Record<number, Record<string, string>> = {};
let typeNames: Record<string, Record<string, string>> = {};

export function currentLanguage(): string {
  return currentLang;
}

export function setLanguage(code: string): void {
  currentLang = code;
  localStorage.setItem(LANG_KEY, code);
}

export function loadNames(data: Record<number, Record<string, string>>): void {
  names = data;
}

export function loadTypeNames(data: Record<string, Record<string, string>>): void {
  typeNames = data;
}

export function getName(id: number, fallback: string): string {
  return names[id]?.[currentLang]
    ?? names[id]?.['en']
    ?? fallback;
}

export function getTypeName(type: string): string {
  return typeNames[type]?.[currentLang]
    ?? typeNames[type]?.['en']
    ?? type;
}
