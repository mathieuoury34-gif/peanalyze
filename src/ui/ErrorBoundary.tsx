// Filet de sécurité : si un écran plante au rendu, React retirait tout l'arbre (écran noir, plus rien ne répond).
// Ici l'erreur reste confinée à l'écran fautif : message clair, boutons pour réessayer ou recharger, barre d'onglets toujours active.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Empty, showToast } from './kit';
import { t } from '../i18n';

interface Props { children: ReactNode; /** change à chaque navigation : l'écran repart sur une base saine */ resetKey?: string; /** feuille modale : on ferme simplement et on prévient par un message */ quiet?: boolean }
interface State { failed: boolean; key?: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }

  static getDerivedStateFromProps(p: Props, s: State): Partial<State> | null {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[PEAnalyze] erreur d’affichage', error, info.componentStack);
    if (this.props.quiet) showToast(t('Un problème est survenu : l’action a été annulée.'), { error: true });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.quiet) return null;
    return (
      <main className="content">
        <Empty
          icon="info"
          title={t('Un problème est survenu')}
          text={t('Cet écran n’a pas pu s’afficher. Vos données ne sont pas perdues : réessayez, ou rechargez l’application.')}
          action={(
            <div className="stack-8" style={{ width: '100%', maxWidth: 320 }}>
              <button type="button" className="btn btn-primary block" onClick={() => this.setState({ failed: false })}>{t('Réessayer')}</button>
              <button type="button" className="btn btn-secondary block" onClick={() => location.reload()}>{t('Recharger l’application')}</button>
            </div>
          )}
        />
      </main>
    );
  }
}
