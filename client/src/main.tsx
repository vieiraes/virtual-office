import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useStore } from './store';
import './index.css';

// acesso de debug no console: __vo.store.getState()
(window as unknown as Record<string, unknown>).__vo = { store: useStore };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
