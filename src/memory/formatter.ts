import type { MemoryItem } from "./types";
import { t, type Language } from "../shared/i18n";

/**
 * Sestaví text, který se vloží do textového pole ChatGPT/Claude: původní
 * dotaz uživatele na začátku + krátký blok kontextu s jasnými instrukcemi
 * pro model až za ním. Pokud nejsou vybrané žádné vzpomínky, vrátí dotaz
 * beze změny. Jazyk bloku sleduje nastavení rozhraní (`lang`) — nemá vliv
 * na to, v jakém jazyce si uživatel dotaz sám napsal.
 *
 * Dotaz je záměrně na začátku, ne kontext: ChatGPT/Claude si v poli pro
 * psaní pamatují historii dřívějších zpráv a její náhled/autocomplete
 * zobrazuje jen první řádky textu — kdyby kontext byl první, celá historie
 * by v náhledu vypadala jako řada identických „[RELEVANTNÍ KONTEXT O
 * UŽIVATELI]" řádků a uživatel by v ní nenašel svoje dřívější dotazy.
 */
export function formatMemoryContext(
  memories: MemoryItem[],
  query: string,
  lang: Language = "cs",
): string {
  if (memories.length === 0) {
    return query;
  }

  const bullets = memories.map((m) => `- ${m.text}`).join("\n");

  return [query, "", t(lang, "formatter.header"), bullets, "", t(lang, "formatter.instruction")].join(
    "\n",
  );
}
