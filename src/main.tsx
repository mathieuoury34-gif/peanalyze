import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startAutoRefresh } from './data/prices';
import { startSync } from './data/sync';
import './styles/tokens.css';
import './styles/app.css';
import './theme';

createRoot(document.getElementById('root')!).render(<App />);

startSync();
startAutoRefresh();

// Application hors ligne (service worker) – uniquement en production (https)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
