import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutoRefresh } from './data/prices';
import { startSync } from './data/sync';
import { hideSplash } from './splash';
import './styles/tokens.css';
import './styles/app.css';
import './theme';

createRoot(document.getElementById('root')!).render(<App />);

startSync();
setTimeout(hideSplash, 8000); // sécurité : l'écran de lancement ne reste jamais bloqué
startAutoRefresh();

// Application hors ligne (service worker) – uniquement en production (https)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
  // nouvelle version installée : on recharge une fois pour l'appliquer tout de suite (sans attendre la prochaine ouverture)
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
  }
}
