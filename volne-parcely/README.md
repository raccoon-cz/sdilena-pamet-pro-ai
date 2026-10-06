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

### 2. Ostrý běh

```bash
cp config.example.yaml config.yaml
python main.py ku "Moravany"            # najde kód KÚ v číselníku ČÚZK
python main.py download                 # stáhne SHP KÚ z configu + číselníky do data/cache
python main.py inspect 698504           # vypíše vrstvy a atributy balíčku (ověř názvy!)
python main.py inspect data/up/moravany/PlochyRZV_p.shp --hodnoty Typ   # kódy ploch v ÚP
python main.py run --config config.yaml
```

Stažené ZIPy zůstávají v `data/cache`; existující platný soubor se znovu nestahuje
(`download --force` vynutí nové stažení). Data ČÚZK se aktualizují týdně.

## Data územního plánu

Nástroj čte jeden soubor ÚP na obec (SHP / GPKG / GML / cokoli, co čte GDAL).
Hledej vektorová data ve **jednotném standardu ÚP** (metodika MMR „Standard vybraných
částí územního plánu“) – vrstva `PlochyRZV_p` (plochy s rozdílným způsobem využití):

| Atribut | Význam |
|---|---|
| `Typ` | kód plochy (`BI`, `SV`, …) → `atribut_kod: Typ` |
| `CasH` | časový horizont: 1 = stabilizovaná, 2 = návrh (plocha změny) |
| `Index` | 3. úroveň členění / specifický podtyp |

Kde data vzít:

1. **Národní geoportál územního plánování** – <https://uzemniplanovani.gov.cz> (ÚP publikované
   v jednotném standardu, ke stažení).
2. **Geoportál Jihomoravského kraje** – <https://mapy.jmk.cz/geoportal/> (územní plány obcí JMK).
3. **Obec nebo pořizovatel ÚP** (úřad územního plánování ORP) – vyžádej si „vektorová data ÚP
   v jednotném standardu (SHP)“.
