# Soukromí — Sdílená paměť pro AI

Toto rozšíření je navrženo tak, aby veškerá vaše data zůstala **výhradně ve
vašem počítači**.

## Co rozšíření ukládá

- Vzpomínky, které si sami vytvoříte (text, kategorie, klíčová slova, profil,
  příznaky „vždy používat“ / „citlivé“ / aktivní).
- Profily, které si sami vytvoříte.
- Vaše nastavení (limity kontextu, výchozí profil apod.).
- Technický stav připojení k ChatGPT/Claude (zda bylo uděleno oprávnění).

Všechna tato data se ukládají pouze přes `chrome.storage.local` — lokální
úložiště prohlížeče vázané na váš profil v tomto počítači.

## Co rozšíření neukládá a nedělá

- **Neexistuje žádný server tvůrce rozšíření.** Data se nikam neodesílají,
  nikde se nezálohují mimo váš počítač a tvůrce k nim nemá žádný přístup.
- **Žádná telemetrie ani analytika.** Rozšíření nesleduje, jak ho používáte.
- **Žádné čtení hesel nebo přihlašovacích cookies.** Rozšíření nemá důvod ani
  oprávnění k nim přistupovat a nepokouší se o to.
- **Žádné automatické odesílání zpráv.** Rozšíření nikdy samo neklikne na
  tlačítko Odeslat v ChatGPT nebo Claude.
- **Žádná registrace uživatele.** Rozšíření nevyžaduje účet ani přihlášení.

## Kdy se data dostanou k OpenAI nebo Anthropic

Vybrané vzpomínky se stanou součástí požadavku na ChatGPT nebo Claude **jen
tehdy**, když:

1. sami vyberete, které vzpomínky chcete použít (nebo necháte doplněk
   navrhnout výběr, který si prohlédnete),
2. sami kliknete na „Vložit do dotazu“,
3. sami odešlete výsledný dotaz tlačítkem Odeslat v dané službě.

Bez tohoto vašeho výslovného kroku se žádná vzpomínka nikam neodesílá.

## Co smazání dat neovlivní

Smazání vzpomínek, profilů nebo kompletní smazání všech dat v tomto
rozšíření **neodstraní** zprávy, které jste již dříve odeslali do historie
ChatGPT nebo Claude — ty spravují dané služby samy, mimo toto rozšíření.

## Oprávnění

Rozšíření nežádá o přístup k ChatGPT ani Claude, dokud sami nekliknete na
„Připojit“ v sekci „Připojené AI“. Přístup k doméně můžete kdykoli odebrat
tlačítkem „Odpojit“, aniž by se smazaly vaše uložené vzpomínky.
