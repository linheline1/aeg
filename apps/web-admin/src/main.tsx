import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const basename = import.meta.env.BASE_URL.replace(/\/+$/, '');
const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

function AndroidBackHandler() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void CapacitorApp.exitApp();
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, []);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router basename={basename}>
      <AndroidBackHandler />
      <App />
    </Router>
  </React.StrictMode>
);
