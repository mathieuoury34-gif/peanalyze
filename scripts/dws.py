#!/usr/bin/env python3
"""Xtrackers (DWS) : positions du fonds avec pays et secteur de chaque ligne → répartition par pays et par secteur.

Source : l'API publique de la page produit (https://etf.dws.com/api/pdp/fr-fr/etf/<ISIN>/holdings), sans clé.
Seuls les fonds dont tous les secteurs sont en GICS (même vocabulaire que les fiches Amundi) sont retenus : les autres
utilisent la classification ICB de DWS (« Sociétés financières », « Technologie »…), non comparable, et sont refusés par
compositions.validate() faute de libellé connu.
"""
import re, sys, json, pathlib, urllib.request, urllib.error
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import compositions as comp

URL = 'https://etf.dws.com/api/pdp/fr-fr/etf/{isin}/holdings'


def get(isin):
    req = urllib.request.Request(URL.format(isin=isin), headers={'User-Agent': 'Mozilla/5.0 (PEAnalyze compositions robot)'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return None


def parse(j):
    """{'date', 'sectors': [(libellé, %)], 'countries': [...]} ou None."""
    if not j or not j.get('tables'):
        return None
    t = j['tables'][0]
    cols = {c['key']: c['value'] for c in t.get('columns', [])}
    wk = next((k for k, v in cols.items() if v.lower().startswith('pond')), None)
    ck = next((k for k, v in cols.items() if v.lower() == 'pays'), None)
    sk = next((k for k, v in cols.items() if v.lower() == 'secteur'), None)
    ak = next((k for k, v in cols.items() if 'actif' in v.lower()), None)
    if not (wk and ck and sk) or not t.get('values'):
        return None
    sec, cty = {}, {}
    for r in t['values']:
        if ak and r[ak]['value'].strip().lower() not in ('actions', 'equity'):
            continue
        w = r[wk].get('sortValue')
        if w is None:
            m = re.search(r'-?[\d,.]+', str(r[wk]['value']))
            w = float(m.group(0).replace(',', '.')) if m else 0.0
        s, c = r[sk]['value'].strip(), r[ck]['value'].strip()
        sec[s] = sec.get(s, 0) + w
        cty[c] = cty.get(c, 0) + w
    date = None
    for d in t.get('disclaimers', []):
        m = re.search(r'(\d{2})/(\d{2})/(\d{4})', d.get('text', ''))
        if m:
            date = f'{m.group(3)}-{m.group(2)}-{m.group(1)}'
    if not date:
        m = re.search(r'(\d{2})/(\d{2})/(\d{4})', j.get('asOfDate') or '')
        date = f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else None
    return {'date': date, 'sectors': list(sec.items()), 'countries': list(cty.items())}


def fetch(isin):
    """Répartition canonique {date, sectors, countries, title} ou None si indisponible / non GICS."""
    r = parse(get(isin))
    if not r or not r['date']:
        return None
    v = comp.validate(r)
    if not v:
        return None
    return dict(date=r['date'], title='Xtrackers · positions du fonds', sectors=v['sectors'], countries=v['countries'], src='dws')


if __name__ == '__main__':
    for i in sys.argv[1:]:
        print(i, fetch(i))
