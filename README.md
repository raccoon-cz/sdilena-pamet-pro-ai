# Sdílená paměť pro AI

Jedna soukromá paměť pro ChatGPT a Claude. **Všechna data zůstávají pouze ve
vašem počítači** — žádný backend, žádný účet, žádná telemetrie.

Chrome rozšíření (Manifest V3) umožňuje uložit informace, které si mají AI
pamatovat ("vzpomínky"), rozdělit je do profilů (Osobní / Práce / …), a při
psaní dotazu v ChatGPT nebo Claude si vybrat, které z nich se mají vložit do
textu — vždy s náhledem a vždy s ručním odesláním. Rozšíření samo nikdy
nic neodesílá.

## Rychlý start

```bash
npm install
npm run build
```

Výsledná složka pro načtení do Chrome: **`dist/`**

1. Otevřete `chrome://extensions`.
2. Zapněte „Režim pro vývojáře" (Developer mode) vpravo nahoře.
3. Klikněte na „Načíst rozbalené" / „Load unpacked".
4. Vyberte složku `dist/` z tohoto projektu.
5. Klikněte na ikonu rozšíření v liště Chrome — otevře se boční panel.

## Příkazy

| Příkaz | Co dělá |
|---|---|
| `npm install` | Nainstaluje závislosti |
| `npm run build` | Produkční build do `dist/` (smaže a znovu vytvoří) |
| `npm run dev` | Vývojový režim — sleduje změny a přebuilduje `dist/` (po změně stačí v `chrome://extensions` kliknout na ikonu obnovení u rozšíření) |
| `npm test` | Spustí všechny unit/integrační testy (Vitest) |
| `npm run typecheck` | Projde TypeScript build bez emitování souborů |
| `npm run lint` | ESLint nad `src/` a `tests/` |
| `npm run icons` | Znovu vygeneruje ikony (`scripts/make_icons.py`, vyžaduje Python 3 + Pillow) |

## Stav testů (poslední ověřený běh)

```
npm run typecheck   → bez chyb
npm run lint        → bez chyb
npm test            → 10 test souborů, 88 testů, vše passed
npm run build       → sidepanel + background + content + assets, bez chyb
```

Pokrytí testů:

