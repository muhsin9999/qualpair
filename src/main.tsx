import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './design/app.css';
import { practiceMode } from './ai/registry';

// Read ?practice once at start so the choice survives navigation.
practiceMode();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
