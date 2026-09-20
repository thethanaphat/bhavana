import { App } from './app/App';
import { registerPWA } from './pwa/register';
import './styles/main.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('App root not found');

void new App(root).start();
registerPWA();
