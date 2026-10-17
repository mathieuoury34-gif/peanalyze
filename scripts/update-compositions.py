#!/usr/bin/env python3
"""Robot mensuel : récupère les dernières fiches mensuelles officielles (Amundi) des ETF sources et publie public/compositions.json.

- Aucune requête vers l'API des cours (EODHD) : ~110 téléchargements HTTP simples par mois, sans clé ni quota.
- Une fiche n'est retenue que si sa lecture est complète (somme des poids ≈ 100 %, tous les libellés connus) et plus récente que
  celle déjà intégrée à l'application ; sinon l'application garde la dernière répartition valide.
- Les ETF sources sont ceux de data-src/compositions-fiches.json (clé = ISIN du fonds dont on lit la fiche).
Usage : python3 scripts/update-compositions.py [--limit N]   (écrit public/compositions.json ; code de sortie 0 même si rien de neuf)
"""
import datetime, json, pathlib, sys, time, urllib.request, urllib.error
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import factsheet_parse as fp
import compositions as comp
import dws

ROOT = pathlib.Path(__file__).resolve().parent.parent
KNOWN = ROOT / 'data-src' / 'compositions-fiches.json'
OUT = ROOT / 'public' / 'compositions.json'
CACHE = ROOT / '.cache' / 'amundi'
URL = 'https://www.amundietf.fr/pdfDocuments/monthly-factsheet/{isin}/FRA/FRA/INSTITUTIONNEL/ETF/{d}'


def month_ends(n=3, today=None):
    """Les n derniers fins de mois (AAAAMMJJ), du plus récent au plus ancien."""
    d = (today or datetime.date.today()).replace(day=1)
    out = []
    for _ in range(n):
        d = d - datetime.timedelta(days=1)
        out.append(d.strftime('%Y%m%d'))
        d = d.replace(day=1)
    return out


def download(isin, d):
    req = urllib.request.Request(URL.format(isin=isin, d=d), headers={'User-Agent': 'Mozilla/5.0 (PEAnalyze compositions robot)'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        return None
    return body if body[:4] == b'%PDF' else None


def main():
    limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else None
    known = json.load(open(KNOWN, encoding='utf-8')) if KNOWN.exists() else {}
    previous = json.load(open(OUT, encoding='utf-8')) if OUT.exists() else {'items': {}}
    items = dict(previous.get('items', {}))
    CACHE.mkdir(parents=True, exist_ok=True)
    isins = sorted(known)[:limit]
    fresh = fail = 0
    for isin in isins:
        have = max(known[isin]['date'], items.get(isin, {}).get('date', ''))
        if known[isin].get('src') == 'dws':  # Xtrackers : positions du fonds via l'API de la page produit
            r = dws.fetch(isin)
            time.sleep(0.25)
            if r and r['date'] > have:
                items[isin] = dict(date=r['date'], title=r['title'], sectors=r['sectors'], countries=r['countries'])
                fresh += 1
            elif not r:
                fail += 1
            continue
        for d in month_ends():
            iso = f'{d[:4]}-{d[4:6]}-{d[6:]}'
            if iso <= have:
                break  # rien de plus récent que ce que l'on a déjà
            body = download(isin, d)
            time.sleep(0.25)
            if not body:
                continue
            path = CACHE / f'{isin}.pdf'
            path.write_bytes(body)
            try:
                r = fp.parse(str(path))
                v = comp.validate(r)
            except Exception:
                v = None
            if v and r.get('date') and r['date'] > have:
                items[isin] = dict(date=r['date'], title=r.get('title', ''), sectors=v['sectors'], countries=v['countries'])
                fresh += 1
            else:
                fail += 1
            break
    out = dict(updatedAt=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), items=items)
    changed = items != previous.get('items', {})
    if changed or not OUT.exists():
        json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    print(f'{len(isins)} ETF sources, {fresh} fiches plus récentes, {fail} illisibles, changed={str(changed).lower()}')
    gh = pathlib.Path(__import__('os').environ.get('GITHUB_OUTPUT', ''))
    if gh.name:
        with open(gh, 'a') as f:
            f.write(f'changed={str(changed).lower()}\n')


if __name__ == '__main__':
    main()
