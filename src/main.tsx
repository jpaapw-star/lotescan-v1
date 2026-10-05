import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Proteção global contra ruído de WebSocket do Vite em sandbox iframe (MANDATO V4 - SEÇÃO 47)
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = String(reason?.message || reason || "");
    if (
      msg.includes("WebSocket") ||
      msg.includes("websocket") ||
      msg.includes("failed to connect to websocket") ||
      msg.includes("HMR")
    ) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
