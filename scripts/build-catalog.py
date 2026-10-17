#!/usr/bin/env python3
"""Construit src/data/catalog.json (catalogue des ETF éligibles au PEA) à partir de data-src/catalogue-pea.csv.

Source : liste des ETF éligibles au PEA (justETF) relevée par quentinarioli.fr le 05/10/2026
(frais, encours et cours au 30/09/2026). Les années de création, nombres de composants et modes de
réplication connus viennent du fichier Excel d'origine (21 ETF) ; ailleurs ils restent vides plutôt que devinés,
sauf la réplication synthétique, certaine pour un ETF éligible au PEA qui suit un indice hors Union européenne.
Usage : python3 scripts/build-catalog.py
"""
import csv, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'data-src' / 'catalogue-pea.csv'
OLD = ROOT / 'data-src' / 'catalogue-excel.json'
OUT = ROOT / 'src' / 'data' / 'catalog.json'

CATEGORY = {
    'World': 'Monde', 'USA': 'États-Unis', 'Emerging': 'Émergents, Asie et Japon', 'France': 'France',
    'Europe': 'Europe', 'EuroStoxx50': 'Zone euro', 'Eurozone': 'Zone euro', 'Germany': 'Allemagne',
    'OtherCountries': 'Autres pays européens', 'Sector': 'Secteurs et thèmes', 'Leverage': 'Levier et inverse',
    'Other': 'Monétaire et diversifiés', 'Extra': None,
}
# indices hors UE : un ETF éligible au PEA les réplique forcément par swap
SYNTH_CATS = {'World', 'USA', 'Emerging', 'Leverage'}

ISSUERS = ['Amundi PEA', 'Amundi ETF', 'Amundi Core', 'Amundi', 'iShares Core', 'iShares', 'BNP Paribas Easy', 'Xtrackers',
           'UBS Core', 'UBS', 'HSBC', 'Ossiam', 'Vanguard', 'State Street SPDR', 'State Street', 'WisdomTree', 'Invesco',
           'First Trust', 'Global X', 'HANetf', 'JPMorgan', 'CM-AM', 'Ofi Invest', 'Independance AM']

