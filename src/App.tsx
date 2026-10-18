import { useEffect, useState } from 'react';
import { useEtfColors } from './etfColors';
import { hideSplash } from './splash';
import { HOME, navigate, useRoute } from './ui/router';
import { TabBar, ToastHost } from './ui/kit';
import { PortfolioScreen, RepartitionsScreen } from './screens/Portfolio';
import { AssistantScreen, TargetSheet } from './screens/Assistant';
import { CatalogueScreen, CompareScreen, EtfDetailScreen, ManageEtfsScreen, MyEtfsScreen } from './screens/Markets';
import { AddSheet, DepositScreen, JournalScreen, OverviewScreen, PurchaseScreen } from './screens/History';
import { SimulatorScreen } from './screens/Simulator';
import { AnalysisScreen } from './screens/Analysis';
import { BrokersScreen } from './screens/Brokers';
import { GoalsScreen } from './screens/Goals';
import { PlansScreen } from './screens/Plans';
import { PlanScreen } from './screens/PlanEditor';
import { LoadingScreen, LoginScreen, SettingsScreen } from './screens/Settings';
import { HelpScreen } from './screens/Help';
import { needsLogin, useSync } from './data/sync';

function Screen() {
  const route = useRoute();
  const [compare, setCompare] = useState<string[]>([]);
  const [a, b, c] = route.parts;
  switch (a) {
    case 'portefeuille':
      if (b === 'repartitions') return <RepartitionsScreen />;
      if (b === 'assistant') return <AssistantScreen />;
      if (b === 'analyse') return <AnalysisScreen />;
      if (b === 'courtiers') return <BrokersScreen />;
      return <PortfolioScreen />;
    case 'marches':
      if (b === 'catalogue') return <CatalogueScreen compare={compare} setCompare={setCompare} />;
      if (b === 'comparer') return <CompareScreen compare={compare} setCompare={setCompare} />;
      if (b === 'etf' && c) return <EtfDetailScreen key={c} id={c} />;
      return <MyEtfsScreen />;
    case 'historique':
      if (b === 'journal') return <JournalScreen />;
      if (b === 'achat') return <PurchaseScreen key={route.key} />;
      if (b === 'virement') return <DepositScreen key={route.key} />;
      return <OverviewScreen />;
    case 'simulateur':
      if (b === 'plans') return <PlansScreen />;
      if (b === 'objectifs') return <GoalsScreen />;
      if (b === 'plan' && c) return <PlanScreen id={c} />;
      return <SimulatorScreen />;
    case 'parametres':
      if (b === 'etf') return <ManageEtfsScreen />;
      if (b === 'aide') return <HelpScreen key={route.key} />;
      return <SettingsScreen />;
    default:
      return <PortfolioScreen />;
  }
}

export function App() {
  const route = useRoute();
  useEtfColors();
  const sync = useSync();
  const [, force] = useState(0);
  const sheet = route.query.get('sheet');
  const fullScreen = /^\/historique\/(achat|virement)/.test(route.path);

  useEffect(() => {
    if (!['portefeuille', 'marches', 'historique', 'simulateur', 'parametres'].includes(route.parts[0])) navigate(HOME, { replace: true });
  }, [route.parts]);

  const booting = sync.configured && !sync.ready;
  useEffect(() => { if (!booting) hideSplash(); }, [booting]);
  if (booting) return <LoadingScreen />;
  if (needsLogin()) return <LoginScreen onSkip={() => force((x) => x + 1)} />;

  return (
    <>
      <div className="app-main">
        <Screen />
      </div>
      {!fullScreen && <TabBar />}
      {sheet === 'ajouter' && <AddSheet />}
      {sheet === 'cible' && <TargetSheet />}
      <ToastHost />
    </>
  );
}
