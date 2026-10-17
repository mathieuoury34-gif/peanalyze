#!/usr/bin/env python3
"""Normalisation des répartitions lues dans les fiches mensuelles (libellés français, poids en fraction).

Les fiches Amundi utilisent la classification GICS (11 secteurs) en anglais, allemand ou français selon le pays de
diffusion ; on les ramène à un vocabulaire unique pour que les secteurs de plusieurs ETF s'additionnent dans l'application.
"""
import re

SECTOR = {
    # anglais
    'information technology': 'Technologies de l’information', 'financials': 'Finance', 'communication services': 'Services de communication',
    'health care': 'Santé', 'healthcare': 'Santé', 'consumer discretionary': 'Consommation discrétionnaire', 'industrials': 'Industrie',
    'consumer staples': 'Consommation de base', 'energy': 'Énergie', 'utilities': 'Services aux collectivités',
    'real estate': 'Immobilier', 'materials': 'Matériaux', 'others': 'Autres', 'other': 'Autres',
    # allemand
    'it': 'Technologies de l’information', 'finanzwesen': 'Finance', 'kommunikationsdienste': 'Services de communication',
    'gesundheit': 'Santé', 'zyklische konsumgüter': 'Consommation discrétionnaire', 'industrie': 'Industrie',
    'nicht-zyklische konsumgüter': 'Consommation de base', 'energie': 'Énergie', 'öffentliche dienstleistungen': 'Services aux collectivités',
    'immobilien': 'Immobilier', 'grundstoffe': 'Matériaux', 'sonstige': 'Autres',
    # français
    "technologies de l'info.": 'Technologies de l’information', "technologies de l’info.": 'Technologies de l’information',
    "technologies de l'information": 'Technologies de l’information', 'finance': 'Finance',
    'services de communication': 'Services de communication', 'santé': 'Santé', 'conso cyclique': 'Consommation discrétionnaire',
    'conso non cyclique': 'Consommation de base', 'énergie': 'Énergie', 'services publics': 'Services aux collectivités',
    'immobilier': 'Immobilier', 'matériaux': 'Matériaux', 'autres': 'Autres', 'autres pays': 'Autres',
    # positions Xtrackers (DWS) en GICS français ; la classification ICB de DWS (« technologie », « industries »…) reste volontairement inconnue
    'soins de santé': 'Santé', 'biens de consommation de base': 'Consommation de base', 'industrie': 'Industrie', 'inconnu': 'Autres',
    'consommation discrétionnaire': 'Consommation discrétionnaire', 'services aux collectivités': 'Services aux collectivités',
}

