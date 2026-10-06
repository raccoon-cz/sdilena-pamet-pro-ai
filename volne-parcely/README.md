# Volné parcely – nezastavěné pozemky v plochách pro bydlení podle ÚP

Lokální nástroj, který z otevřených dat ČÚZK a z vektorových dat územního plánu najde
nezastavěné parcely v plochách pro bydlení (výchozí kódy `BI, BV, BX, SV, SM`). Výstupem je
Excel, interaktivní mapa a GeoPackage pro QGIS.

**Co nástroj nedělá (záměrně):**

- Žádné automatické dotazy na Nahlížení do KN, žádný scraping, CAPTCHA ani přihlášení.
  Nástroj odkaz na parcelu jen **vygeneruje**; otevíráš ho ručně v prohlížeči.
- Nestahuje ani neukládá údaje o vlastnících.
- Žádné placené API. Stahuje jen otevřená data ČÚZK (CC BY 4.0); územní plán čte z lokálního souboru.

## Instalace

Python 3.11+.

```bash
cd volne-parcely
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`pyogrio` a `pyproj` mají v kolech (wheels) přibalený GDAL/PROJ, systémový GDAL není potřeba.

## Rychlý start

### 1. Ověření bez sítě (syntetická data)

```bash
python main.py testdata                          # vytvoří vymyšlené KÚ 999901 + ÚP do data/test
python main.py inspect 999901 --config config.test.yaml
python main.py run --config config.test.yaml     # výstup v output/test/{datum}/
python -m pytest                                 # testy logiky
```

Syntetická data neodpovídají žádnému skutečnému území (kódy způsobu využití jsou smyšlené).

### 2. Ostrý běh (funguje hned: Kuřim + Čebín)

```bash
cp config.example.yaml config.yaml
python main.py run --config config.yaml          # výstup v output/{datum}/
```

Příklad stáhne katastr KÚ Kuřim (677655) a Čebín (618764) z ČÚZK a územní plány z veřejné
ArcGIS služby MÚ Kuřim. Pro další obce:

```bash
python main.py ku "Moravany"                     # kód KÚ z číselníku ČÚZK
python main.py download                          # SHP KÚ + číselníky + ÚP ze služeb do data/cache
python main.py inspect 698504                    # vrstvy a atributy balíčku KN
python main.py inspect data/up/moravany/PlochyRZV_p.shp --hodnoty Typ   # kódy ploch v souboru ÚP
python main.py inspect "https://…/FeatureServer"                        # vrstvy a atributy ÚP ve službě
```

Stažené soubory zůstávají v `data/cache` a znovu se nestahují (`download --force` obnoví).
Data ČÚZK se aktualizují týdně.

## Data územního plánu

Pro každou obec jeden zdroj ÚP – `uzemni_plan.cesta` je buď **soubor** (SHP / GPKG / GML /
cokoli, co čte GDAL), nebo **URL veřejné ArcGIS služby** (`…/FeatureServer` nebo
`…/FeatureServer/8`). Služba se stáhne stránkovaně v S-JTSK a uloží do `data/cache/up/`.
U vícevrstvé služby/souboru se vybere vrstva „Plochy s rozdílným způsobem využití“ / `PlochyRZV_p`.

**Jednotný standard ÚP** (metodika MMR) – vrstva `PlochyRZV_p`:

| Atribut | Význam |
|---|---|
| `Typ` | kód plochy (`BI`, `SV`, …) → `atribut_kod: Typ` |
| `CasH` | časový horizont: 1 = stabilizovaná, 2 = návrh (plocha změny) |
| `Index` | 3. úroveň členění / specifický podtyp |

**Starší ÚP** (ověřeno na Kuřimi a Čebíně) mají místní jednopísmenné kódy a jiné názvy
atributů – Kuřim: kód `FUKCE_2` (`B` = „Plocha smíšená obytná“), název `POPIS`, stav `FAZE_2`;
Čebín: `POPIS_ZKR` / `POPIS` / `VYZNAM`. Proto:

- `atribut_kod: auto` a `atribut_nazev: auto` (výchozí) najdou atributy samy; volba se vypíše do logu,
- když ÚP neobsahuje žádný z `cilove_kody`, vyberou se cílové plochy **podle názvu**
  (`cilove_nazvy: [bydlení, smíšené obytné]`, kromě `cilove_nazvy_vyjma: [hromadné]`);
  vybrané kódy a názvy jsou v logu – zkontroluj je,
- pro konkrétní obec lze přepsat `cilove_kody` / `cilove_nazvy` v její sekci `uzemni_plan`.

Kde data vzít:

1. **Veřejné ArcGIS služby obcí/ORP** – např. MÚ Kuřim publikuje ÚP Kuřimi a Čebína
   (`services6.arcgis.com/nSl4NxcJbmr0IlpX/…/UP_kurim`, `…/UP_cebin`). Další se dají najít
   vyhledáním „plochy s rozdílným způsobem využití“ na <https://www.arcgis.com>.
2. **Národní geoportál územního plánování** – <https://uzemniplanovani.gov.cz> (ÚP v jednotném
   standardu ke stažení ručně; automatické dotazy z datacenter odmítá – HTTP 403).
3. **Obec nebo pořizovatel ÚP** (úřad územního plánování ORP) – vyžádej si „vektorová data ÚP
   v jednotném standardu (SHP)“.
4. **Brno** – nový ÚP města Brna (<https://upmb.brno.cz>) používá vlastní značení ploch. Veřejně
   dotazovatelnou vektorovou službu jsem nenašel; data na vyžádání přes gis@brno.cz.

Pokud soubor nemá `.prj`, nastav `crs`; pokud SHP nemá `.cpg` a diakritika je rozbitá, nastav
`kodovani` (obvykle `cp1250`). Jen zastavitelné plochy (návrh): `filtr: {CasH: [2]}` (standard),
u Kuřimi např. `filtr: {FAZE_2: [Plocha zastavitelná]}`. Proluky ve stabilizovaných plochách jsou
ale často ty nejzajímavější, proto výchozí běh bere obě.

## Konfigurace

Viz `config.example.yaml`. Hlavní parametry:

| Klíč | Výchozí | Význam |
|---|---|---|
| `obce[].uzemni_plan.cesta` | – | soubor ÚP obce nebo URL ArcGIS služby |
| `obce[].uzemni_plan.atribut_kod` / `atribut_nazev` | `Typ` / `auto` | atribut s kódem / názvem plochy (`auto` = najít) |
| `obce[].uzemni_plan.cilove_kody` / `cilove_nazvy` | – | přepíše globální hodnoty pro obec |
| `obce[].katastralni_uzemi[]` | – | `kod` + `nazev` KÚ |
| `cilove_kody` | `[BI, BV, BX, SV, SM]` | kódy ploch pro bydlení |
| `cilove_nazvy` / `cilove_nazvy_vyjma` | `[bydlení, smíšené obytné]` / `[hromadné]` | záloha podle názvu, když ÚP kódy standardu nemá |
| `porovnani_kodu` | `presne` | `prefix` = `BI` sedí i na `BI.1` |
| `min_vymera_m2` / `max_vymera_m2` | 600 / 5000 | rozsah výměry |
| `min_podil_v_plose` | 0.6 | min. podíl parcely v cílových plochách |
| `max_vzdalenost_od_komunikace_m` | 5 | „sousedí s komunikací“ |
| `max_prekryv_budovy_m2` | 10 | budova zasahující víc parcelu vyřadí |
| `druhy_pozemku.*` | názvy z číselníku | zastavěná / lesní / bonus ve skóre / nevhodné (`[vodní plocha]`) |
| `pristup_zpusoby_vyuziti` | `[silnice, ostatní komunikace]` | názvy z číselníku `SC_ZP_VYUZITI_POZ` |
| `nevhodne_zpusoby_vyuziti` | silnice, ostatní komunikace, dálnice, dráha, ostatní dopravní plocha | parcela sama je komunikací → vyřadit (`[]` = vypnuto) |
| `vyrazene_min_podil` / `vyrazene_min_vymera_m2` | 0.1 / 300 | co se ještě ukáže v listu „Lesní a vyřazené“ |
| `kn.*` | viz `parcely/config.py` | názvy vrstev a atributů SHP balíčku |
| `budovy.zdroj` | `auto` | `auto` (SHP, jinak RÚIAN VFR) / `shp` / `vfr` / `soubor` / `zadne` |
| `odkazy.*` | | šablony URL (Nahlížení, VDP, Mapy.cz) |

Druhy pozemku a způsoby využití se zadávají **názvem** a převádějí se na kódy přes číselník ČÚZK –
kódy tak nejsou natvrdo v kódu. Lze zadat i přímo číslo.

## Logika

1. Načte parcely KÚ (polygony `PARCELY_KN_P` + atributy z `PARCELY_KN_DEF`; spojení přes
   unikátní klíč `ID_2`/`ID`, záložně prostorově přes definiční bod), ÚP a budovy; vše do
   EPSG:5514, nevalidní geometrie opraví `make_valid`.
2. Pro každou parcelu spočítá plochu průniku s cílovými plochami ÚP (sjednocenými – překryvy v datech
   ÚP se nepočítají dvakrát) a podíl z plochy parcely. Zaznamená kód a název plochy, jejíž kód pokrývá
   z parcely nejvíc.
3. Filtry v tomto pořadí (počty vyřazených se logují po krocích):
   druh „zastavěná plocha a nádvoří“ → **nevhodná parcela** (sama je silnicí / ostatní komunikací /
   dopravní plochou, nebo je to vodní plocha) → budova zasahující > 10 m² (max. jedné budovy) →
   výměra mimo rozsah (výměra z KN, když chybí, plocha geometrie) → podíl pod limitem →
   lesní pozemek (nemaže se, jde do listu „Lesní a vyřazené“).
   Krok „nevhodná parcela“ v zadání nebyl; přidal jsem ho po běhu na reálných datech, kde mezi
   kandidáty vycházely i parcely silnic, cest a vodní plochy (Moravany + Ostopovice: 156 parcel). Vypne se `nevhodne_zpusoby_vyuziti: []`
   a `druhy_pozemku.nevhodne: []`.
4. Přístup: vzdálenost k nejbližší parcele se způsobem využití silnice / ostatní komunikace
   (z **všech** zpracovaných KÚ, takže funguje i přes hranici KÚ). Jen informace, nefiltruje se.
5. Skóre 0–100: podíl × 40 + přístup 25 + výměra 20 (plně v 800–1500 m², lineárně k 0 na min/max
   limitu) + druh zahrada/orná půda 15. Řazeno sestupně. Rozpad skóre je ve sloupci „Rozpad skóre“.

## Výstupy (`output/{datum}/`)

- `kandidati.xlsx`
  - **Kandidáti** – skóre, obec, KÚ, číslo parcely, druh, výměra, plocha ÚP (kód + název), podíl %,
    přístup, souřadnice středu (WGS84, bod uvnitř parcely), odkaz do Nahlížení, odkaz na Mapy.cz;
    navíc vzdálenost ke komunikaci, rozpad skóre, způsob využití, detail plochy ÚP (`CasH`, `Index`),
    překryv budovy, ID parcely, odkaz na RÚIAN (VDP).
  - **Lesní a vyřazené** – lesní pozemky, které by jinak prošly, a „těsně vyřazené“ parcely
    k ručnímu posouzení: podíl v cílové ploše ≥ 10 %, výměra ≥ 300 m², vyřazené kvůli budově,
    výměře (např. velké pozemky k dělení) nebo podílu. Stávající domy (zastavěná plocha),
    komunikace a drobné zbytky tam nejsou – jen v počtech. Název listu nemůže obsahovat „/“
    (Excel to nepovoluje), proto „Lesní a vyřazené“.
  - **Parametry běhu** – parametry, stav každého KÚ, počty v krocích filtru.
  - Hlavička, autofilter, ukotvené záhlaví, šířky sloupců, klikatelné odkazy.
- `mapa.html` – ortofoto ČÚZK (WMS) jako podklad, OSM, volitelně katastrální mapa (WMS), plochy ÚP
  poloprůhledně, kandidáti obarvení podle skóre, popup s údaji a odkazy. Mapa načítá Leaflet
  a dlaždice z internetu.
- `kandidati.gpkg` – vrstvy `kandidati`, `lesni_vyrazene`, `plochy_up_cilove` (EPSG:5514) pro QGIS.
- `beh.log` – podrobný log (konzole ukazuje INFO, soubor DEBUG včetně tracebacků).

Selhání jednoho KÚ (stažení, chybějící ÚP, neznámý atribut) se zapíše do souhrnu a běh pokračuje.

## Co je ověřené a co ne

Sandbox, ve kterém nástroj vznikl, na servery ČÚZK nedosáhne, proto ověření na reálných datech
běží v GitHub Actions (`.github/workflows/volne-parcely.yml`, job `realna-data`): stáhne reálná KÚ,
vypíše strukturu, pustí `config.example.yaml` (Kuřim + Čebín s reálným ÚP) a další běh s náhradním
ÚP. Výstupy (Excel, mapa, GPKG) jsou v artifactu běhu.

**Ověřeno na reálných datech (10/2026):**

| Položka | Zjištění |
|---|---|
| Celý běh s reálným ÚP – Čebín (618764) | 3 022 parcel → 309 kandidátů (zastavěná 844, komunikace/voda 341, budova 1, výměra 1 012, podíl 515) |
| ÚP z ArcGIS služby MÚ Kuřim | Kuřim 608 ploch, Čebín 248 ploch; atributy a vrstva určeny automaticky, plochy bydlení vybrány podle názvu |
| URL SHP `https://services.cuzk.gov.cz/shp/ku/epsg-5514/{kod}.zip` | funguje (698504: 2,2 MB, 106 souborů) |
| Kódování | balíček nese `.cpg` = **UTF-8** (ne CP1250); loader se řídí `.cpg`, `kn.kodovani` je jen záloha |
| Vadné geometrie v SHP ČÚZK | KÚ Kuřim obsahuje neuzavřený prstenec – čte se s opravou (`on_invalid="fix"`) |
| `PARCELY_KN_P` (polygony) | `ID, ID_2, TYPPPD_KOD, KATUZE_KOD, OBEC_KOD`; `ID`/`ID_2` jsou **text** |
| `PARCELY_KN_DEF` (body) | `ID, ID_2, TYPPPD_KOD, KATUZE_KOD, TEXT_KM, PAR_VYMERA, DRUPOZ_KOD, ZPVYPA_KOD, BUD_ID, STAV_PARC`; spojení přes `ID_2` 1:1 |
| `BUDOVY_P` | polygony budov (698504: 1 328) |
| Další vrstvy | `KATASTRALNI_UZEMI_P`, `HRANICE_PARCEL_L`, `PARCELY_KN_T/B/L`, `BUDOVY_DEF/B`, `VB_P`, `BODOVE_POLE_*`, `DALSI_PRVKY_MAPY_*`… |
| Číselníky `sestavy/cis/{NAZEV}.zip` | CSV CP1250, `;`, `KOD;NAZEV;…`; `SC_D_POZEMKU` 11 položek, `SC_ZP_VYUZITI_POZ` 30 položek (16 = silnice, 17 = ostatní komunikace) |
| `UI_KATASTRALNI_UZEMI`, `UI_OBEC` (`python main.py ku`) | funguje |
| Záloha budov z RÚIAN VFR | funguje (obec 583413: 1 301 polygonů `OriginalniHranice`) |
| WMS ortofoto, vrstva `0`, EPSG:3857 | GetMap HTTP 200 `image/jpeg` |
| WMS katastrální mapy, `hranice_parcel,parcelni_cisla`, EPSG:3857 | GetMap HTTP 200 `image/png` |
| Odkaz VDP `https://vdp.cuzk.gov.cz/vdp/ruian/parcely/{ID_2}` | HTTP 200, „Parcela - detail“ |
| Kódy KÚ 698504 Moravany u Brna, 713392 Ostopovice, 677655 Kuřim, 618764 Čebín | potvrzené číselníkem |

