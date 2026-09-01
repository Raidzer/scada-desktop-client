import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installBrowserDevMock } from './devMock';
import './styles.css';

if (import.meta.env.DEV && !window.scada) installBrowserDevMock();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Renderer root element was not found.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