SPECIAL = [  # (motif, indice)
    (r'Monde \(MSCI World\)', 'MSCI World'), (r'Global \(MSCI ACWI\)', 'MSCI ACWI'), (r'Luxe Monde', 'Luxe Monde'),
    (r'MSCI World.*\(2x\)', 'MSCI World Levier x2'), (r'MSCI World', 'MSCI World'),
    (r'S&P 500 Screened', 'S&P 500 Screened'), (r'S&P 500', 'S&P 500'), (r'US Tech Screened', 'US Tech 100 Screened'),
    (r'Nasdaq-100 Daily \(2x\)', 'Nasdaq-100 Levier x2'), (r'Nasdaq-100 Daily \(-1x\)', 'Nasdaq-100 Inverse x1'), (r'Nasdaq-100', 'Nasdaq-100'),
    (r'Russell 2000', 'Russell 2000'), (r'MSCI USA ESG Selection', 'MSCI USA ESG'), (r'MSCI USA Value', 'MSCI USA Value'),
    (r'MSCI USA Daily \(2x\)', 'MSCI USA Levier x2'), (r'Dow Jones Industrial', 'Dow Jones Industrial Average'),
    (r'S&P US Industrials', 'S&P US Industrials'), (r'S&P US Consumer Staples', 'S&P US Consumer Staples'),
    (r'Emergent EMEA', 'MSCI EM EMEA'), (r'Emergent \(MSCI Emerging\)', 'MSCI Emerging Markets'), (r'Asie Emergente', 'MSCI EM Asia'),
    (r'Latin America', 'MSCI EM Latin America'), (r'Asie Pacifique', 'MSCI AC Asia Pacific ex Japan'),
    (r'Bloomberg Asia Pacific ex Japan PAB', 'Bloomberg Asia Pacific ex Japan PAB'), (r'Inde \(MSCI India\)', 'MSCI India'),
    (r'TOPIX', 'TOPIX'), (r'Chine \(MSCI China\)', 'MSCI China'), (r'Bloomberg Japan PAB', 'Bloomberg Japan PAB'),
    (r'CAC 40 Daily \(2x\)', 'CAC 40 Levier x2'), (r'CAC 40 Daily \(-2x\)', 'CAC 40 Inverse x2'), (r'CAC 40 Daily \(-1x\)', 'CAC 40 Inverse x1'),
    (r'CAC 40 ESG', 'CAC 40 ESG'), (r'CAC Transition Climat', 'CAC Transition Climat'), (r'CAC 40', 'CAC 40'),
    (r'MSCI France', 'MSCI France'), (r'France Small & Mid', 'France Small & Mid (gestion active)'),
    (r'Developed Europe ex UK', 'FTSE Developed Europe ex UK'), (r'Developed Europe Small-Cap', 'FTSE Developed Europe Small Cap'),
    (r'Stoxx Europe Select Dividend 30', 'STOXX Europe Select Dividend 30'), (r'Europe ex Eurozone PAB', 'Bloomberg Europe ex Eurozone PAB'),
    (r'Europe 600 ESG Equal Weight', 'STOXX Europe 600 ESG Equal Weight'), (r'CAPE Europe', 'Shiller Barclays CAPE Europe Value'),
    (r'Low Volatility Europe', 'Europe Low Volatility'), (r'Dividend Europe', 'Europe Dividend'), (r'Value Europe', 'Europe Value'),
    (r'Quality Europe', 'Europe Quality'), (r'Growth Europe', 'Europe Growth'), (r'RAFI Europe', 'FTSE RAFI Europe'),
    (r'Europe ESG Machine Learning', 'Europe ESG Machine Learning'), (r'Quant Europe 50', 'Trading Central Quant Europe 50'),
    (r'Bloomberg Europe Defense', 'Bloomberg Europe Defense'), (r'European Infrastructure', 'Europe Infrastructure Development'),
    (r'Europe Infrastructure', 'Europe Infrastructure'), (r'Strategic Autonomy', 'European Strategic Autonomy'),
    (r'Immobilier Europe', 'FTSE EPRA/NAREIT Europe'), (r'MSCI Europe Information Technology', 'MSCI Europe IT'),
    (r'Eau \(MSCI Water\)', 'MSCI Water'),
    (r'STOXX Europe 600 (Banks|Healthcare|Basic Resources|Industrials|Technology|Utilities|Automobiles & Parts|Insurance|Consumer Discretionary|Consumer Staples|Telecommunications|Basic Materials)', None),
    (r'STOXX Europe 600', 'STOXX Europe 600'), (r'PEA MSCI Europe', 'MSCI Europe'), (r'MSCI Europe', 'MSCI Europe'),
    (r'EURO STOXX 50 Daily \(2x\)', 'EURO STOXX 50 Levier x2'), (r'EURO STOXX 50 Daily \(-1x\)', 'EURO STOXX 50 Inverse x1'),
    (r'EURO STOXX 50 ESG', 'EURO STOXX 50 ESG'), (r'EURO STOXX 50', 'EURO STOXX 50'), (r'Euro Stoxx 50', 'EURO STOXX 50'),
    (r'EURO STOXX Banks 30-15', 'EURO STOXX Banks 30-15'), (r'Euro Stoxx Banks', 'EURO STOXX Banks'),
    (r'EURO STOXX Select Dividend 30', 'EURO STOXX Select Dividend 30'), (r'Euro Stoxx Quality Dividend', 'EURO STOXX Quality Dividend'),
    (r'EURO STOXX High Dividend Low Volatility', 'EURO STOXX High Dividend Low Volatility'), (r'EURO STOXX Low Volatility', 'EURO STOXX Low Volatility'),
    (r'Euro Stoxx', 'EURO STOXX'), (r'EURO STOXX', 'EURO STOXX'), (r'Euro Dividend Aristocrats', 'S&P Euro Dividend Aristocrats'),
    (r'S&P Eurozone Climate', 'S&P Eurozone Climate Paris Aligned'), (r'Dow Jones Eurozone Sustainability', 'Dow Jones Eurozone Sustainability'),
    (r'Eurozone Quality Dividend Growth', 'WisdomTree Eurozone Quality Dividend Growth'), (r'Eurozone Efficient Core', 'Eurozone Efficient Core (actions + futures)'),
    (r'Bloomberg Eurozone PAB', 'Bloomberg Eurozone PAB'), (r'Eurozone AlphaDEX', 'NASDAQ AlphaDEX Eurozone'), (r'Eurozone Research Enhanced', 'MSCI EMU (gestion active)'),
    (r'Prime Eurozone', 'Solactive Eurozone'), (r'FTSE Eurozone', 'FTSE Eurozone'), (r'Euro Total Market Growth', 'EURO STOXX Total Market Growth Large'),
    (r'EMU Equity Active', 'Zone euro (gestion active)'), (r'EMU Screened Equity', 'Zone euro Screened (gestion active)'),
    (r'MSCI EMU Small Cap', 'MSCI EMU Small Cap'), (r'MSCI EMU High Dividend', 'MSCI EMU High Dividend'), (r'MSCI EMU Value', 'MSCI EMU Value'),
    (r'MSCI EMU Min TE', 'MSCI EMU Min TE'), (r'MSCI EMU SRI', 'MSCI EMU SRI'), (r'MSCI EMU Socially Responsible', 'MSCI EMU SRI'),
    (r'MSCI EMU (Climate|Paris)', 'MSCI EMU Climate Paris Aligned'), (r'MSCI EMU CTB', 'MSCI EMU CTB Enhanced ESG'), (r'ESG Enhanced EMU', 'MSCI EMU ESG Enhanced'),
    (r'MSCI EMU ESG', 'MSCI EMU ESG'), (r'MSCI EMU Screened', 'MSCI EMU Screened'), (r'MSCI EMU', 'MSCI EMU'),
    (r'LevDax', 'DAX Levier x2'), (r'MDAX ESG', 'MDAX ESG'), (r'MDAX', 'MDAX'), (r'TecDAX', 'TecDAX'), (r'DivDAX', 'DivDAX'),
    (r'DAX ESG', 'DAX ESG'), (r'DAX', 'DAX'), (r'Germany All Cap', 'FTSE Germany All Cap'), (r'Germany AlphaDEX', 'NASDAQ AlphaDEX Germany'),
    (r'FTSE MIB', 'FTSE MIB'), (r'Italy MIB ESG', 'MIB ESG'), (r'IBEX 35', 'IBEX 35'), (r'MSCI Greece', 'MSCI Greece'), (r'ATX', 'ATX (Autriche)'),
    (r'United Kingdom AlphaDEX', 'NASDAQ AlphaDEX United Kingdom'), (r'AEX', 'AEX (Pays-Bas)'),
    (r'Diversified Commodity', 'Bloomberg Commodity (matières premières)'), (r'Euro Court Terme', 'Monétaire euro (€STR)'), (r'Overnight', 'Monétaire euro (€STR)'),
]
SECTOR_FR = {'Banks': 'Banques', 'Healthcare': 'Santé', 'Basic Resources': 'Ressources de base', 'Industrials': 'Industrie',
             'Technology': 'Technologie', 'Utilities': 'Services aux collectivités', 'Automobiles & Parts': 'Automobile',
             'Insurance': 'Assurance', 'Consumer Discretionary': 'Consommation discrétionnaire', 'Consumer Staples': 'Consommation de base',
             'Telecommunications': 'Télécommunications', 'Basic Materials': 'Matériaux'}