- [tests/relevance.test.ts](tests/relevance.test.ts) — normalizace textu a diakritiky, shoda klíčových slov, filtrování podle profilu/aktivace, strop na „upřednostněné" (`maxAlwaysUseMemories`) s garantovaným místem pro kontextové výsledky, limit počtu i znaků, odstranění duplicit, přednost distinktivních (vzácnějších) slov před opakovanou obecnou frází, nikdy neposílá vše automaticky.
- [tests/formatter.test.ts](tests/formatter.test.ts) — formátování bloku kontextu, chování bez vybraných vzpomínek.
- [tests/storage.test.ts](tests/storage.test.ts) — CRUD nad `chrome.storage.local`, hromadná úprava (`saveMemories`), výchozí hodnoty, chování při poškozených datech.
- [tests/importExport.test.ts](tests/importExport.test.ts) — validace importu, merge/replace, export.
- [tests/text.test.ts](tests/text.test.ts) — normalizace, diakritika, návrh klíčových slov (`suggestKeywords`), heuristický stemmer (`stemWord`).
- [tests/deduplication.test.ts](tests/deduplication.test.ts) — nalezení dvojic téměř identických vzpomínek napříč celou pamětí.
- [tests/conflicts.test.ts](tests/conflicts.test.ts) — detekce a řešení konfliktů profilů (stejné ID, jiný název) při importu.
- [tests/factDetection.test.ts](tests/factDetection.test.ts) — deterministická detekce vět s osobním sdělením (česky i anglicky) a jejich kategorizace.
- [tests/i18n.test.ts](tests/i18n.test.ts) — slovník překladů: cs a en mají přesně stejnou sadu klíčů, žádný text není prázdný, `t()` dosazuje proměnné a bezpečně spadne zpět na češtinu.
- [tests/sidepanel.integration.test.ts](tests/sidepanel.integration.test.ts) — integrační běh skutečného UI v jsdomu: CRUD vzpomínek/profilů, hromadné akce, vyhledávání/filtry, návrh klíčových slov, kontrola duplicit, přepnutí jazyka rozhraní za běhu, skrytí a opětovné zobrazení úvodní nápovědy (viz „Známá omezení" níže, proč tento test vznikl navíc).

## Hlavní soubory

```
manifest.json                        — Manifest V3 (minimální oprávnění)
src/background/serviceWorker.ts      — správa oprávnění + dynamická registrace content scriptů
src/content/contentScript.ts         — vstupní bod injektovaný do ChatGPT/Claude
src/content/memoryButton.ts          — plovoucí tlačítko "Použít paměť"
src/content/previewDialog.ts         — náhled a výběr vzpomínek před vložením
src/providers/ProviderAdapter.ts     — společné rozhraní pro AI adaptéry
src/providers/BaseAdapter.ts         — sdílená logika (detekce, vkládání textu, diagnostika)
src/providers/chatgpt/ChatGPTAdapter.ts
src/providers/claude/ClaudeAdapter.ts
src/memory/relevance.ts              — výběr relevantních vzpomínek (čistá funkce)
src/memory/formatter.ts              — formátování textu vkládaného do dotazu
src/memory/deduplication.ts          — odstranění téměř identických vzpomínek
src/storage/MemoryRepository.ts      — rozhraní úložiště
src/storage/ChromeStorageRepository.ts — implementace nad chrome.storage.local
src/importExport/                    — export/import/validace JSON
src/sidepanel/                       — UI (Přehled, Moje paměť, Profily, Připojené AI, Nastavení)
PRIVACY.md                           — popis zpracování dat
TASKS.md                             — rozhodnutí, rizika a stav etap
```

## Architektura ve zkratce

- **Žádný `@crxjs/vite-plugin`.** Tři samostatné Vite konfigurace
  (`vite.config.sidepanel.ts`, `vite.config.background.ts`,
  `vite.config.content.ts`) staví do `dist/`, `scripts/copy-assets.js`
  zkopíruje `manifest.json` a ikony. Menší riziko než nestabilní beta plugin,
  pořád ale plně "Vite".
- **Dynamická registrace content scriptů.** V manifestu nejsou žádné
  statické `content_scripts` — `serviceWorker.ts` je zaregistruje přes
  `chrome.scripting.registerContentScripts` až poté, co uživatel klikne na
  „Připojit" a udělí oprávnění pro danou doménu (`optional_host_permissions`).
  Při „Odpojit" se script odregistruje a oprávnění se odebere; uložené
  vzpomínky zůstávají.
- **Repository vrstva.** UI, content skripty i background přistupují k datům
  jen přes `MemoryRepository` rozhraní (`ChromeStorageRepository`). Výměna za
  IndexedDB znamená napsat novou implementaci rozhraní, ne přepisovat zbytek
  rozšíření.
- **Relevance algoritmus je čistá funkce** (`src/memory/relevance.ts`) bez
  závislosti na Chrome API — žádný lokální model, embedding ani vektorová
  databáze. Jde o čitelné bodování (shoda klíčových slov / slov / kategorie),
  ořezané na `maxMemoriesPerPrompt` a `maxContextCharacters`, s odstraněním
  duplicit. Nikdy neodešle všechny vzpomínky automaticky — vždy jen návrh k
  potvrzení. Vzpomínky označené „Upřednostnit" mají vlastní strop
  `maxAlwaysUseMemories` (výchozí 3) — i kdyby jich bylo přes import
  označeno desítky, zbytek limitu zůstává vyhrazený pro vzpomínky relevantní
  k aktuálnímu dotazu; mezi „upřednostněnými" navíc vyhrávají ty, které jsou
  k dotazu relevantní taky.
- **Vložení do dotazu nikdy neodešle zprávu.** Content script text jen
  vloží do textového pole (`writeEditableText` v `src/providers/domUtils.ts`)
  a korektně vyvolá `input`/`change` události; kliknutí na Odeslat provádí
  vždy sám uživatel.

## Práce s pamětí — hromadná správa

Pro větší množství vzpomínek (např. po importu desítek položek najednou)
nabízí „Moje paměť":

- **Hledání a filtry** — textové vyhledávání (text + klíčová slova), filtr
  podle profilu, kategorie a přepínač „Jen upřednostněné".
- **Hromadné akce** — zaškrtnutím více karet se objeví lišta s akcí
  Aktivovat / Deaktivovat / Zapnout či vypnout „Upřednostnit" / Přesunout do
  profilu / Smazat, aplikovanou na všechny vybrané najednou
  (`MemoryRepository.saveMemories` čte a zapisuje úložiště jen jednou, ne
  jednou na položku).
- **Návrh klíčových slov** — tlačítko „Navrhnout z textu" v okně
  přidání/úpravy vzpomínky (a stejnojmenná hromadná akce pro víc vybraných
  najednou) doplní klíčová slova podle textu (`suggestKeywords` v
  `src/shared/text.ts`), aby i bulkem importované vzpomínky bez klíčových
  slov měly šanci na přesnější shodu.
- **České skloňování a anglické přípony** — `stemWord()` v
  [`shared/text.ts`](src/shared/text.ts) odsekává běžné pádové koncovky
  (čeština) a přípony (angličtina) ze seznamu, ne jen prvních pár znaků slova
  — takže dotaz s „kavárna" najde i vzpomínku s „kavárně"/„kavárnu" a "work"
  najde "working"/"worked". Pořád jde o hrubou náhradu za lemmatizaci, ne
  lingvisticky úplný stemmer, ale je přesnější a méně náchylný na falešné
  shody než původní "stejná první 4 písmena".
- **Vzácná slova váží víc než opakovaná výplň** — `selectRelevantMemories()`
  spočítá, v kolika vzpomínkách z aktuálního profilu se každé slovo objevuje
  (`computeDocumentFrequency`), a shodu na slově, které se opakuje jen v
  málu vzpomínek, ohodnotí bonusem navíc oproti slovu, které je běžné napříč
  skoro vším. Řeší to konkrétně stížnost "pořád se nabízí ty samé obecné
  vzpomínky" — dřív měly dvě vzpomínky se stejným počtem shodných slov
  stejné skóre bez ohledu na to, jak specifické to slovo bylo.
- **Transparentnost, když se nic jiného nenajde** — pokud náhled ukazuje
  jen vzpomínky označené „Upřednostnit" a k žádné jiné z uložených
  vzpomínek nebyla nalezena shoda s konkrétním dotazem, náhled to
  vysvětlí a odkáže na doplnění klíčových slov, místo aby to vypadalo
  jako chyba.
- **Možné duplicity** — tlačítko „Zkontrolovat duplicity" v „Moje paměť"
  projde celou uloženou paměť (`findDuplicatePairs` v
  `src/memory/deduplication.ts`) a nabídne dvojice téměř identických
  vzpomínek k ručnímu rozhodnutí (smazat jednu, nebo ponechat obě) — typicky
  užitečné po importu z více zdrojů, kde se osobní fakta často překrývají.
- **Konflikty profilů při importu** — pokud importovaný soubor obsahuje
  profil se stejným ID jako už existující, ale jiným názvem
  (`findProfileConflicts`/`resolveProfileConflicts` v
  `src/importExport/conflicts.ts`), náhled importu nabídne pro každý takový
  konflikt volbu, který název ponechat, místo aby se stávající tiše přepsal.

## Formát vkládaného textu — dotaz na začátku, kontext za ním

`formatMemoryContext()` v [formatter.ts](src/memory/formatter.ts) vkládá do
pole nejdřív **dotaz uživatele** a až za něj blok
„[RELEVANTNÍ KONTEXT O UŽIVATELI]" — ne naopak. Důvod: ChatGPT i Claude si
v poli pro psaní pamatují historii dřívějších zpráv a jejich
autocomplete/historie zobrazuje jen první řádky uloženého textu. Kdyby byl
kontext první, každá položka v historii by v náhledu vypadala stejně
(„[RELEVANTNÍ KONTEXT O UŽIVATELI]…") a nedalo by se v ní najít, na co se
uživatel kdy ptal. S dotazem na začátku historie zůstává použitelná.

## Onboarding

Na Přehledu se při první instalaci (dokud uživatel kartu nezavře) zobrazí
uvítací karta se čtyřmi kroky: uložit první vzpomínku → připojit ChatGPT
nebo Claude v „Připojené AI" → najít plovoucí tlačítko na stránce → vybrat a
vložit vzpomínky z náhledu. Stav se ukládá jako `onboardingDismissed` v
nastavení (`src/memory/types.ts`, `DEFAULT_SETTINGS` v
`src/shared/constants.ts`) — kartu jde kdykoli vrátit tlačítkem „Zobrazit
úvodní nápovědu znovu" v Nastavení, které nastaví `onboardingDismissed` zpět
na `false` a přesměruje na Přehled.

## Nabídka uložení a klávesová zkratka

- **"Uložit jako vzpomínku?"** — zatímco uživatel píše dotaz, jednoduchá
  deterministická detekce (`detectPersonalFact` v
  `src/memory/factDetection.ts`, žádné AI, žádné čtení odpovědí ani historie
  konverzace) rozpozná věty typu "Jmenuji se…", "Bydlím…", "Pracuji jako…",
  "Preferuji…" v textu, který si uživatel právě sám píše. Pokud takovou větu
  najde, u tlačítka se objeví nenápadná nabídka s náhledem přesného textu a
  tlačítky „Uložit" / „Ne, díky" — nic se neděje automaticky, uživatel má
  vždy poslední slovo.
- **Klávesová zkratka** (`chrome.commands`, výchozí `Alt+Shift+M`,
  přenastavitelná v `chrome://extensions/shortcuts`) otevře náhled paměti
  pro rozepsaný dotaz stejně jako kliknutí na plovoucí tlačítko — nezávisle
  na tom, kde přesně tlačítko na dané stránce sedí.

## Čeština a angličtina

Rozšíření funguje v obou jazycích na třech nezávislých úrovních:

- **Obsah vzpomínek a dotazů** — vzpomínky, klíčová slova i dotazy si
  můžete psát v libovolném jazyce. Shoda podle klíčových slov
  ([relevance.ts](src/memory/relevance.ts)) na tom nezávisí vůbec.
- **Algoritmus relevance** — seznam nevýznamných slov (stopslova), nápovědy
  kategorií a detekce osobních sdělení ([factDetection.ts](src/memory/factDetection.ts))
  obsahují česká i anglická slova/vzory **zároveň**, bez nutnosti cokoliv
  přepínat — funguje to současně pro oba jazyky.
- **Rozhraní** (side panel, tlačítko, nabídka uložení, náhled a text
  vkládaný do ChatGPT/Claude) — přepínatelné v Nastavení → Jazyk rozhraní
  (`ExtensionSettings.language`). Veškerý UI text čerpá z centrálního
  slovníku [i18n.ts](src/shared/i18n.ts) přes funkci `t(jazyk, klíč)`
  místo natvrdo psaného textu, takže přidání dalšího jazyka v budoucnu
  znamená jen doplnit další sloupec do slovníku.

## Ruční testovací checklist

Nejde plně nahradit automatickými testy (vyžaduje reálný Chrome a přihlášené
účty ChatGPT/Claude). Po `npm run build` a načtení `dist/` přes „Load
unpacked" projděte:

- [ ] Rozšíření se načte bez chyb v `chrome://extensions`.
- [ ] Kliknutím na ikonu v liště se otevře boční panel.
- [ ] Přehled ukazuje 0 vzpomínek a profil „Osobní" jako aktivní.
- [ ] V „Profily" lze vytvořit nový profil, přejmenovat ho, aktivovat, nastavit jako výchozí a smazat (kromě posledního zbývajícího).
- [ ] V „Moje paměť" lze vytvořit vzpomínku (text, profil, kategorie, klíčová slova, „upřednostnit", „citlivé"), upravit ji, deaktivovat a smazat.
- [ ] Tlačítko „Navrhnout z textu" v okně vzpomínky doplní klíčová slova podle napsaného textu.
- [ ] Vyhledávání a filtry (kategorie, „Jen upřednostněné") v „Moje paměť" správně zúží seznam.
- [ ] Zaškrtnutím více vzpomínek se objeví lišta hromadných akcí; aplikace akce (např. Deaktivovat) se projeví na všech vybraných.
- [ ] Data přežijí zavření a restart Chrome (zkontrolovat po restartu prohlížeče).
- [ ] V „Připojené AI" lze kliknout na „Připojit" u ChatGPT — objeví se systémový dialog s žádostí o oprávnění k `chatgpt.com`.
- [ ] Po udělení oprávnění se na otevřené kartě ChatGPT objeví malé kulaté tlačítko „🧠" vedle composeru, bez překryvu textu, mikrofonu, tlačítka Odeslat nebo upozornění „AI může dělat chyby".
- [ ] Psaní víc řádků textu nebo změna velikosti okna posune tlačítko spolu s composerem (sleduje ho přes `ResizeObserver`, ne pevnou pozici).
- [ ] Totéž zopakovat pro Claude (`claude.ai`).
- [ ] Pokud tlačítko/textové pole nejde najít, „Nastavení → Diagnostika → Zkontrolovat aktuální kartu" ukáže srozumitelnou technickou chybu (ne pád rozšíření).
- [ ] Napsat text do dotazu na ChatGPT/Claude, kliknout na plovoucí tlačítko — otevře se náhled vybraných vzpomínek.
- [ ] V náhledu lze jednotlivé vzpomínky zapnout/vypnout, citlivé jsou označené.
- [ ] Kliknutí na „Vložit do dotazu" vloží formátovaný kontext do textového pole.
- [ ] Rozšíření samo NEODESÍLÁ zprávu — původní tlačítko Odeslat dané služby dál funguje normálně a odeslání provede uživatel sám.
- [ ] Napsání věty typu „Jmenuji se…" nebo „Pracuji jako…" do dotazu zobrazí nabídku „Uložit jako vzpomínku?"; „Uložit" ji skutečně přidá do „Moje paměť".
- [ ] Klávesová zkratka `Alt+Shift+M` na ChatGPT/Claude otevře náhled paměti stejně jako kliknutí na tlačítko.
- [ ] Přepnutí „Jazyk rozhraní" v Nastavení na angličtinu přeloží celý side panel (nadpisy, tlačítka, navigaci) i text tlačítka/nabídky/náhledu na ChatGPT/Claude.
- [ ] Export v „Nastavení" stáhne čitelný JSON soubor se vzpomínkami/profily/nastavením.
- [ ] Import stejného souboru ukáže náhled počtu profilů/vzpomínek a nabídne sloučení/nahrazení.
- [ ] Import souboru s profilem stejného ID, ale jiného názvu než stávající, nabídne v náhledu volbu, který název ponechat.
- [ ] „Zkontrolovat duplicity" v „Moje paměť" najde dvě téměř identické vzpomínky a umožní jednu smazat.
- [ ] „Odpojit" u ChatGPT/Claude odebere oprávnění a přestane nabízet tlačítko, ale vzpomínky zůstanou zachované.
- [ ] „Smazat veškerá lokální data" po potvrzení skutečně vše smaže (Přehled znovu ukazuje 0 vzpomínek).

## Živý test na přihlášených účtech (22. 7. 2026) a opravy

Rozšíření bylo otestováno na živých, přihlášených stránkách chatgpt.com a
claude.ai (build i kód nebyly při testu upravovány). Report odhalil dvě
funkční chyby, obě od té doby opravené:

- **Vkládání kontextu do Claude composeru nefungovalo** — dialog náhledu se
  zavřel, ale text v poli zůstal beze změny. Příčina: Claude staví editor
  nad ProseMirrorem, který si drží vlastní interní model dokumentu a při
  dalším renderu přepíše jakoukoli přímou DOM manipulaci nebo
  `execCommand("insertText")` zpět na starý obsah — proto se vložení navenek
  jevilo jako tiché selhání. Oprava v
  [`writeEditableText`](src/providers/domUtils.ts): text se teď vkládá
  primárně simulací nativní `paste` události (`ClipboardEvent` s
  `DataTransfer`), kterou ProseMirror standardně zachytává a zpracuje přes
  vlastní transformační pipeline; `execCommand`/přímý zápis zůstávají jako
  fallback pro jednodušší contenteditable pole.
- **Nabídka "Uložit jako vzpomínku?" nebyla viditelná** (na ChatGPT se vůbec
  nezobrazila, na Claude se vytvořil hostitelský prvek o rozměru 0×0 na
  spodním okraji obrazovky). Příčina: hostitelský `<div>` v
  [`factSuggestion.ts`](src/content/factSuggestion.ts) nikdy nedostal
  `position: fixed` — nastavovat `top`/`left` na staticky pozicovaném prvku
  nemá žádný vizuální efekt, takže hostitel kolaboval na velikost 0×0.
  Oprava přidává stejné kritické `!important` styly (`position: fixed`,
  `z-index`, skryto do doby, než je spočítána pozice), jaké už používá
  plovoucí tlačítko v `memoryButton.ts`. Tahle chyba zároveň vysvětluje, proč
  test anglické detekce faktů (F3) nenašel žádnou viditelnou nabídku —
  nešlo o chybu detekce, ale o tenhle pozicovací bug.

Drobné zlepšení: po úspěšném importu (sloučení i nahrazení) se teď v modálu
zobrazí krátké potvrzení („Import dokončen.") před automatickým zavřením —
dřív modál zmizel bez jakékoli zpětné vazby o úspěchu.

Části, které živý test nemohl ověřit kvůli bezpečnostním omezením
sandboxované automatizace (interní `chrome://` stránky a obsah bočního
panelu nejde z bezpečnostních důvodů ovládat automatizací): kompletní správa
profilu, CRUD/hromadné akce/kontrola duplicit v „Moje paměť", a fyzické
ověření klávesové zkratky Alt+Shift+M proti `chrome://extensions/shortcuts`.
Tyto části zůstávají doporučené k ručnímu ověření (viz checklist výše).

## Známá omezení

- **Selektory ChatGPT/Claude composeru nebyly ověřeny na živé, přihlášené
  stránce.** Nástroj, který tento kód vytvořil, nemá (a nesmí mít) přístup k
  vašim přihlašovacím údajům, takže reálnou DOM strukturu nešlo za běhu
  zkontrolovat. Adaptéry (`src/providers/chatgpt/ChatGPTAdapter.ts`,
  `src/providers/claude/ClaudeAdapter.ts`) proto obsahují řetězec fallback
  strategií (známé selektory → obecná detekce podle `contenteditable`/role →
  textarea) a diagnostický režim, který ukáže, která strategie uspěla nebo
  že selhaly všechny. Pokud po instalaci tlačítko/vložení nefunguje, tyto dva
  soubory jsou první místo k úpravě — `runDetectionStrategies` v
  `src/providers/domUtils.ts` stačí doplnit o novou strategii.
- **Umístění tlačítka "Použít paměť" řeší skutečná kolizní detekce, ne
  odhad pevné mezery.** Klíčový poznatek (ověřený ruční inspekcí živých,
  přihlášených stránek): rect textového pole (`#prompt-textarea` na
  ChatGPT, `[data-testid="chat-input"]` na Claude) **není totéž** co rect
  vizuální "karty" composeru — u ChatGPT editor nezahrnuje tlačítko „+" ani
  panel s modelem/mikrofonem vpravo, u Claude nezahrnuje spodní toolbar
  vůbec. Pozicovat cokoli podle rectu samotného editoru proto nevyhnutelně
  vede ke kolizím. Řešení:
  - `findComposerSurface()` v [domUtils.ts](src/providers/domUtils.ts)
    vystoupá od nalezeného textového pole DOM stromem a najde nejbližšího
    předka, který geometricky vypadá jako celá vizuální karta composeru
    (obsahuje šířku editoru, má zaoblené rohy ≥12px, obsahuje aspoň dva
    viditelné ovládací prvky) — bez spoléhání na konkrétní CSS třídy.
  - `positionButtonNear()` v [memoryButton.ts](src/content/memoryButton.ts)
    pak zkusí několik kandidátních pozic okolo tohoto "surface" rectu
    (vlevo/vpravo/nad/pod) a vybere první, která reálně nekoliduje se
    žádným viditelným tlačítkem, odkazem, formulářovým prvkem ani
    upozorněním na stránce (`collectObstacleRects` skutečně prochází
    `document.querySelectorAll` v okolí composeru a testuje průnik
    obdélníků) — místo aby jen odhadovala pevnou mezeru v pixelech.
  - `BaseAdapter` sleduje přes `ResizeObserver` velikost **jak** textového
    pole, tak jeho surface (aby reagoval na růst obou), přepočet je
    sloučený přes `requestAnimationFrame` (nejvýš jednou za snímek, i při
    rychlém scrollu/psaní).
  - Když composer nebyl nalezen vůbec, tlačítko se schová (`visibility:
    hidden`) — nemá smysl zobrazovat ho "někde na obrazovce" bez vztahu ke
    composeru.
- Kategorizace relevance podle kategorie (`CATEGORY_HINTS` v
  `src/memory/relevance.ts`) je hrubá heuristika na několika českých slovech,
  ne jazykový model.
- Algoritmus relevance dělá jen heuristické odseknutí koncovek (`stemWord` v
  `shared/text.ts`), ne skutečnou lemmatizaci — u nepravidelných tvarů nebo
  synonym nemusí najít shodu. Vzpomínku i klíčová slova proto vyplácí zapsat
  v základním, často používaném tvaru.

## Neověřené části

- Živá funkčnost `ChatGPTAdapter` a `ClaudeAdapter` na aktuální produkční
  verzi obou webů (viz výše).
- Chování `chrome.scripting.registerContentScripts` napříč verzemi Chrome
  (testováno jen podle dokumentace, ne na více verzích prohlížeče).

## Doporučené další kroky

1. Po instalaci projít ruční checklist výše na reálném ChatGPT/Claude účtu a
   podle diagnostiky doladit selektory v `ChatGPTAdapter.ts`/`ClaudeAdapter.ts`.
2. Pokud se composer podaří spolehlivě najít, zvážit doplnění malé sady
   „live fixture" testů (uložený HTML snapshot stránky) pro adaptéry.
3. Až budou selektory ověřené, přidat další provider adaptéry (Gemini,
   Perplexity, Grok) stejným vzorem — `ProviderAdapter` rozhraní a
   `BaseProviderAdapter` už jsou na to připravené.
