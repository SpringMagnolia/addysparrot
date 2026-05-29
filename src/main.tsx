import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);

// OTA heartbeat: tell the Electron host the renderer mounted successfully.
// If the host just promoted a new OTA renderer (this one) to active, it has
// a 5 s watchdog that triggers rollback when this signal doesn't arrive.
// Fired after the first paint so it reflects "DOM is rendering" not just
// "JS is evaluating".
if (typeof window !== 'undefined') {
  requestAnimationFrame(() => {
    window.electronShadowing?.notifyOtaHeartbeat?.();
  });
}