# ------------------------------------------------------------------ compositions (pays et secteurs)
COMPO = ROOT / 'data-src' / 'compositions-justetf.txt'
COMPO_DATE = '2026-08-31'
SECTOR_MAP = {  # classification justETF (TRBC) -> libellés français fidèles ; différente du GICS des émetteurs, donc jamais mélangée avec elle
    'Technology': 'Technologie', 'Finance': 'Finance', 'Healthcare': 'Santé', 'Industrials': 'Industrie',
    'Consumer Cyclicals': 'Consommation cyclique', 'Consumer Non-Cyclicals': 'Consommation non cyclique', 'Energy': 'Énergie',
    'Utilities': 'Services aux collectivités', 'Non-Energy Materials': 'Matériaux hors énergie', 'Telecommunication': 'Télécommunications',
    'Business Services': 'Services aux entreprises', 'Consumer Services': 'Services aux consommateurs', 'Real Estate': 'Immobilier', 'Other': 'Autres',
}
COUNTRY_MAP = {
    'United States': 'États-Unis', 'United Kingdom': 'Royaume-Uni', 'Germany': 'Allemagne', 'Switzerland': 'Suisse', 'Netherlands': 'Pays-Bas',
    'Japan': 'Japon', 'China': 'Chine', 'Taiwan': 'Taïwan', 'India': 'Inde', 'South Korea': 'Corée du Sud', 'Ireland': 'Irlande', 'Italy': 'Italie',
    'Spain': 'Espagne', 'Sweden': 'Suède', 'Denmark': 'Danemark', 'Finland': 'Finlande', 'Norway': 'Norvège', 'Belgium': 'Belgique',
    'Australia': 'Australie', 'Brazil': 'Brésil', 'South Africa': 'Afrique du Sud', 'Saudi Arabia': 'Arabie Saoudite', 'Mexico': 'Mexique',
    'Poland': 'Pologne', 'Hong Kong': 'Hong Kong', 'Singapore': 'Singapour', 'New Zealand': 'Nouvelle-Zélande', 'Greece': 'Grèce',
    'Austria': 'Autriche', 'Luxembourg': 'Luxembourg', 'Bermuda': 'Bermudes', 'Canada': 'Canada', 'France': 'France', 'Portugal': 'Portugal',
    'Chile': 'Chili', 'Indonesia': 'Indonésie', 'Malaysia': 'Malaisie', 'Thailand': 'Thaïlande', 'Turkey': 'Turquie', 'Qatar': 'Qatar',
    'United Arab Emirates': 'Émirats arabes unis', 'Kuwait': 'Koweït', 'Peru': 'Pérou', 'Colombia': 'Colombie', 'Philippines': 'Philippines',
    'Cayman Islands': 'Îles Caïmans', 'Israel': 'Israël', 'Hungary': 'Hongrie', 'Czech Republic': 'République tchèque', 'Egypt': 'Égypte',
    'Jersey': 'Jersey', 'Other': 'Autres',
}
# indices dont la fiche justETF ne donne pas la composition : ETF physique (hors PEA) qui suit le même indice
PROXY = {
    'MSCI China': 'IE00BJ5JPG56', 'MSCI EM Asia': 'IE00B5L8K969', 'MSCI EM Latin America': 'IE00B27YCK28',
    'MSCI Emerging Markets': 'IE00B4L5YC18', 'MSCI USA': 'IE00B52SFT06', 'MSCI USA Value': 'IE00BD1F4M44',
    'US Tech 100 Screened': 'FR0011871110', 'Nasdaq-100': 'FR0011871110', 'MSCI Water': 'FR0010527275',
    # secteurs ICB voisins (iShares STOXX Europe 600, physiques) : pays approchés
    'STOXX Europe 600 Industrie': 'DE000A0H08J9', 'STOXX Europe 600 Consommation de base': 'DE000A0H08H3',
    'STOXX Europe 600 Matériaux': 'DE000A0H08E0',
}
# indices sectoriels américains : un seul secteur, sociétés américaines
MANUAL = {
    'S&P US Consumer Staples': {'sectors': [('Consommation de base', 1.0)], 'countries': [('États-Unis', 1.0)]},
    'S&P US Industrials': {'sectors': [('Industrie', 1.0)], 'countries': [('États-Unis', 1.0)]},
}
# secteur unique connu (la classification justETF range l'immobilier coté dans la finance)
SECTOR_OVERRIDE = {'FTSE EPRA/NAREIT Europe': [('Immobilier', 1.0)], 'STOXX Europe 600 Consommation de base': [('Consommation de base', 1.0)],
                   'STOXX Europe 600 Matériaux': [('Matériaux', 1.0)], 'STOXX Europe 600 Industrie': [('Industrie', 1.0)]}

