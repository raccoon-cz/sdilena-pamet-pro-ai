// Prázdná lokální konfigurace úmyslně existuje, aby PostCSS nehledal a
// nepoužil nesouvisející globální konfiguraci výš ve stromu adresářů
// (např. ~/tailwind.config.js) — tento projekt žádný PostCSS plugin
// nepotřebuje, CSS je čisté a bez závislostí.
export default {
  plugins: {},
};
