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
    OUT.write_text(json.dumps({'source': "justETF via quentinarioli.fr (05/10/2026) — frais, encours et cours au 30/09/2026", 'updated': '2026-10-05', 'etfs': out}, ensure_ascii=False, indent=0))
    print(len(out), 'ETF ;', sum(1 for c in out if c['ticker']), 'cotés à Paris ->', OUT.relative_to(ROOT))

if __name__ == '__main__':
    main()
