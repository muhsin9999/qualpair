import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './design/app.css';
import { practiceMode } from './ai/registry';
import { startRemoteConfig } from './firebase/config';

// Read ?practice once at start so the choice survives navigation.
practiceMode();

// Cloud model name and starting values for new studies come from Firebase Remote Config (fetched after the first paint).
if (!practiceMode()) setTimeout(() => void startRemoteConfig(), 1500);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