def base_index(idx: str) -> str:
    idx = re.sub(r' \((couvert|part) \w+\)', '', idx)
    return re.sub(r' (Levier|Inverse) x\d', '', idx)

def read_compositions():
    out, cur = {}, None
    if not COMPO.exists():
        return out
    for line in COMPO.read_text(encoding='utf-8').splitlines():
        if line.startswith('ISIN:'):
            cur = out.setdefault(line[5:].strip(), {})
        elif cur is not None and line[:2] in ('C:', 'S:') and 'NONE' not in line:
            mapping = COUNTRY_MAP if line[0] == 'C' else SECTOR_MAP
            items = {}
            for part in line[2:].split(';'):
                if '=' not in part:
                    continue
                k, v = part.rsplit('=', 1)
                k = k.strip()
                w = float(v.strip().rstrip('%')) / 100
                if w < 0.0005:
                    continue
                label = mapping.get(k)
                if label is None:
                    raise SystemExit('libellé inconnu : ' + k)
                items[label] = items.get(label, 0) + w
            others = items.pop('Autres', 0)
            rows = sorted(items.items(), key=lambda x: -x[1])
            if others >= 0.0005:
                rows.append(('Autres', others))
            cur['countries' if line[0] == 'C' else 'sectors'] = rows
    return out

def add_compositions(etfs):
    data = read_compositions()
    groups = {}
    for e in etfs:
        groups.setdefault(base_index(e['index']), []).append(e)
    found = 0
    for base, members in groups.items():
        src = None
        cands = ([PROXY[base]] if base in PROXY else []) + [m['isin'] for m in members]
        for isin in cands:
            if data.get(isin, {}).get('sectors') or data.get(isin, {}).get('countries'):
                src = data[isin]
                break
        if not src:
            src = MANUAL.get(base)
        if not src:
            continue
        sectors = SECTOR_OVERRIDE.get(base, src.get('sectors', []))
        for m in members:
            m['sectors'] = [{'label': k, 'weight': round(w, 4)} for k, w in sectors]
            m['countries'] = [{'label': k, 'weight': round(w, 4)} for k, w in src.get('countries', [])]
            found += 1
    return found

