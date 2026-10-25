// Tema claro/escuro. Preferência do usuário (salva) > preferência do sistema. Chave própria e leve no localStorage,
// lida também por um script inline no <head> (index.html) para aplicar o tema ANTES da primeira pintura (sem flash).
export const THEME_KEY = 'itasul-tema';

// saved: 'claro' | 'escuro' | null  ·  systemDark: boolean
export const resolveTheme = (saved, systemDark) => (saved === 'claro' || saved === 'escuro' ? saved : systemDark ? 'escuro' : 'claro');
export const nextTheme = (current) => (current === 'escuro' ? 'claro' : 'escuro');

const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
export const readSaved = (storage = window.localStorage) => safe(() => storage.getItem(THEME_KEY));
const writeSaved = (v, storage = window.localStorage) => safe(() => (v ? storage.setItem(THEME_KEY, v) : storage.removeItem(THEME_KEY)));

export function initTheme({ root = document.documentElement, button, onChange } = {}) {
  const mq = safe(() => window.matchMedia('(prefers-color-scheme: dark)'));
  const current = () => root.dataset.theme || resolveTheme(readSaved(), mq?.matches);
  const apply = (theme, animate = false) => {
    if (animate) { root.classList.add('theme-anim'); setTimeout(() => root.classList.remove('theme-anim'), 300); }
    root.dataset.theme = theme;
    root.style.colorScheme = theme === 'escuro' ? 'dark' : 'light';
    if (button) {
      const dark = theme === 'escuro';
      button.setAttribute('aria-pressed', String(dark));
      button.setAttribute('aria-label', dark ? 'Tema escuro ativo. Ativar tema claro' : 'Tema claro ativo. Ativar tema escuro');
      button.title = dark ? 'Tema escuro ativo — clique para o tema claro' : 'Tema claro ativo — clique para o tema escuro';
      button.dataset.theme = theme;
    }
    onChange?.(theme);
  };
  apply(current());
  button?.addEventListener('click', () => { const t = nextTheme(current()); writeSaved(t); apply(t, true); });
  // Sem preferência salva, acompanha o sistema operacional ao vivo; com preferência salva, o usuário manda.
  mq?.addEventListener?.('change', () => { if (!readSaved()) apply(resolveTheme(null, mq.matches)); });
  return {
    current,
    followSystem() { writeSaved(null); apply(resolveTheme(null, mq?.matches), true); },
    isFollowingSystem: () => !readSaved(),
  };
}
