#!/usr/bin/env python3
"""Test « hors ligne » d'une PWA construite (dossier dist/), dans les conditions de GitHub Pages.

  python3 pwa_offline_check.py <dossier dist> <sous-chemin du dépôt> "<texte visible au démarrage>"
  ex. : python3 pwa_offline_check.py dist mon-depot "Portefeuille"

Principe : sert dist/ en https sous /<sous-chemin>/ (comme https://compte.github.io/<depot>/), charge l'app,
attend que le service worker soit actif, puis ARRÊTE le serveur (vrai mode hors ligne : context.set_offline ne
coupe pas les requêtes du service worker, il ne faut pas s'y fier) et rouvre l'app de plusieurs façons.
Prérequis : python3, playwright (+ chromium), openssl.
"""
import http.server, os, ssl, subprocess, sys, tempfile, threading
from playwright.sync_api import sync_playwright

root, prefix, expected = os.path.abspath(sys.argv[1]), '/' + sys.argv[2].strip('/') + '/', sys.argv[3]
PORT = 8443
BASE = f'https://127.0.0.1:{PORT}{prefix}'
CHROMIUM = os.environ.get('CHROMIUM_PATH')  # facultatif ; sinon Chromium installé par Playwright

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?')[0].split('#')[0]
        return os.path.join(root, path[len(prefix):]) if path.startswith(prefix) else os.path.join(root, '__absent__')
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=0'); super().end_headers()

tmp = tempfile.mkdtemp()
subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', tmp + '/k.pem', '-out', tmp + '/c.pem', '-days', '2',
                '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], check=True, capture_output=True)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H)
tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); tls.load_cert_chain(tmp + '/c.pem', tmp + '/k.pem')
srv.socket = tls.wrap_socket(srv.socket, server_side=True)
threading.Thread(target=srv.serve_forever, daemon=True).start()

ok = True
def check(label, cond, detail=''):
    global ok; ok &= bool(cond); print('OK  ' if cond else 'FAIL', label, detail)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROMIUM, args=['--ignore-certificate-errors']) if CHROMIUM else p.chromium.launch(args=['--ignore-certificate-errors'])
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, ignore_https_errors=True)
    pg = ctx.new_page()
    pg.goto(BASE); pg.wait_for_timeout(3000)
    st = pg.evaluate("""async()=>{const r=await navigator.serviceWorker?.getRegistration();
      return {reg:!!r, active:!!(r&&r.active), scope:r&&r.scope,
              caches:await Promise.all((await caches.keys()).map(async k=>[k,(await (await caches.open(k)).keys()).length]))}}""")
    check('service worker enregistré et actif', st['reg'] and st['active'], str(st['scope']))
    check('le service worker couvre bien le sous-chemin du dépôt', bool(st['scope']) and st['scope'].endswith(prefix), str(st['scope']))
    check('un cache contient des fichiers', any(n > 0 for _, n in st['caches']), str(st['caches']))
    pg.reload(); pg.wait_for_timeout(2000)
    check('la page est contrôlée par le service worker après rechargement', pg.evaluate("()=>!!navigator.serviceWorker.controller"))

    srv.shutdown(); srv.server_close()                       # ← plus aucun serveur : vrai « hors ligne »
    for label, target in (('rechargement', None), ("adresse de départ (start_url)", BASE),
                          ('adresse avec paramètre (?source=pwa)', BASE + '?source=pwa'), ('route interne (#/…)', BASE + '#/test-route')):
        try:
            pg.reload() if target is None else pg.goto(target)
            pg.wait_for_timeout(2500)
            body = pg.inner_text('body').lower()
            check(label + ' : l\'application s\'affiche', expected.lower() in body, repr(body[:60]))
            check(label + ' : aucune page d\'erreur', not any(w in body for w in ('introuvable', 'not found', '404', 'err_', 'hors connexion', 'no internet', 'ne peut pas être atteint')))
        except Exception as e:
            check(label, False, str(e).split('\n')[0][:110])
    b.close()
print('RÉSULTAT :', 'PASSE' if ok else 'ÉCHEC'); sys.exit(0 if ok else 1)