**Neověřeno:**

| Položka | Stav |
|---|---|
| Odkaz Nahlížení `https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?typ=parcela&id={ID_2}` | formát převzatý z veřejného rozboru; nástroj ho záměrně nikdy nevolá. Stejné `ID_2` funguje ve VDP. Při opakovaném otevírání může Nahlížení ukázat stránku ochrany provozu – pak použij odkaz VDP. |
| Odkaz Nahlížení podle KÚ + čísla parcely | formát nenalezen v ověřitelném zdroji → neimplementováno |
| Odkaz Mapy `https://mapy.com/fnc/v1/showmap?…` | dle dokumentace developer.mapy.com, neotestováno |
| Soubor ÚP v jednotném standardu (`PlochyRZV_p`, `Typ`) | jen na syntetických datech – reálný soubor ve standardu jsem neměl (NGÚP odpovídá automatickým dotazům 403) |
| Název plochy `BX` | výchozí popisek je obecný, přepiš v `nazvy_ploch` |

## Známá omezení

- **Zastavitelná plocha ≠ stavební pozemek.** Rozhoduje i regulativ ÚP, ochranná pásma, záplavová
  území, odnětí ze ZPF, přístup přes cizí pozemek. Výstup je seznam k ručnímu prověření.
- Parcely zjednodušené evidence (PK/EN), které nejsou v katastrální mapě, nástroj nevidí.
- Výměra v KN je právní údaj a u map vzniklých digitalizací (KMD) se od plochy polygonu může
  lišit o jednotky procent; podíl v ploše se proto počítá z geometrie.
- Převod ÚP z jiného CRS než EPSG:5514 má přesnost cca 1 m (transformace S-JTSK ↔ ETRS89/WGS84
  v PROJ). Data v jednotném standardu bývají přímo v S-JTSK.
- Data ÚP ve veřejných službách nemusí odpovídat poslední vydané změně ÚP – závazný je ÚP
  vydaný obcí (popis služby obvykle uvádí, které znění obsahuje).
- Přístup se počítá jen ke komunikacím ve zpracovaných KÚ – parcela na okraji posledního KÚ může
  mít komunikaci v sousedním, nezpracovaném KÚ.

## Licence dat

Katastrální mapa, číselníky a RÚIAN © ČÚZK, licence CC BY 4.0. Při sdílení výstupů uveď zdroj.
