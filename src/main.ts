import { App } from './ui/app';
import './style.css';

const app = new App();
app.init().catch((err) => {
  console.error('App initialization failed:', err);
  const el = document.getElementById('app');
  if (el) {
    el.innerHTML = '<div class="error">Fehler beim Laden. Bitte Seite neu laden.</div>';
  }
});
