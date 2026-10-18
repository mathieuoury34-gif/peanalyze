#!/usr/bin/env python3
"""Robot mensuel : surveille les pages tarifaires des courtiers (data-src/brokers-watch.json) et écrit public/brokers-watch.json.

Principe : pour chaque page (HTML ou PDF), on extrait tous les montants en € et en % et on en garde l'empreinte.
Si l'empreinte change d'un mois à l'autre, `changedAt` prend la date du jour : l'application affiche alors
« tarifs à revérifier » pour ce courtier tant que sa grille (src/domain/brokers.ts, champ `checked`) n'a pas été revue.
Le robot ne modifie JAMAIS les grilles : il signale, une personne vérifie.
Une page illisible (site bloqué, erreur réseau) n'est pas un changement : elle est notée dans `error` et l'ancienne empreinte est gardée.
Sortie GitHub Actions : changed=true si le fichier a changé ; changes=<ids séparés par des virgules> si des pages ont changé de chiffres.
Usage : python3 scripts/watch-brokers.py [--config data-src/brokers-watch.json] [--out public/brokers-watch.json]
"""
import argparse, datetime, hashlib, io, json, os, pathlib, re, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 12,50 €  ·  0,35 %  ·  1.90 euros  ·  0,5%
AMOUNT = re.compile(r'\d{1,3}(?:[  .]\d{3})*(?:[.,]\d{1,2})?\s?(?:€|euros?|%)', re.I)


def figures(text):
    """Les montants et pourcentages d'une page, normalisés, sans doublon, triés."""
    found = set()
    for m in AMOUNT.findall(text):
        v = re.sub(r'[\s  ]', '', m.lower()).replace('euros', '€').replace('euro', '€').replace(',', '.')
        found.add(v)
    return sorted(found)


def to_text(body, content_type, url):
    if 'pdf' in content_type.lower() or url.lower().endswith('.pdf') or body[:4] == b'%PDF':
        import pdfplumber
        with pdfplumber.open(io.BytesIO(body)) as pdf:
            return '\n'.join((p.extract_text() or '') for p in pdf.pages)
    html = body.decode('utf-8', errors='ignore')
    html = re.sub(r'(?is)<(script|style|noscript)\b.*?</\1>', ' ', html)
    return re.sub(r'<[^>]+>', ' ', html)


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (PEAnalyze tariffs watch)', 'Accept-Language': 'fr-FR,fr;q=0.9'})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read(), r.headers.get('Content-Type', '')


def run(config, out_path, today, fetcher=fetch):
    old = {}
    if out_path.exists():
        try:
            old = json.loads(out_path.read_text('utf-8')).get('items', {})
        except Exception:
            old = {}
    items, changes = {}, []
    for bid, url in config.items():
        if bid.startswith('_'):
            continue
        prev = old.get(bid, {})
        item = {k: v for k, v in prev.items() if k in ('hash', 'count', 'changedAt')}
        try:
            body, ctype = fetcher(url)
            figs = figures(to_text(body, ctype, url))
            if len(figs) < 3:
                raise ValueError('page sans tarifs lisibles (%d chiffres)' % len(figs))
            h = hashlib.sha256('|'.join(figs).encode()).hexdigest()[:16]
            if prev.get('hash') and prev['hash'] != h:
                item['changedAt'] = today
                changes.append(bid)
            item.update(hash=h, count=len(figs), checkedAt=today)
        except Exception as e:  # site bloqué, PDF illisible, réseau : ni changement ni alerte, simplement noté
            item['error'] = ('%s: %s' % (type(e).__name__, e))[:160]
            item['checkedAt'] = prev.get('checkedAt', '')
            item['triedAt'] = today
        items[bid] = item
    return {'updatedAt': today, 'items': items}, changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', default=str(ROOT / 'data-src' / 'brokers-watch.json'))
    ap.add_argument('--out', default=str(ROOT / 'public' / 'brokers-watch.json'))
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    today = datetime.date.today().isoformat()
    before = out.read_text('utf-8') if out.exists() else ''
    result, changes = run(json.loads(pathlib.Path(a.config).read_text('utf-8')), out, today)
    text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    # `updatedAt` seul ne justifie pas de republier le site
    strip = lambda t: re.sub(r'"(updatedAt|triedAt|checkedAt)":\s*"[^"]*",?', '', t)
    changed = strip(before) != strip(text)
    out.write_text(text, 'utf-8')
    for k, v in (('changed', 'true' if changed else 'false'), ('changes', ','.join(changes))):
        print('%s=%s' % (k, v))
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as f:
                f.write('%s=%s\n' % (k, v))
    for bid, it in result['items'].items():
        print(' ', bid, it.get('error') or ('ok %s chiffres' % it.get('count')))


if __name__ == '__main__':
    main()