COUNTRY = {
    'afrique du sud': 'Afrique du Sud', 'south africa': 'Afrique du Sud', 'südafrika': 'Afrique du Sud',
    'allemagne': 'Allemagne', 'germany': 'Allemagne', 'deutschland': 'Allemagne',
    'arabie saoudite': 'Arabie saoudite', 'saudi arabia': 'Arabie saoudite', 'saudi-arabien': 'Arabie saoudite',
    'australie': 'Australie', 'australia': 'Australie', 'australien': 'Australie',
    'autriche': 'Autriche', 'austria': 'Autriche', 'österreich': 'Autriche',
    'belgique': 'Belgique', 'belgium': 'Belgique', 'belgien': 'Belgique',
    'brésil': 'Brésil', 'brazil': 'Brésil', 'brasilien': 'Brésil',
    'canada': 'Canada', 'kanada': 'Canada',
    'chili': 'Chili', 'chile': 'Chili',
    'chine': 'Chine', 'china': 'Chine',
    'colombie': 'Colombie', 'colombia': 'Colombie', 'kolumbien': 'Colombie',
    'corée': 'Corée du Sud', 'corée du sud': 'Corée du Sud', 'korea': 'Corée du Sud', 'south korea': 'Corée du Sud', 'südkorea': 'Corée du Sud',
    'danemark': 'Danemark', 'denmark': 'Danemark', 'dänemark': 'Danemark',
    'emirats arabes unis': 'Émirats arabes unis', 'émirats arabes unis': 'Émirats arabes unis', 'united arab emirates': 'Émirats arabes unis',
    'vereinigten arabischen emirate': 'Émirats arabes unis', 'vereinigte arabische emirate': 'Émirats arabes unis',
    'espagne': 'Espagne', 'spain': 'Espagne', 'spanien': 'Espagne',
    'finlande': 'Finlande', 'finland': 'Finlande', 'finnland': 'Finlande',
    'france': 'France', 'frankreich': 'France',
    'grèce': 'Grèce', 'greece': 'Grèce', 'griechenland': 'Grèce',
    'hong kong': 'Hong Kong', 'hongrie': 'Hongrie', 'hungary': 'Hongrie', 'ungarn': 'Hongrie',
    'inde': 'Inde', 'india': 'Inde', 'indien': 'Inde',
    'indonésie': 'Indonésie', 'indonesia': 'Indonésie', 'indonesien': 'Indonésie',
    'irlande': 'Irlande', 'ireland': 'Irlande', 'irland': 'Irlande',
    'israël': 'Israël', 'israel': 'Israël',
    'italie': 'Italie', 'italy': 'Italie', 'italien': 'Italie',
    'japon': 'Japon', 'japan': 'Japon',
    'koweït': 'Koweït', 'koweit': 'Koweït', 'kuwait': 'Koweït',
    'république tchèque': 'République tchèque', 'czech republic': 'République tchèque', 'tschechien': 'République tchèque',
    'luxembourg': 'Luxembourg', 'luxemburg': 'Luxembourg',
    'malaisie': 'Malaisie', 'malaysie': 'Malaisie', 'malaysia': 'Malaisie',
    'mexique': 'Mexique', 'mexico': 'Mexique', 'mexiko': 'Mexique',
    'norvège': 'Norvège', 'norway': 'Norvège', 'norwegen': 'Norvège',
    'nouvelle-zélande': 'Nouvelle-Zélande', 'new zealand': 'Nouvelle-Zélande', 'neuseeland': 'Nouvelle-Zélande',
    'pays-bas': 'Pays-Bas', 'netherlands': 'Pays-Bas', 'niederlande': 'Pays-Bas',
    'pérou': 'Pérou', 'peru': 'Pérou',
    'philippines': 'Philippines', 'philippinen': 'Philippines',
    'pologne': 'Pologne', 'poland': 'Pologne', 'polen': 'Pologne',
    'portugal': 'Portugal', 'qatar': 'Qatar', 'katar': 'Qatar',
    'royaume-uni': 'Royaume-Uni', 'united kingdom': 'Royaume-Uni', 'vereinigtes königreich': 'Royaume-Uni',
    'singapour': 'Singapour', 'singapore': 'Singapour', 'singapur': 'Singapour',
    'suède': 'Suède', 'sweden': 'Suède', 'schweden': 'Suède',
    'suisse': 'Suisse', 'switzerland': 'Suisse', 'schweiz': 'Suisse',
    'taïwan': 'Taïwan', 'taiwan': 'Taïwan',
    'thaïlande': 'Thaïlande', 'thailand': 'Thaïlande',
    'turquie': 'Turquie', 'turkey': 'Turquie', 'türkei': 'Turquie',
    'états-unis': 'États-Unis', 'united states': 'États-Unis', 'vereinigte staaten': 'États-Unis',
    'bermudes': 'Bermudes', 'bermuda': 'Bermudes',
    'others': 'Autres', 'other': 'Autres', 'sonstige': 'Autres', 'autres pays': 'Autres', 'autres': 'Autres',
    # les fiches allemandes collent parfois deux libellés
    'portugal sonstige': 'Autres', '--': 'Autres', 'inconnu': 'Autres', 'jersey': 'Autres',
}


def _key(label):
    return re.sub(r'\s+', ' ', label.replace('’', "'").strip().lower())


def canon(rows, kind):
    """rows : [(libellé brut, poids en %)] → ([{label, weight}], inconnus).
    Fusionne les doublons, complète à 100 % avec « Autres », classe par poids décroissant (« Autres » en dernier)."""
    table = SECTOR if kind == 'sectors' else COUNTRY
    acc, unknown, seen = {}, [], set()
    for raw, w in rows:
        lab = table.get(_key(raw))
        if lab is None:
            unknown.append(raw); continue
        # une fiche affichant fonds et indice côte à côte répète les libellés : on garde la première série
        if lab in seen and lab != 'Autres':
            continue
        seen.add(lab)
        acc[lab] = acc.get(lab, 0) + w
    total = sum(acc.values())
    return acc, total, unknown


def finalize(acc, total):
    """Poids en fraction (4 décimales) ; le reste à 100 % va dans « Autres »."""
    items = {k: v for k, v in acc.items() if v > 0}
    gap = 100 - total
    if gap > 0.05:
        items['Autres'] = items.get('Autres', 0) + gap
    out = [{'label': k, 'weight': round(v / 100, 4)} for k, v in items.items() if v >= 0.05]
    out.sort(key=lambda x: (x['label'] == 'Autres', -x['weight']))
    return out


def validate(parsed):
    """Résultat canonique d'une fiche lue, ou None si la lecture n'est pas fiable."""
    res = {}
    for kind in ('sectors', 'countries'):
        rows = parsed.get(kind) or []
        if not rows or any(not l for l, _ in rows):
            return None
        acc, total, unknown = canon(rows, kind)
        if unknown or not (98.0 <= total <= 102.0) or not acc:
            return None
        res[kind] = finalize(acc, total)
    return res