4. **Brno** – nový ÚP města Brna (<https://upmb.brno.cz>) používá vlastní značení ploch; k dispozici
   je převodník na jednotný standard (PDF na upmb.brno.cz). Data hledej na <https://data.brno.cz>
   nebo <https://gis.brno.cz>. Pro Brno nastav `atribut_kod` a `cilove_kody` podle skutečných dat
   (`inspect … --hodnoty`).

Starší ÚP mimo standard mají atributy pojmenované libovolně – proto je `atribut_kod`
nastavitelný. Pokud soubor nemá `.prj`, nastav `crs`; pokud SHP nemá `.cpg` a diakritika je
rozbitá, nastav `kodovani` (obvykle `cp1250`).

Jen zastavitelné plochy (návrh) místo všech ploch bydlení: `filtr: {CasH: [2]}`.
Proluky ve stabilizovaných plochách jsou ale často ty nejzajímavější, proto výchozí běh bere obě.

## Konfigurace

Viz `config.example.yaml`. Hlavní parametry:

| Klíč | Výchozí | Význam |
|---|---|---|
| `obce[].uzemni_plan.cesta` | – | soubor ÚP obce |
| `obce[].uzemni_plan.atribut_kod` | `Typ` | atribut s kódem plochy |
| `obce[].katastralni_uzemi[]` | – | `kod` + `nazev` KÚ |
| `cilove_kody` | `[BI, BV, BX, SV, SM]` | kódy ploch pro bydlení |
| `porovnani_kodu` | `presne` | `prefix` = `BI` sedí i na `BI.1` |
| `min_vymera_m2` / `max_vymera_m2` | 600 / 5000 | rozsah výměry |
| `min_podil_v_plose` | 0.6 | min. podíl parcely v cílových plochách |
| `max_vzdalenost_od_komunikace_m` | 5 | „sousedí s komunikací“ |
| `max_prekryv_budovy_m2` | 10 | budova zasahující víc parcelu vyřadí |
| `druhy_pozemku.*` | názvy z číselníku | zastavěná / lesní / bonus ve skóre |
| `pristup_zpusoby_vyuziti` | `[silnice, ostatní komunikace]` | názvy z číselníku `SC_ZP_VYUZITI_POZ` |
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
   druh „zastavěná plocha a nádvoří“ → budova zasahující > 10 m² (max. jedné budovy) →
   výměra mimo rozsah (výměra z KN, když chybí, plocha geometrie) → podíl pod limitem →
   lesní pozemek (nemaže se, jde do listu „Lesní a vyřazené“).
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
  - **Lesní a vyřazené** – lesní pozemky, které by jinak prošly, a vyřazené parcely s podílem
    v cílové ploše ≥ 10 % (důvod + všechny důvody). Název listu nemůže obsahovat „/“ (Excel to
    nepovoluje), proto „Lesní a vyřazené“.
  - **Parametry běhu** – parametry, stav každého KÚ, počty v krocích filtru.
  - Hlavička, autofilter, ukotvené záhlaví, šířky sloupců, klikatelné odkazy.
- `mapa.html` – ortofoto ČÚZK (WMS) jako podklad, OSM, volitelně katastrální mapa (WMS), plochy ÚP
  poloprůhledně, kandidáti obarvení podle skóre, popup s údaji a odkazy. Mapa načítá Leaflet
  a dlaždice z internetu.
- `kandidati.gpkg` – vrstvy `kandidati`, `lesni_vyrazene`, `plochy_up_cilove` (EPSG:5514) pro QGIS.
- `beh.log` – podrobný log (konzole ukazuje INFO, soubor DEBUG včetně tracebacků).

Selhání jednoho KÚ (stažení, chybějící ÚP, neznámý atribut) se zapíše do souhrnu a běh pokračuje.

## Co je ověřené a co ne

Při vývoji nebyly servery ČÚZK z vývojového prostředí dostupné (blokovala je síťová politika),
takže **na reálném KÚ jsem nástroj nespustil**. Struktura dat je převzatá z veřejně publikovaného
rozboru, kde ji autor změřil na stažených datech (projekt
[matejasiska/viagem-parcely](https://github.com/matejasiska/viagem-parcely), `NOTES.md`, stav k 2026-10-05),
a z dokumentace ČÚZK. Názvy jsou proto v configu a `inspect` je ukáže – **před prvním ostrým
během spusť `inspect` a porovnej.**

| Položka | Stav |
|---|---|
| URL SHP `https://services.cuzk.gov.cz/shp/ku/epsg-5514/{kod}.zip` (starý `services.cuzk.cz` přesměrovává 301) | převzato, ověřeno třetí stranou |
| Vrstvy `PARCELY_KN_P` (`ID, ID_2, TYPPPD_KOD, KATUZE_KOD, OBEC_KOD`) a `PARCELY_KN_DEF` (`TEXT_KM, PAR_VYMERA, DRUPOZ_KOD, ZPVYPA_KOD, BUD_ID, STAV_PARC`), CP1250, spojení přes `ID` 1:1, `ID_2` = ID parcely ISKN/RÚIAN | převzato, ověřeno třetí stranou |
| Prázdný `ZPVYPA_KOD` je v DBF `****` (→ NULL) | převzato |
| Vrstva budov `BUDOVY_P` (polygony) | z popisu vrstev ČÚZK; atributy neověřené (nástroj používá jen geometrii) |
| Číselníky `https://services.cuzk.gov.cz/sestavy/cis/{NAZEV}.zip` (CSV CP1250, `;`, sloupce `KOD;NAZEV`) | převzato |
| Kódy druhů pozemku 2 orná, 5 zahrada, 10 lesní, 11 vodní, 13 zastavěná, 14 ostatní | převzato; ostatní kódy se berou z číselníku |
| Kódy způsobu využití „silnice“ a „ostatní komunikace“ | **neověřené** – nástroj je hledá podle názvu v číselníku |
| Odkaz Nahlížení `https://nahlizenidokn.cuzk.gov.cz/ZobrazObjekt.aspx?typ=parcela&id={ID_2}` | formát převzatý; třetí strana hlásí, že při opakovaných přístupech Nahlížení přesměrovává na stránku ochrany provozu. Proto je vedle i odkaz na VDP. |
| Odkaz Nahlížení podle KÚ + čísla parcely | **neověřený formát → neimplementováno** |
| Odkaz VDP RÚIAN `https://vdp.cuzk.gov.cz/vdp/ruian/parcely/{ID_2}` | převzato, ověřeno třetí stranou |
| Odkaz Mapy `https://mapy.com/fnc/v1/showmap?mapset=aerial&center={lon},{lat}&zoom=18&marker=true` | dle dokumentace developer.mapy.com |
| WMS ortofoto `https://ags.cuzk.gov.cz/arcgis1/services/ORTOFOTO/MapServer/WMSServer`, vrstva `0` | URL z geoportálu ČÚZK; název vrstvy `0` a podpora EPSG:3857 **neověřené** (případně uprav `mapa.ortofoto_vrstva`) |
| WMS katastrální mapy `https://services.cuzk.gov.cz/wms/local-km-wms.asp`, vrstvy `hranice_parcel,parcelni_cisla` | z popisu služby, **neověřené** |
| Jednotný standard ÚP: `PlochyRZV_p`, `Typ`, `CasH` (1/2), `Index` | z metodiky MMR (přes vyhledávání) |
| Název plochy `BX` | **neověřený** – výchozí popisek je obecný, přepiš v `nazvy_ploch` |
| Záloha budov z RÚIAN VFR (`vdp.cuzk.gov.cz/vymenny_format/soucasna/{YYYYMMDD}_OB_{obec}_UKSH.xml.zip`, vrstva `StavebniObjekty`, geometrie `OriginalniHranice`) | URL vzor převzatý; čtení geometrie **neověřené** |
| Kódy KÚ v `config.example.yaml` (698504 Moravany u Brna, 713392 Ostopovice) | ze sekundárních zdrojů – ověř `python main.py ku …` |

Ověřené vlastním během: celá logika na syntetickém KÚ (počty v každém kroku sedí s ručně
spočtenými), čtení ZIP bez `.cpg` v CP1250, všechny tři způsoby spojení atributů, převod CRS ÚP,
Excel (hyperlinky, autofilter, ukotvení), GeoPackage a vykreslení mapy v Chromiu. 34 testů.

## Známá omezení

- **Zastavitelná plocha ≠ stavební pozemek.** Rozhoduje i regulativ ÚP, ochranná pásma, záplavová
  území, odnětí ze ZPF, přístup přes cizí pozemek. Výstup je seznam k ručnímu prověření.
- Parcely zjednodušené evidence (PK/EN), které nejsou v katastrální mapě, nástroj nevidí.
- Výměra v KN je právní údaj a u map vzniklých digitalizací (KMD) se od plochy polygonu může
  lišit o jednotky procent; podíl v ploše se proto počítá z geometrie.
- Převod ÚP z jiného CRS než EPSG:5514 má přesnost cca 1 m (transformace S-JTSK ↔ ETRS89/WGS84
  v PROJ). Data v jednotném standardu bývají přímo v S-JTSK.
- Přístup se počítá jen ke komunikacím ve zpracovaných KÚ – parcela na okraji posledního KÚ může
  mít komunikaci v sousedním, nezpracovaném KÚ.

## Licence dat

Katastrální mapa, číselníky a RÚIAN © ČÚZK, licence CC BY 4.0. Při sdílení výstupů uveď zdroj.
