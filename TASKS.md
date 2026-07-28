# TASKS.md — Sdílená paměť pro AI (Chrome MVP)

## Rozhodnutí a předpoklady

- **Bez `@crxjs/vite-plugin`.** Aktuální beta verze má nestabilní chování se
  service workerem + dynamickou registrací content scriptů. Místo toho tři
  samostatné Vite build konfigurace (sidepanel / background / content),
  všechny zapisují do `dist/`. Splňuje požadavek "použij Vite", bez rizika
  nestabilního pluginu.
- **Žádné statické `content_scripts` v manifestu.** Aktivace ChatGPT/Claude
  adaptérů řeší service worker přes `chrome.scripting.registerContentScripts`
  po udělení `optional_host_permissions` — přesné znění zadání to výslovně
  umožňuje ("registruj dynamicky").
- **UUID:** `crypto.randomUUID()` (nativní ve všech extension kontextech),
  žádná externí závislost.
- **Živé ověření DOM ChatGPT/Claude composeru nebylo možné.** Vyžaduje
  přihlášený účet uživatele, což si nástroj nesmí sám zajistit (hesla/cookies
  jsou mimo rozsah). Adaptéry proto obsahují více fallback strategií
  (role/aria/contenteditable/data-testid) + diagnostický režim a jsou jasně
  označené jako vyžadující ruční ověření na živém webu.
- Storage vrstva: `chrome.storage.local` přes `ChromeStorageRepository`
  implementující `MemoryRepository` — UI, content skripty i background s ní
  pracují pouze přes toto rozhraní, takže výměna za IndexedDB znamená napsat
  jen novou implementaci rozhraní.

## Nejrizikovější části

1. Skutečná DOM struktura composeru ChatGPT/Claude — nemožné ověřit naživo v
   tomto běhu → nutné ruční otestování po instalaci.
2. Dynamická registrace content scriptů po `chrome.permissions.request` —
   pořadí volání (permission → registerContentScripts → případná injekce do
   již otevřené karty přes `chrome.scripting.executeScript`, protože nově
   zaregistrovaný content script se do už otevřené karty sám nenastřelí).
3. Rozpoznání ProseMirror/contenteditable composeru a korektní vyvolání
   `input`/`change` událostí tak, aby si framework stránky všiml změny.

## Etapy

- [x] Etapa 1 — Analýza a plán, TASKS.md
- [x] Etapa 2 — Build základ: manifest, sidepanel shell, service worker, storage, typy
- [x] Etapa 3 — Paměť/profily CRUD, relevance, formátování, unit testy
- [x] Etapa 4 — ChatGPT adapter (detekce, tlačítko, náhled, vložení, diagnostika)
- [x] Etapa 5 — Claude adapter (sdílené UI přes common moduly)
- [x] Etapa 6 — Import/export, smazání dat, PRIVACY.md, stránka Soukromí
- [x] Etapa 7 — Dokončení: build, testy, kontrola oprávnění/CSP/síť, README
