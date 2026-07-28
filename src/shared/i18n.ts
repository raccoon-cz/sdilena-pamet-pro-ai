/**
 * Centrální slovník překladů. Žádná závislost na Chrome API — čistý modul,
 * testovatelný samostatně. UI i content-scriptové texty čerpají texty přes
 * `t(lang, key, vars)` místo natvrdo psaného textu, aby šlo rozšíření
 * používat v češtině i v angličtině podle nastavení `ExtensionSettings.language`.
 */

export type Language = "cs" | "en";

export const LANGUAGES: Language[] = ["cs", "en"];

const cs = {
  // --- Aplikační shell ----------------------------------------------------
  "app.title": "Sdílená paměť pro AI",
  "app.settingsButtonTitle": "Nastavení",
  "nav.overview": "Přehled",
  "nav.memories": "Moje paměť",
  "nav.profiles": "Profily",
  "nav.providers": "Připojené AI",

  // --- Společné -----------------------------------------------------------
  "common.cancel": "Zrušit",
  "common.confirm": "Potvrdit",
  "common.delete": "Smazat",
  "common.activate": "Aktivovat",
  "common.deactivate": "Deaktivovat",
  "common.connected": "Připojeno",
  "common.notConnected": "Nepřipojeno",
  "common.yes": "ano",
  "common.no": "ne",
  "common.none": "žádná",

  // --- Přehled -------------------------------------------------------------
  "overview.title": "Přehled",
  "overview.subtitle":
    "Jedna soukromá paměť pro všechny vaše AI. Data zůstávají pouze ve vašem počítači.",
  "overview.addMemoryButton": "+ Přidat vzpomínku",
  "overview.savedMemoriesLabel": "Uložených vzpomínek",
  "overview.activeMemoriesLabel": "Aktivních vzpomínek",
  "overview.activeProfileLabel": "Aktivní profil",
  "overview.noneLabel": "Žádný",
  "overview.lastChangeLabel": "Poslední místní změna",
  "overview.neverLabel": "Zatím žádná",

  // --- Úvodní nápověda (onboarding) -------------------------------------------
  "onboarding.title": "Vítejte ve Sdílené paměti",
  "onboarding.subtitle": "Čtyři kroky, jak to celé funguje — kdykoli se sem vrátíte z Nastavení.",
  "onboarding.step1Title": "1. Uložte první vzpomínku",
  "onboarding.step1Text":
    "Klikněte na „Přidat vzpomínku“ níže — napište cokoli, co by o vás měla AI vědět (např. čím se živíte nebo jaký styl odpovědí preferujete).",
  "onboarding.step2Title": "2. Připojte ChatGPT nebo Claude",
  "onboarding.step2Text":
    "V sekci „Připojené AI“ povolte přístup ke stránce, se kterou chcete paměť sdílet. Nic se nesdílí, dokud to sami nepovolíte.",
  "onboarding.step3Title": "3. Najděte plovoucí tlačítko",
  "onboarding.step3Text":
    "Na chatgpt.com nebo claude.ai se u pole pro psaní objeví malé kulaté tlačítko 🧠 — to otevírá náhled paměti pro aktuální dotaz.",
  "onboarding.step4Title": "4. Vyberte a vložte",
  "onboarding.step4Text":
    "V náhledu si odškrtnete, které vzpomínky se mají použít, a teprve po kliknutí na „Vložit do dotazu“ se text objeví v poli — nic se neposílá samo.",
  "onboarding.dismissButton": "Rozumím, skrýt",

  // --- Moje paměť ----------------------------------------------------------
  "memories.title": "Moje paměť",
  "memories.subtitle": "Vzpomínky, které si mají AI pamatovat. Vy rozhodujete, které se použijí.",
  "memories.addButton": "+ Přidat vzpomínku",
  "memories.duplicatesButton": "Zkontrolovat duplicity",
  "memories.captureSelectionButton": "Uložit označený text jako vzpomínku",
  "memories.captureComposerButton": "Převzít rozepsaný text z dotazu",
  "memories.loadingSelection": "Načítám označený text…",
  "memories.loadingComposer": "Načítám rozepsaný text…",
  "memories.openAndConnectFirst":
    "Otevřete kartu s ChatGPT nebo Claude a nejprve ji připojte v sekci „Připojené AI“.",
  "memories.noSelectionFound": "Na stránce není označený žádný text.",
  "memories.composerNotFound": "Textové pole dotazu se nepodařilo najít nebo je prázdné.",
  "memories.searchPlaceholder": "Hledat v textu nebo klíčových slovech…",
  "memories.allProfilesOption": "Všechny profily",
  "memories.activeProfileOption": "Aktivní profil",
  "memories.allCategoriesOption": "Všechny kategorie",
  "memories.preferredOnlyLabel": "Jen upřednostněné",
  "memories.emptyStateNoMemories":
    "Zatím tu nemáte žádné vzpomínky. Přidejte první tlačítkem výše.",
  "memories.emptyStateNoMatch": "Žádná vzpomínka neodpovídá zadanému filtru nebo hledání.",
  "memories.alwaysUseCapWarning":
    "{count} vzpomínek v aktivním profilu má „Upřednostnit“, ale do jednoho dotazu se jich vejde nejvýš {cap} (viz Nastavení). Zbytek se použije, jen když je zrovna relevantní k dotazu.",
  "memories.selectMemoryAriaLabel": "Vybrat vzpomínku",
  "memories.editButton": "Upravit",
  "memories.deleteConfirmTitle": "Smazat vzpomínku?",
  "memories.deleteConfirmMessage": "Tuto akci nelze vrátit zpět.",
  "memories.badgePreferred": "Upřednostnit",
  "memories.badgeSensitive": "Citlivé",
  "memories.badgeInactive": "Neaktivní",

  "bulk.preferOn": "Zapnout „Upřednostnit“",
  "bulk.preferOff": "Vypnout „Upřednostnit“",
  "bulk.moveProfile": "Přesunout do profilu…",
  "bulk.suggestKeywords": "Navrhnout klíčová slova z textu",
  "bulk.apply": "Použít",
  "bulk.clearSelection": "Zrušit výběr",
  "bulk.selectedCount": "Vybráno: {count}",
  "bulk.deleteConfirmTitle": "Smazat {count} vzpomínek?",

  // --- Profily -------------------------------------------------------------
  "profiles.title": "Profily",
  "profiles.subtitle":
    "Vzpomínky přiřazené jinému profilu se běžně nepoužijí — hodí se pro oddělení osobního a pracovního života.",
  "profiles.newNamePlaceholder": "Název nového profilu, např. Práce",
  "profiles.createButton": "+ Vytvořit profil",
  "profiles.memoriesCountBadge": "{count} vzpomínek",
  "profiles.activeBadge": "Aktivní",
  "profiles.defaultBadge": "Výchozí",
  "profiles.saveNameButton": "Uložit název",
  "profiles.setDefaultButton": "Nastavit jako výchozí",
  "profiles.cannotDeleteTitle": "Nelze smazat",
  "profiles.cannotDeleteMessage": "Musí zůstat aspoň jeden profil.",
  "profiles.understoodButton": "Rozumím",
  "profiles.deleteConfirmTitle": "Smazat profil „{name}“?",
  "profiles.deleteConfirmMessageWithMemories":
    "Profil obsahuje {count} vzpomínek. Ty zůstanou uložené, ale nebudou přiřazené k žádnému profilu, dokud je ručně nepřesunete.",

  // --- Připojené AI --------------------------------------------------------
  "providers.title": "Připojené AI",
  "providers.subtitle":
    "Oprávnění se žádá až po kliknutí na „Připojit“ — rozšíření nic nezjišťuje, dokud mu to výslovně nedovolíte.",
  "providers.connectButton": "Připojit",
  "providers.disconnectButton": "Odpojit",
  "providers.requestingPermission": "Žádám o oprávnění…",
  "providers.connectFailed": "Připojení se nezdařilo: {error}",
  "providers.unknownError": "neznámá chyba",
  "providers.permissionDenied": "Oprávnění nebylo uděleno, zkuste to prosím znovu.",
  "providers.disconnectConfirmTitle": "Odpojit {provider}?",
  "providers.disconnectConfirmMessage":
    "Rozšíření přestane na této stránce nabízet vkládání paměti a odebere oprávnění k doméně. Vaše uložené vzpomínky zůstanou zachované.",

  // --- Nastavení -----------------------------------------------------------
  "settings.title": "Nastavení",
  "settings.generalSectionTitle": "Obecná nastavení",
  "settings.showOnboardingButton": "Zobrazit úvodní nápovědu znovu",
  "settings.maxMemoriesLabel": "Maximální počet vzpomínek v jednom kontextu",
  "settings.maxMemoriesHint": "Výchozí hodnota je 8.",
  "settings.includeAlwaysUseLabel": "Automaticky zahrnout vzpomínky označené „Upřednostnit“",
  "settings.maxAlwaysUseLabel": "Kolik „upřednostněných“ vzpomínek smí nejvýš zabrat místo najednou",
  "settings.maxAlwaysUseHint":
    "Výchozí hodnota je 3. Zbytek limitu výše zůstává vyhrazený pro vzpomínky relevantní k aktuálnímu dotazu — i kdyby bylo „upřednostněných“ vzpomínek desítky, nezablokují místo pro ostatní.",
  "settings.maxContextCharsLabel": "Maximální délka kontextu (počet znaků)",
  "settings.maxContextCharsHint": "Výchozí hodnota je 2 500.",
  "settings.showPreviewLabel": "Před vložením vždy zobrazit náhled vybraných vzpomínek",
  "settings.languageLabel": "Jazyk rozhraní",
  "settings.languageCzech": "Čeština",
  "settings.languageEnglish": "Angličtina",
  "settings.backupSectionTitle": "Zálohování dat",
  "settings.backupHint":
    "Export vytvoří čitelný soubor se všemi profily, vzpomínkami a nastavením.",
  "settings.exportButton": "Exportovat vše do souboru",
  "settings.importButton": "Importovat ze souboru",
  "settings.importParseError": "Soubor nelze importovat: {errors}",
  "settings.importReadError": "Soubor se nepodařilo přečíst — není to platný JSON soubor.",
  "settings.dangerZoneTitle": "Nebezpečná zóna",
  "settings.wipeButton": "Smazat veškerá lokální data",
  "settings.wipeConfirmTitle": "Opravdu smazat vše?",
  "settings.wipeConfirmMessage":
    "Nevratně se smažou všechny profily, vzpomínky, nastavení a stav připojení uložené v tomto rozšíření. Nic z toho nepůjde vrátit zpět.",
  "settings.wipeConfirmButton": "Smazat vše",

  // --- Diagnostika ----------------------------------------------------------
  "diagnostics.title": "Diagnostika",
  "diagnostics.subtitle":
    "Zobrazuje jen technické informace (verze, nalezení stránky/tlačítka) — nikdy obsah vašich zpráv nebo vzpomínek.",
  "diagnostics.checkButton": "Zkontrolovat aktuální kartu",
  "diagnostics.copyButton": "Zkopírovat diagnostiku",
  "diagnostics.copiedButton": "Zkopírováno ✓",
  "diagnostics.copyFailedButton": "Kopírování se nezdařilo",
  "diagnostics.extensionVersionLabel": "Verze rozšíření",
  "diagnostics.notSupportedPage":
    "Aktuální karta není podporovaná AI stránka, nebo pro ni ještě nebylo uděleno oprávnění.",
  "diagnostics.hostnameLabel": "Hostname",
  "diagnostics.unknownHostname": "neznámý",
  "diagnostics.noResponse":
    "Content script na stránce neodpověděl (možná je potřeba obnovit stránku).",
  "diagnostics.providerLabel": "Rozpoznaný provider",
  "diagnostics.pageSupportedLabel": "Stránka podporovaná",
  "diagnostics.composerFoundLabel": "Textové pole dotazu nalezeno",
  "diagnostics.detectionStrategyLabel": "Úspěšná detekční strategie",
  "diagnostics.buttonInsertedLabel": "Tlačítko vloženo",
  "diagnostics.lastErrorLabel": "Poslední technická chyba",

  // --- Soukromí --------------------------------------------------------------
  "privacy.title": "Soukromí",
  "privacy.point1":
    "Všechna vaše data (vzpomínky, profily, nastavení) jsou uložena pouze ve vašem počítači, v úložišti prohlížeče.",
  "privacy.point2":
    "Tvůrce tohoto rozšíření nemá k vašim datům žádný přístup — neexistuje žádný server, kam by se odesílala.",
  "privacy.point3": "Rozšíření neobsahuje žádnou analytiku ani sledování používání.",
  "privacy.point4": "Rozšíření nekontroluje ani nečte vaše hesla nebo přihlašovací údaje.",
  "privacy.point5":
    "Vybrané vzpomínky se odešlou do ChatGPT nebo Claude jen tehdy, když je sami vložíte do dotazu a dotaz sami odešlete.",
  "privacy.point6":
    "Smazání dat v tomto rozšíření nijak neovlivní zprávy, které jste už dříve odeslali v historii ChatGPT nebo Claude.",

  // --- Modál vzpomínky --------------------------------------------------------
  "memoryModal.textPlaceholder": "Např. Vlastním B2B úklidovou firmu v Brně.",
  "memoryModal.keywordsPlaceholder": "klíčová slova oddělená čárkou",
  "memoryModal.suggestButton": "Navrhnout z textu",
  "memoryModal.textEmptyError": "Text vzpomínky nemůže být prázdný.",
  "memoryModal.noProfileError": "Nejprve vytvořte aspoň jeden profil.",
  "memoryModal.saveChangesButton": "Uložit změny",
  "memoryModal.saveButton": "Uložit vzpomínku",
  "memoryModal.editTitle": "Upravit vzpomínku",
  "memoryModal.addTitle": "Přidat vzpomínku",
  "memoryModal.textFieldLabel": "Text vzpomínky",
  "memoryModal.profileFieldLabel": "Profil",
  "memoryModal.categoryFieldLabel": "Kategorie",
  "memoryModal.keywordsFieldLabel": "Klíčová slova",
  "memoryModal.alwaysUseLabel": "Upřednostnit (bez ohledu na dotaz, v rámci limitu)",
  "memoryModal.sensitiveLabel": "Citlivá informace",
  "memoryModal.enabledLabel": "Aktivní",

  // --- Import modál -----------------------------------------------------------
  "importModal.title": "Náhled importu",
  "importModal.summary": "Soubor obsahuje {profiles} profil(ů) a {memories} vzpomínek.",
  "importModal.mergeOption": "Sloučit se stávajícími daty (podle ID)",
  "importModal.replaceOption": "Nahradit veškerá stávající data",
  "importModal.conflictsTitle": "Konflikty profilů",
  "importModal.conflictHint": "Tento profil už máte pod stejným ID, ale s jiným názvem:",
  "importModal.keepExisting": "Ponechat stávající název „{name}“",
  "importModal.useImported": "Použít název z importu „{name}“",
  "importModal.importButton": "Importovat",
  "importModal.importSuccess": "Import dokončen.",

  // --- Modál duplicit -----------------------------------------------------------
  "duplicatesModal.title": "Možné duplicity",
  "duplicatesModal.noneFound": "V uložené paměti nebyly nalezeny žádné téměř identické vzpomínky.",
  "duplicatesModal.instructions":
    "Vzpomínky s velmi podobným textem — u každé dvojice vyberte, kterou (pokud nějakou) smazat.",
  "duplicatesModal.noMoreToResolve": "Žádné další duplicity k vyřešení.",
  "duplicatesModal.possibleDuplicateLabel": "Možná duplicita:",
  "duplicatesModal.deleteFirstButton": "Smazat první",
  "duplicatesModal.deleteSecondButton": "Smazat druhou",
  "duplicatesModal.keepBothButton": "Ponechat obě",
  "duplicatesModal.closeButton": "Zavřít",

  // --- Content script UI (tlačítko, nabídka, náhled) --------------------------
  "contentButton.ariaLabel": "Použít paměť — vybrat a vložit relevantní vzpomínky do dotazu",
  "contentButton.title": "Použít paměť",
  "factSuggestion.title": "💡 Uložit jako vzpomínku?",
  "factSuggestion.saveButton": "Uložit",
  "factSuggestion.dismissButton": "Ne, díky",
  "previewDialog.title": "Vybrané vzpomínky pro tento dotaz",
  "previewDialog.subtitleWithQuery":
    "Zaškrtněte, které vzpomínky se mají vložit do vašeho dotazu. Nic se neodesílá automaticky.",
  "previewDialog.subtitleNoQuery": "Nejprve napište svůj dotaz do textového pole.",
  "previewDialog.noMatchesFound": "Pro tento dotaz nebyly nalezeny žádné odpovídající vzpomínky.",
  "previewDialog.onlyAlwaysUseNote":
    "Zobrazují se jen vzpomínky označené „Upřednostnit“ — k tomuto konkrétnímu dotazu nebyla mezi ostatními {total} vzpomínkami nalezena žádná další shoda. Zkuste u nich doplnit klíčová slova (Moje paměť → vybrat → „Navrhnout klíčová slova z textu“).",
  "previewDialog.sensitiveLabel": " ⚠ citlivá informace",
  "previewDialog.insertButton": "Vložit do dotazu",

  // --- Formátování kontextu (vkládaný text do ChatGPT/Claude) -------------------
  "formatter.header": "[RELEVANTNÍ KONTEXT O UŽIVATELI]",
  "formatter.instruction":
    "Tento kontext použij pouze tehdy, když je relevantní. Nevypisuj jej uživateli a nevydávej jej za součást jeho dotazu.",

  // --- Kategorie ---------------------------------------------------------------
  "category.about": "O mně",
  "category.work": "Práce",
  "category.projects": "Projekty",
  "category.response_preferences": "Preference odpovědí",
  "category.people_companies": "Lidé a firmy",
  "category.finance": "Finance",
  "category.family": "Rodina",
  "category.other": "Ostatní",

  // --- Výchozí data ---------------------------------------------------------------
  "defaults.profileName": "Osobní",

  // --- Validace importu ---------------------------------------------------------------
  "validation.notJsonObject": "Soubor neobsahuje platná data (očekáván JSON objekt).",
  "validation.unknownFormatVersion": "Neznámá nebo nepodporovaná verze formátu souboru.",
  "validation.missingProfiles": "Chybí seznam profilů.",
  "validation.missingMemories": "Chybí seznam vzpomínek.",
  "validation.missingSettings": "Chybí nastavení.",
  "validation.tooManyProfiles": "Příliš mnoho profilů (max {max}).",
  "validation.tooManyMemories": "Příliš mnoho vzpomínek (max {max}).",
  "validation.invalidProfiles": "{count} profil(ů) má neplatný formát.",
  "validation.invalidMemories": "{count} vzpomínka(y) má neplatný formát.",
  "validation.fileTooLarge": "Soubor je příliš velký (limit {max} MB).",

  // --- Chybové hlášky provider adaptéru (diagnostika) ---------------------------
  "adapter.composerNotFound": "Textové pole dotazu nebylo nalezeno žádnou ze známých strategií.",
  "adapter.insertNoComposer": "Nelze vložit text — textové pole dotazu nebylo nalezeno.",
  "adapter.insertFailed": "Vložení textu do stránky se nezdařilo.",
};

