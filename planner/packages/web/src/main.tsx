// AI-assisted: written with Claude (Anthropic). See docs/AI-USE.md.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('#root is missing from index.html');
}
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
