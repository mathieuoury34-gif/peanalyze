#!/usr/bin/env python3
"""Lit la répartition sectorielle et géographique d'une fiche mensuelle d'ETF (PDF Amundi, anglais/français/allemand).

Les fiches mettent les libellés à gauche et les pourcentages à droite des barres : on retrouve chaque ligne par sa position
(pdfplumber) plutôt que par le texte brut, qui mélange les colonnes. Retourne des libellés bruts ; la normalisation
(libellés français GICS, pays) est faite par scripts/compositions.py.
"""
import re, sys, json
import pdfplumber

SECTOR_KW = {'sector', 'sectors', 'sektoren', 'sektor', 'sectorielle', 'sectorielles', 'secteur', 'secteurs', 'branchen', 'sectoral'}
GEO_KW = {'geographical', 'geographic', 'länder', 'ländern', 'géographique', 'geografische', 'country', 'countries', 'pays', 'regional', 'region', 'regionen'}
HOLD_KW = {'holdings', 'positionen', 'positions', 'principales', 'größten', 'lignes', 'constituants', 'constituents', 'top'}
VAL = re.compile(r'^\d{1,3}[.,]\d{1,2}$')


def _lines(words, tol=3):
    out = []
    for w in sorted(words, key=lambda a: (a['top'], a['x0'])):
        for ln in out:
            if abs(ln[0] - w['top']) <= tol:
                ln[1].append(w); break
        else:
            out.append([w['top'], [w]])
    for ln in out:
        ln[1].sort(key=lambda a: a['x0'])
    return out


def _segment(line_words, idx):
    """Début et fin (x) du titre contenant le mot idx : les mots voisins séparés de moins de 14 pt."""
    a = idx
    while a > 0 and line_words[a]['x0'] - line_words[a - 1]['x1'] < 14:
        a -= 1
    b = idx
    while b < len(line_words) - 1 and line_words[b + 1]['x0'] - line_words[b]['x1'] < 14:
        b += 1
    return line_words[a]['x0'], line_words[b]['x1']


def _header(lines, kws, skip_words=()):
    """Titre de bloc (« Aufteilung nach Sektoren (Quelle : Amundi) ») : un mot-clé dans un segment qui cite aussi la source,
    ce qui écarte les phrases de description où figure le même mot."""
    for top, ws in lines:
        for i, w in enumerate(ws):
            t = re.sub(r'[^\wäöüéèêû]', '', w['text'].lower())
            if t not in kws:
                continue
            x0, x1 = _segment(ws, i)
            seg = ' '.join(x['text'].lower() for x in ws if x['x0'] >= x0 - 1 and x['x1'] <= x1 + 1)
            if not re.search(r'quelle|source|fonte|fuente', seg):
                continue
            if any(s in seg for s in skip_words):
                continue
            nxt = [x['x0'] for x in ws if x['x0'] > x1 + 14 and x['x0'] > w['x1']]
            return dict(top=top, x0=x0, x1=x1, next=min(nxt) if nxt else None)
    return None


def _block(words, col_x0, col_x1, y0, y1):
    """Valeurs « 12,34 % » de la colonne et libellés rattachés à la valeur la plus proche en hauteur."""
    inside = [w for w in words if w['x0'] >= col_x0 - 2 and w['x1'] <= col_x1 + 2 and y0 <= w['top'] <= y1]
    vals = []
    for i, w in enumerate(inside):
        if VAL.match(w['text']):
            # la valeur est suivie d'un « % » (même ligne) ou collée à lui
            if any(o['text'].startswith('%') and abs(o['top'] - w['top']) < 3 and 0 <= o['x0'] - w['x1'] < 8 for o in inside):
                vals.append(w)
        elif re.match(r'^\d{1,3}[.,]\d{1,2}%$', w['text']):
            w = dict(w); w['text'] = w['text'].rstrip('%'); vals.append(w)
    if not vals:
        return []
    used = {id(v) for v in vals}
    labels = {id(v): [] for v in vals}
    for w in inside:
        if id(w) in used or w['text'].startswith('%') or re.match(r'^[\d.,%]+$', w['text']):
            continue
        cy = (w['top'] + w['bottom']) / 2
        v = min(vals, key=lambda v: abs((v['top'] + v['bottom']) / 2 - cy))
        if abs((v['top'] + v['bottom']) / 2 - cy) <= 16:
            labels[id(v)].append(w)
    rows = []
    for v in vals:
        ws = sorted(labels[id(v)], key=lambda a: (round(a['top'] / 4), a['x0']))
        lab = ' '.join(a['text'] for a in ws).strip()
        rows.append((lab, float(v['text'].replace(',', '.'))))
    return rows


def parse(path):
    meta = {}
    with pdfplumber.open(path) as pdf:
        kw = (pdf.metadata or {}).get('Keywords', '') or ''
        m = re.search(r'RecordDate=([\d-]+)', kw); meta['date'] = m.group(1) if m else None
        m = re.search(r'Language=(\w+)', kw); meta['lang'] = m.group(1) if m else None
        try:
            first = (pdf.pages[0].extract_text() or '').strip().splitlines()
            meta['title'] = next((l.strip() for l in first if len(l.strip()) > 8), '')
        except Exception:
            meta['title'] = ''
        best = None
        for pi, p in enumerate(pdf.pages):
            words = p.extract_words()
            lines = _lines(words)
            sec = _header(lines, SECTOR_KW, skip_words=('stock', 'bourse'))
            geo = _header(lines, GEO_KW)
            if not sec or not geo:
                continue
            axis_top = min([t for t, ws in lines if sum(1 for w in ws if re.match(r'^\d+$', w['text'])) >= 4 and t > min(sec['top'], geo['top'])] or [p.height])
            # colonne secteurs
            s_x0 = sec['x0'] - 4
            s_x1 = sec['next'] - 4 if sec['next'] else p.width
            if sec['next'] is None:
                # titre seul sur sa ligne : la colonne s'arrête au prochain bloc à droite (positions principales)
                hold = [w['x0'] for w in words if re.sub(r'[^\wäöü]', '', w['text'].lower()) in HOLD_KW and w['x0'] > s_x0 + 120]
                if hold: s_x1 = min(hold) - 4
            # si « Benchmark » précède le titre secteur
            g_x0 = geo['x0'] - 4
            g_x1 = (s_x0 - 2) if s_x0 > g_x0 + 60 else (p.width / 2)
            sectors = _block(words, s_x0, s_x1, sec['top'] + 6, axis_top)
            countries = _block(words, g_x0, g_x1, geo['top'] + 6, axis_top)
            score = (len(sectors) > 0) + (len(countries) > 0)
            if best is None or score > best[0]:
                best = (score, pi, sectors, countries)
        if best:
            meta['page'] = best[1]; meta['sectors'] = best[2]; meta['countries'] = best[3]
        else:
            meta['sectors'] = []; meta['countries'] = []
    return meta


if __name__ == '__main__':
    print(json.dumps(parse(sys.argv[1]), ensure_ascii=False, indent=1))