const en: Record<keyof typeof cs, string> = {
  "app.title": "Shared Memory for AI",
  "app.settingsButtonTitle": "Settings",
  "nav.overview": "Overview",
  "nav.memories": "My Memory",
  "nav.profiles": "Profiles",
  "nav.providers": "Connected AI",

  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.delete": "Delete",
  "common.activate": "Activate",
  "common.deactivate": "Deactivate",
  "common.connected": "Connected",
  "common.notConnected": "Not connected",
  "common.yes": "yes",
  "common.no": "no",
  "common.none": "none",

  "overview.title": "Overview",
  "overview.subtitle": "One private memory for all your AI. Data stays only on your computer.",
  "overview.addMemoryButton": "+ Add memory",
  "overview.savedMemoriesLabel": "Saved memories",
  "overview.activeMemoriesLabel": "Active memories",
  "overview.activeProfileLabel": "Active profile",
  "overview.noneLabel": "None",
  "overview.lastChangeLabel": "Last local change",
  "overview.neverLabel": "None yet",

  "onboarding.title": "Welcome to Shared Memory",
  "onboarding.subtitle": "Four steps to how this all works — you can come back here anytime from Settings.",
  "onboarding.step1Title": "1. Save your first memory",
  "onboarding.step1Text":
    "Click “Add memory” below — write anything the AI should know about you (e.g. what you do for work or how you like answers formatted).",
  "onboarding.step2Title": "2. Connect ChatGPT or Claude",
  "onboarding.step2Text":
    "In the “Connected AI” section, grant access to the site you want to share memory with. Nothing is shared until you allow it yourself.",
  "onboarding.step3Title": "3. Find the floating button",
  "onboarding.step3Text":
    "On chatgpt.com or claude.ai a small round 🧠 button appears near the composer — it opens a memory preview for your current query.",
  "onboarding.step4Title": "4. Pick and insert",
  "onboarding.step4Text":
    "In the preview, uncheck any memories you don't want used — the text only appears in the composer after you click “Insert into query”, never automatically.",
  "onboarding.dismissButton": "Got it, hide this",

  "memories.title": "My Memory",
  "memories.subtitle": "Memories the AI should remember. You decide which ones get used.",
  "memories.addButton": "+ Add memory",
  "memories.duplicatesButton": "Check for duplicates",
  "memories.captureSelectionButton": "Save selected text as a memory",
  "memories.captureComposerButton": "Use drafted text from the query",
  "memories.loadingSelection": "Loading selected text…",
  "memories.loadingComposer": "Loading drafted text…",
  "memories.openAndConnectFirst":
    "Open a ChatGPT or Claude tab and connect it first in the “Connected AI” section.",
  "memories.noSelectionFound": "No text is selected on the page.",
  "memories.composerNotFound": "The query text field could not be found or is empty.",
  "memories.searchPlaceholder": "Search in text or keywords…",
  "memories.allProfilesOption": "All profiles",
  "memories.activeProfileOption": "Active profile",
  "memories.allCategoriesOption": "All categories",
  "memories.preferredOnlyLabel": "Prioritized only",
  "memories.emptyStateNoMemories": "You don't have any memories yet. Add your first one above.",
  "memories.emptyStateNoMatch": "No memory matches the current filter or search.",
  "memories.alwaysUseCapWarning":
    "{count} memories in the active profile are marked “Prioritize”, but at most {cap} fit into a single query (see Settings). The rest are used only when actually relevant to the query.",
  "memories.selectMemoryAriaLabel": "Select memory",
  "memories.editButton": "Edit",
  "memories.deleteConfirmTitle": "Delete this memory?",
  "memories.deleteConfirmMessage": "This action cannot be undone.",
  "memories.badgePreferred": "Prioritize",
  "memories.badgeSensitive": "Sensitive",
  "memories.badgeInactive": "Inactive",

  "bulk.preferOn": "Turn on “Prioritize”",
  "bulk.preferOff": "Turn off “Prioritize”",
  "bulk.moveProfile": "Move to profile…",
  "bulk.suggestKeywords": "Suggest keywords from text",
  "bulk.apply": "Apply",
  "bulk.clearSelection": "Clear selection",
  "bulk.selectedCount": "Selected: {count}",
  "bulk.deleteConfirmTitle": "Delete {count} memories?",

  "profiles.title": "Profiles",
  "profiles.subtitle":
    "Memories assigned to a different profile normally aren't used — handy for separating personal and work life.",
  "profiles.newNamePlaceholder": "New profile name, e.g. Work",
  "profiles.createButton": "+ Create profile",
  "profiles.memoriesCountBadge": "{count} memories",
  "profiles.activeBadge": "Active",
  "profiles.defaultBadge": "Default",
  "profiles.saveNameButton": "Save name",
  "profiles.setDefaultButton": "Set as default",
  "profiles.cannotDeleteTitle": "Cannot delete",
  "profiles.cannotDeleteMessage": "At least one profile must remain.",
  "profiles.understoodButton": "Got it",
  "profiles.deleteConfirmTitle": "Delete profile “{name}”?",
  "profiles.deleteConfirmMessageWithMemories":
    "The profile contains {count} memories. They'll stay saved, but won't be assigned to any profile until you move them manually.",

  "providers.title": "Connected AI",
  "providers.subtitle":
    "Permission is requested only after clicking “Connect” — the extension checks nothing until you explicitly allow it.",
  "providers.connectButton": "Connect",
  "providers.disconnectButton": "Disconnect",
  "providers.requestingPermission": "Requesting permission…",
  "providers.connectFailed": "Connection failed: {error}",
  "providers.unknownError": "unknown error",
  "providers.permissionDenied": "Permission was not granted, please try again.",
  "providers.disconnectConfirmTitle": "Disconnect {provider}?",
  "providers.disconnectConfirmMessage":
    "The extension will stop offering memory insertion on this page and will remove the domain permission. Your saved memories will remain intact.",

  "settings.title": "Settings",
  "settings.generalSectionTitle": "General settings",
  "settings.showOnboardingButton": "Show the welcome guide again",
  "settings.maxMemoriesLabel": "Maximum number of memories per context",
  "settings.maxMemoriesHint": "Default value is 8.",
  "settings.includeAlwaysUseLabel": "Automatically include memories marked “Prioritize”",
  "settings.maxAlwaysUseLabel": "How many “prioritized” memories may occupy a slot at once",
  "settings.maxAlwaysUseHint":
    "Default value is 3. The rest of the limit above stays reserved for memories relevant to the current query — even with dozens of “prioritized” memories, they won't block room for others.",
  "settings.maxContextCharsLabel": "Maximum context length (characters)",
  "settings.maxContextCharsHint": "Default value is 2,500.",
  "settings.showPreviewLabel": "Always show a preview of selected memories before inserting",
  "settings.languageLabel": "Interface language",
  "settings.languageCzech": "Czech",
  "settings.languageEnglish": "English",
  "settings.backupSectionTitle": "Data backup",
  "settings.backupHint": "Export creates a readable file with all profiles, memories, and settings.",
  "settings.exportButton": "Export everything to a file",
  "settings.importButton": "Import from file",
  "settings.importParseError": "File cannot be imported: {errors}",
  "settings.importReadError": "The file could not be read — it is not a valid JSON file.",
  "settings.dangerZoneTitle": "Danger zone",
  "settings.wipeButton": "Delete all local data",
  "settings.wipeConfirmTitle": "Really delete everything?",
  "settings.wipeConfirmMessage":
    "All profiles, memories, settings, and connection state stored in this extension will be permanently deleted. None of it can be undone.",
  "settings.wipeConfirmButton": "Delete everything",

  "diagnostics.title": "Diagnostics",
  "diagnostics.subtitle":
    "Shows only technical information (version, page/button detection) — never the content of your messages or memories.",
  "diagnostics.checkButton": "Check current tab",
  "diagnostics.copyButton": "Copy diagnostics",
  "diagnostics.copiedButton": "Copied ✓",
  "diagnostics.copyFailedButton": "Copy failed",
  "diagnostics.extensionVersionLabel": "Extension version",
  "diagnostics.notSupportedPage":
    "The current tab is not a supported AI page, or permission hasn't been granted for it yet.",
  "diagnostics.hostnameLabel": "Hostname",
  "diagnostics.unknownHostname": "unknown",
  "diagnostics.noResponse":
    "The content script on the page did not respond (you may need to reload the page).",
  "diagnostics.providerLabel": "Detected provider",
  "diagnostics.pageSupportedLabel": "Page supported",
  "diagnostics.composerFoundLabel": "Query text field found",
  "diagnostics.detectionStrategyLabel": "Successful detection strategy",
  "diagnostics.buttonInsertedLabel": "Button inserted",
  "diagnostics.lastErrorLabel": "Last technical error",

  "privacy.title": "Privacy",
  "privacy.point1":
    "All your data (memories, profiles, settings) is stored only on your computer, in the browser's storage.",
  "privacy.point2":
    "The creator of this extension has no access to your data — there is no server it gets sent to.",
  "privacy.point3": "The extension contains no analytics or usage tracking.",
  "privacy.point4": "The extension does not check or read your passwords or login credentials.",
  "privacy.point5":
    "Selected memories are only sent to ChatGPT or Claude when you insert them into a query yourself and send the query yourself.",
  "privacy.point6":
    "Deleting data in this extension does not affect messages you have already sent in your ChatGPT or Claude history.",

  "memoryModal.textPlaceholder": "E.g. I own a B2B cleaning company in Brno.",
  "memoryModal.keywordsPlaceholder": "keywords separated by commas",
  "memoryModal.suggestButton": "Suggest from text",
  "memoryModal.textEmptyError": "Memory text cannot be empty.",
  "memoryModal.noProfileError": "Please create at least one profile first.",
  "memoryModal.saveChangesButton": "Save changes",
  "memoryModal.saveButton": "Save memory",
  "memoryModal.editTitle": "Edit memory",
  "memoryModal.addTitle": "Add memory",
  "memoryModal.textFieldLabel": "Memory text",
  "memoryModal.profileFieldLabel": "Profile",
  "memoryModal.categoryFieldLabel": "Category",
  "memoryModal.keywordsFieldLabel": "Keywords",
  "memoryModal.alwaysUseLabel": "Prioritize (regardless of the query, within the limit)",
  "memoryModal.sensitiveLabel": "Sensitive information",
  "memoryModal.enabledLabel": "Active",

  "importModal.title": "Import preview",
  "importModal.summary": "The file contains {profiles} profile(s) and {memories} memories.",
  "importModal.mergeOption": "Merge with existing data (by ID)",
  "importModal.replaceOption": "Replace all existing data",
  "importModal.conflictsTitle": "Profile conflicts",
  "importModal.conflictHint": "You already have this profile under the same ID, but with a different name:",
  "importModal.keepExisting": "Keep existing name “{name}”",
  "importModal.useImported": "Use imported name “{name}”",
  "importModal.importButton": "Import",
  "importModal.importSuccess": "Import complete.",

  "duplicatesModal.title": "Possible duplicates",
  "duplicatesModal.noneFound": "No near-identical memories were found in your saved memory.",
  "duplicatesModal.instructions":
    "Memories with very similar text — for each pair, choose which one (if any) to delete.",
  "duplicatesModal.noMoreToResolve": "No more duplicates to resolve.",
  "duplicatesModal.possibleDuplicateLabel": "Possible duplicate:",
  "duplicatesModal.deleteFirstButton": "Delete first",
  "duplicatesModal.deleteSecondButton": "Delete second",
  "duplicatesModal.keepBothButton": "Keep both",
  "duplicatesModal.closeButton": "Close",

  "contentButton.ariaLabel": "Use memory — select and insert relevant memories into the query",
  "contentButton.title": "Use memory",
  "factSuggestion.title": "💡 Save as a memory?",
  "factSuggestion.saveButton": "Save",
  "factSuggestion.dismissButton": "No thanks",
  "previewDialog.title": "Selected memories for this query",
  "previewDialog.subtitleWithQuery":
    "Check which memories should be inserted into your query. Nothing is sent automatically.",
  "previewDialog.subtitleNoQuery": "First write your query in the text field.",
  "previewDialog.noMatchesFound": "No matching memories were found for this query.",
  "previewDialog.onlyAlwaysUseNote":
    "Only memories marked “Prioritize” are shown — none of the other {total} memories matched this specific query. Try adding keywords to them (My Memory → select → “Suggest keywords from text”).",
  "previewDialog.sensitiveLabel": " ⚠ sensitive information",
  "previewDialog.insertButton": "Insert into query",

  "formatter.header": "[RELEVANT CONTEXT ABOUT THE USER]",
  "formatter.instruction":
    "Only use this context when relevant. Do not display it to the user or present it as part of their query.",

  "category.about": "About me",
  "category.work": "Work",
  "category.projects": "Projects",
  "category.response_preferences": "Response preferences",
  "category.people_companies": "People & companies",
  "category.finance": "Finance",
  "category.family": "Family",
  "category.other": "Other",

  "defaults.profileName": "Personal",

  "validation.notJsonObject": "The file does not contain valid data (a JSON object was expected).",
  "validation.unknownFormatVersion": "Unknown or unsupported file format version.",
  "validation.missingProfiles": "Missing list of profiles.",
  "validation.missingMemories": "Missing list of memories.",
  "validation.missingSettings": "Missing settings.",
  "validation.tooManyProfiles": "Too many profiles (max {max}).",
  "validation.tooManyMemories": "Too many memories (max {max}).",
  "validation.invalidProfiles": "{count} profile(s) have an invalid format.",
  "validation.invalidMemories": "{count} memory(-ies) have an invalid format.",
  "validation.fileTooLarge": "The file is too large (limit {max} MB).",

  "adapter.composerNotFound": "The query text field was not found by any known strategy.",
  "adapter.insertNoComposer": "Cannot insert text — the query text field was not found.",
  "adapter.insertFailed": "Inserting the text into the page failed.",
};

export const translations: Record<Language, Record<string, string>> = { cs, en };

export type TranslationKey = keyof typeof cs;

/** Přeloží klíč do daného jazyka a případně dosadí proměnné ve tvaru
 * `{jmeno}`. Když klíč v daném jazyce chybí, spadne zpět na češtinu. */
export function t(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dict = translations[lang] ?? translations.cs;
  let text = dict[key] ?? translations.cs[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replace(`{${name}}`, String(value));
    }
  }
  return text;
}