def index_of(name: str) -> str:
    for pat, idx in SPECIAL:
        m = re.search(pat, name)
        if m:
            if idx is None:
                idx = 'STOXX Europe 600 ' + SECTOR_FR[m.group(1)]
            break
    else:
        idx = name
        for p in ISSUERS:
            if idx.startswith(p + ' '):
                idx = idx[len(p) + 1:]
                break
    hedge = re.search(r'\b(EUR|USD|CHF|GBP) Hedged\b|\bh(CHF|GBP|USD)\b', name)
    if hedge:
        idx += ' (couvert ' + (hedge.group(1) or hedge.group(2)) + ')'
    elif re.search(r'\bUSD\b', name) and 'Hedged' not in name:
        idx += ' (part USD)'
    if re.search(r'\(part S\)|\bS Acc\b', name):
        idx += ' (part S)'
    return idx

def num(s: str):
    s = s.replace('€', '').replace('M', '').replace('%', '').replace(' ', '').replace(' ', '').replace(',', '.').strip()
    return float(s) if s else None

ESG_RE = re.compile(r'ESG|SRI|Climate|Climat|PAB|Paris|Screened|Socially|Sustainab|CTB', re.I)

def main():
    old = {c['isin'].strip(): c for c in json.loads(OLD.read_text())}
    rows = [r for r in csv.reader(SRC.open(encoding='utf-8'), delimiter=';') if r and not r[0].startswith('#') and r[0] != 'category']
    cat_by_isin = {r[2]: r[0] for r in rows}
    out = []
    for cat, name, isin, ticker, ter, aum, price, dist, remark in rows:
        extra = cat == 'Extra'
        if extra:  # ETF absent du relevé détaillé : seuls nom, ISIN et frais sont connus ; catégorie déduite du nom
            cat = ('USA' if 'USA' in name or 'S&P 500' in name else 'World' if 'Monde' in name else 'France' if 'CAC' in name or 'France' in name
                   else 'Germany' if 'DAX' in name else 'OtherCountries' if 'AEX' in name or 'IBEX' in name else 'Other' if 'Overnight' in name
                   else 'EuroStoxx50' if 'STOXX 50' in name.upper() else 'Eurozone')
        o = old.get(isin, {})
        on_paris = ticker != 'non coté'
        rep = o.get('replication')
        if not rep and (cat in SYNTH_CATS or 'Swap' in name or re.match(r'Amundi STOXX Europe 600 ', name) or 'Commodity' in name):
            rep = 'Synthétique'
        notes = []
        if remark.strip() == 'à vérifier':
            notes.append('Éligibilité au PEA à confirmer auprès de votre courtier')
        if extra:
            notes.append('Données partielles (frais seulement) ; mnémonique de cotation non relevé')
        elif not on_paris:
            notes.append("Non coté sur Euronext Paris (autre place européenne)")
        e = {
            'index': index_of(name),
            'name': name,
            'isin': isin,
            'ticker': ticker if on_paris else '',
            'exchange': 'Euronext Paris' if on_paris else ('Non renseignée' if extra else 'Autre place européenne'),
            'category': CATEGORY[cat],
            'peaEligible': True,
            'ter': round(num(ter) / 100, 5),
            'aumMEur': num(aum),
            'inceptionYear': int(o['inceptionYear']) if o.get('inceptionYear') else None,
            'holdingsCount': int(o['holdingsCount']) if o.get('holdingsCount') else None,
            'esg': bool(o.get('esg')) or bool(ESG_RE.search(name)),
            'replication': rep,
            'distribution': dist or o.get('distribution') or None,
            'unitPrice': num(price),
        }
        if notes:
            e['note'] = ' · '.join(notes)
        out.append(e)
    out.sort(key=lambda c: (-(c['aumMEur'] or 0), c['name']))
    n_compo = add_compositions(out)
    OUT.write_text(json.dumps({'source': "justETF via quentinarioli.fr (05/10/2026) — frais, encours et cours au 30/09/2026", 'updated': '2026-10-05',
                               'compositionDate': COMPO_DATE, 'etfs': out}, ensure_ascii=False, indent=0))
    print(len(out), 'ETF ;', sum(1 for c in out if c['ticker']), 'cotés à Paris ;', n_compo, 'avec composition ->', OUT.relative_to(ROOT))

if __name__ == '__main__':
    main()
