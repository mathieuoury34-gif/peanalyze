# Remplacements exacts (chaque motif doit exister) : python3 scripts/i18n/apply.py fichier < paires.json
import json, sys
path = sys.argv[1]
pairs = json.load(sys.stdin)
s = open(path, encoding='utf-8').read()
for a, b in pairs:
    if a not in s:
        sys.exit(f'{path}: motif introuvable : {a[:90]!r}')
    s = s.replace(a, b)
open(path, 'w', encoding='utf-8').write(s)
print(path, len(pairs), 'remplacements')
