#!/usr/bin/env python3
"""Met à jour les répartitions sectorielle et géographique de src/data/catalog.json à partir des fiches mensuelles officielles.

Chaîne : fiches PDF (dossier de cache) → lecture par position (factsheet_parse.py) → libellés français (compositions.py)
→ catalogue. Pour chaque ETF, par ordre de priorité :
  1. sa propre fiche, si elle est récente (≥ 3 mois) et que sa lecture est complète (somme ≈ 100 %) ;
  2. la fiche d'un ETF suivant le même indice (même composition ; les parts couvertes en devise comptent pour l'indice de base) ;
  3. à défaut, la répartition justETF d'origine est conservée mais marquée « indicatif » (classification TRBC, non comparable).
Usage : python3 scripts/build-compositions.py <dossier_fiches> [<dossier_fiches_supplementaires> ...]
        (chaque PDF s'appelle <ISIN>.pdf ; voir scripts/fetch-factsheets.sh)
"""
import json, re, sys, pathlib, datetime, glob, os
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import factsheet_parse as fp
import compositions as comp

ROOT = pathlib.Path(__file__).resolve().parent.parent
CAT = ROOT / 'src' / 'data' / 'catalog.json'
OUT = ROOT / 'data-src' / 'compositions-fiches.json'
FRESH_AFTER = '2026-07-01'  # une fiche plus ancienne n'est pas utilisée

# indices pour lesquels aucun ETF du catalogue n'a de fiche exploitable : fiche d'un ETF Amundi équivalent (hors catalogue)
EXTRA_SOURCES = {
    'Nasdaq-100': ['LU1829221024'],            # Amundi Core Nasdaq-100 Swap
    'STOXX Europe 600': ['LU0908500753'],      # Amundi Core STOXX Europe 600
    'MSCI ACWI': ['LU1829220216'],             # Amundi MSCI All Country World Swap
    'MSCI India': ['LU1681043086'],            # Amundi MSCI India Swap II
    'MSCI Emerging Markets': ['LU1681045370'], # Amundi MSCI Emerging Markets Swap
    'MSCI EM Asia': ['LU1681044480'],
    'MSCI EM Latin America': ['LU1681045024'],
    'MSCI World': ['LU1681043599'],
    'S&P 500': ['LU1681048804'],
    'Russell 2000': ['LU1681038672'],
    'CAC 40 ESG': ['LU1681046931'],
    'MSCI EMU ESG': ['LU1602144575'],
}


def index_key(idx):
    return re.sub(r'\s*\((couvert|part) [A-Z]{3}\)$', '', idx).strip()


def doc_date(path, parsed):
    if parsed.get('date'):
        return parsed['date']
    return None


def main(dirs):
    cat = json.load(open(CAT, encoding='utf-8'))
    etfs = cat['etfs']
    files = {}
    for d in dirs:  # plusieurs dossiers possibles : à date égale, le premier cité l'emporte (fiches officielles d'abord)
        for f in glob.glob(os.path.join(d, '*.pdf')):
            files.setdefault(pathlib.Path(f).stem, []).append(f)
    parsed = {}
    for isin, paths in sorted(files.items()):
        for f in paths:
            try:
                r = fp.parse(f)
            except Exception:  # PDF illisible
                continue
            v = comp.validate(r)
            if v and r.get('date') and r['date'] >= FRESH_AFTER and (isin not in parsed or r['date'] > parsed[isin]['date']):
                parsed[isin] = dict(date=r['date'], lang=r.get('lang'), title=r.get('title', ''), sectors=v['sectors'], countries=v['countries'])
    print('fiches lues et valides :', len(parsed), '/', len(files))

    own = {e['isin']: e for e in etfs}
    by_index = {}
    for e in etfs:
        by_index.setdefault(index_key(e['index']), []).append(e['isin'])
    for idx, isins in EXTRA_SOURCES.items():
        by_index.setdefault(idx, []).extend(isins)

    stats = {'fiche': 0, 'indice': 0, 'justetf': 0, 'aucune': 0}
    for e in etfs:
        old = {'sectors': e.get('sectors') or [], 'countries': e.get('countries') or []}
        src = None
        if e['isin'] in parsed:
            src, kind = e['isin'], 'fiche'
        else:
            cands = [i for i in by_index.get(index_key(e['index']), []) if i in parsed]
            if cands:
                cands.sort(key=lambda i: (parsed[i]['date'], len(parsed[i]['sectors']) + len(parsed[i]['countries'])), reverse=True)
                src, kind = cands[0], 'indice'
        if src:
            p = parsed[src]
            e['sectors'], e['countries'] = p['sectors'], p['countries']
            e['comp'] = {'kind': kind, 'date': p['date'], 'from': src}
            if kind == 'indice' and p.get('title'):
                e['comp']['fromName'] = p['title']
            stats[kind] += 1
        elif old['sectors'] or old['countries']:
            e['comp'] = {'kind': 'justetf', 'date': cat.get('compositionDate', '')}
            stats['justetf'] += 1
        else:
            e.pop('comp', None)
            stats['aucune'] += 1
    dates = [p['date'] for p in parsed.values()]
    cat['compositionDate'] = max(dates) if dates else cat.get('compositionDate', '')
    cat['compositionSource'] = 'Fiches mensuelles des émetteurs (Amundi), classification GICS ; justETF pour les ETF sans fiche exploitable'
    json.dump(cat, open(CAT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    json.dump(parsed, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    print(stats)


if __name__ == '__main__':
    main(sys.argv[1:] or ['.cache/factsheets'])
