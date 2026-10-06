"""CLI: hledání nezastavěných parcel v plochách pro bydlení podle územního plánu.

    python main.py run --config config.yaml
    python main.py download
    python main.py inspect 698504
    python main.py inspect data/up/obec/PlochyRZV_p.shp --hodnoty Typ
    python main.py ku "Moravany"
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Optional

import typer

from parcely.config import ConfigError, load_config

app = typer.Typer(add_completion=False, no_args_is_help=True, help=__doc__)

ConfigOpt = typer.Option(Path("config.yaml"), "--config", "-c", help="Cesta ke config.yaml")


def _cfg(path: Path):
    try:
        return load_config(path)
    except ConfigError as exc:
        typer.secho(str(exc), fg=typer.colors.RED, err=True)
        raise typer.Exit(2)


@app.command()
def run(
    config: Path = ConfigOpt,
    ku: Optional[list[int]] = typer.Option(None, "--ku", help="Zpracuj jen tato KÚ (lze opakovat)"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Podrobný výpis do konzole"),
):
    """Celý běh: stažení (s cache), analýza, Excel + mapa + GeoPackage do output/{datum}/."""
    from parcely.pipeline import format_summary, run as run_pipeline

    cfg = _cfg(config)
    if not cfg.ku:
        typer.secho("Config neobsahuje žádná katastrální území (obce → katastralni_uzemi).", fg=typer.colors.RED, err=True)
        raise typer.Exit(2)
    result = run_pipeline(cfg, only_ku=ku, verbose=verbose)
    typer.echo("")
    typer.echo(format_summary(result))
    raise typer.Exit(0 if result.ok else 1)


@app.command()
def download(
    config: Path = ConfigOpt,
    ku: Optional[list[int]] = typer.Option(None, "--ku", help="Jen tato KÚ"),
    force: bool = typer.Option(False, "--force", help="Stáhnout znovu i když je soubor v cache"),
):
    """Stáhne SHP katastrální mapy pro KÚ z configu a číselníky ČÚZK do cache."""
    from parcely.ciselniky import load_ciselnik
    from parcely.download import DownloadError, download_ku
    from parcely.logs import setup_logging

    cfg = _cfg(config)
    setup_logging(None)
    chyby = 0
    for k in cfg.ku:
        if ku and k.kod not in ku:
            continue
        try:
            path, fresh = download_ku(cfg, k.kod, force=force)
            typer.echo(f"  {k.kod} {k.nazev}: {'staženo' if fresh else 'v cache'} → {path}")
        except DownloadError as exc:
            chyby += 1
            typer.secho(f"  {k.kod} {k.nazev}: CHYBA {exc}", fg=typer.colors.RED)
    for nazev in ("SC_D_POZEMKU", "SC_ZP_VYUZITI_POZ"):
        c = load_ciselnik(cfg, nazev)
        typer.echo(f"  číselník {nazev}: {'OK, ' + str(len(c.hodnoty)) + ' položek' if c else 'nedostupný'}")
    raise typer.Exit(1 if chyby else 0)


@app.command()
def inspect(
    cil: str = typer.Argument(..., help="Kód KÚ (stáhne/použije cache) nebo cesta k souboru (např. data ÚP)"),
    config: Path = ConfigOpt,
    vrstva: Optional[str] = typer.Option(None, "--vrstva", help="Jen tato vrstva"),
    hodnoty: Optional[str] = typer.Option(None, "--hodnoty", help="Vypiš četnosti hodnot tohoto atributu"),
    vzorku: int = typer.Option(3, "--vzorku", help="Počet ukázkových hodnot na atribut"),
):
    """Vypíše vrstvy a atributy SHP balíčku KÚ nebo libovolného souboru (ÚP)."""
    import pyogrio

    from parcely.inspekce import describe_layer, format_layer, value_counts
    from parcely.logs import setup_logging

    setup_logging(None)
    if re.fullmatch(r"\d{5,7}", cil):
        from parcely.ciselniky import load_ciselnik
        from parcely.download import DownloadError, download_ku
        from parcely.kn import KNPackage

        cfg = _cfg(config) if config.exists() else _default_cfg()
        try:
            path, fresh = download_ku(cfg, int(cil))
        except DownloadError as exc:
            typer.secho(str(exc), fg=typer.colors.RED, err=True)
            raise typer.Exit(1)
        pkg = KNPackage(path, cfg["kn"]["kodovani"])
        typer.echo(f"Balíček {path} ({path.stat().st_size / 1e6:.1f} MB, {'staženo' if fresh else 'z cache'})")
        typer.echo("Soubory: " + ", ".join(Path(f).name for f in pkg.files))
        typer.echo("")
        layers = [vrstva] if vrstva else pkg.layers
        for name in layers:
            if not pkg.has(name):
                typer.secho(f"Vrstva {name} v balíčku není. Dostupné: {', '.join(pkg.layers)}", fg=typer.colors.RED)
                raise typer.Exit(1)
            typer.echo(format_layer(describe_layer(pkg.path(name), encoding=pkg.encoding(name), samples=vzorku)))
            typer.echo("")
        if hodnoty:
            name = vrstva or cfg["kn"]["vrstva_parcely_atributy"]
            counts = value_counts(pkg.path(name), hodnoty, encoding=pkg.encoding(name))
            attrs = {v.upper(): k for k, v in cfg["kn"]["atributy"].items() if v}
            cis = {"druh_kod": "SC_D_POZEMKU", "zpusob_kod": "SC_ZP_VYUZITI_POZ"}.get(attrs.get(hodnoty.upper(), ""))
            c = load_ciselnik(cfg, cis) if cis else None
            typer.echo(f"Četnosti {name}.{hodnoty}:")
            for val, n in counts.items():
                popis = c.popis(val) if c is not None and str(val).strip().lstrip("-").isdigit() else ""
                typer.echo(f"  {str(val):<12}{n:>8}  {popis}")
        return

    path = Path(cil)
    if not path.exists():
        typer.secho(f"{cil} není kód KÚ ani existující soubor.", fg=typer.colors.RED, err=True)
        raise typer.Exit(1)
    layers = [vrstva] if vrstva else [str(n) for n, _ in pyogrio.list_layers(path)]
    for name in layers:
        typer.echo(format_layer(describe_layer(str(path), layer=name, samples=vzorku)))
        typer.echo("")
    if hodnoty:
        typer.echo(f"Četnosti {hodnoty}:")
        for val, n in value_counts(str(path), hodnoty, layer=vrstva).items():
            typer.echo(f"  {str(val):<16}{n:>8}")


@app.command("ku")
def hledej_ku(text: str = typer.Argument(..., help="Část názvu KÚ nebo obce"), config: Path = ConfigOpt):
    """Najde kód katastrálního území podle názvu (číselník ČÚZK UI_KATASTRALNI_UZEMI)."""
    from parcely.ciselniky import hledej_ku as find
    from parcely.download import DownloadError
    from parcely.logs import setup_logging

    setup_logging(None)
    cfg = _cfg(config) if config.exists() else _default_cfg()
    try:
        df = find(cfg, text)
    except (DownloadError, ValueError) as exc:
        typer.secho(str(exc), fg=typer.colors.RED, err=True)
        raise typer.Exit(1)
    if df.empty:
        typer.echo("Nic nenalezeno.")
        return
    typer.echo(df.to_string(index=False))


@app.command()
def testdata(cil: Path = typer.Option(Path("data/test"), "--cil", help="Kam uložit syntetická data")):
    """Vytvoří SYNTETICKÉ testovací KÚ + ÚP pro běh bez sítě (config.test.yaml)."""
    from parcely.testdata import create_test_data

    paths = create_test_data(cil)
    for p in paths:
        typer.echo(f"  {p}")


def _default_cfg():
    from parcely.config import build_config

    return build_config({}, None)


if __name__ == "__main__":
    sys.exit(app())
