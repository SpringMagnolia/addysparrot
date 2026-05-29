import { useEffect, useState } from 'react';
import { BootstrapGate } from './components/BootstrapGate';
import { I18nProvider } from './lib/i18n/context';
import { readRoute, navigate, type Route } from './lib/router';
import { HomePage } from './pages/HomePage';
import { DetailPage } from './pages/DetailPage';
import { ReviewPage } from './pages/ReviewPage';
import { AllFavoritesPage } from './pages/AllFavoritesPage';
import { ReviewSessionPage } from './pages/ReviewSessionPage';
import { SettingsPage } from './pages/SettingsPage';
import { FirstRunLanguageDialog } from './pages/FirstRunLanguageDialog';
import './styles.css';

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) {
      navigate({ name: 'home' });
    }
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('detail-route', route.name === 'detail');
    window.scrollTo(0, 0);
    return () => document.body.classList.remove('detail-route');
  }, [route]);

  return (
    <BootstrapGate>
      <I18nProvider>
        <main className="app">
          <FirstRunLanguageDialog />
          {route.name === 'home' && <HomePage />}
          {route.name === 'detail' && <DetailPage id={route.id} />}
          {route.name === 'review' && <ReviewPage />}
          {route.name === 'reviewAll' && <AllFavoritesPage />}
          {route.name === 'reviewSession' && <ReviewSessionPage />}
          {route.name === 'settings' && <SettingsPage />}
        </main>
      </I18nProvider>
    </BootstrapGate>
  );
}
