import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/_variables.scss';
import './styles/_keyframe-animations.scss';
import './style.css';

createRoot(document.getElementById('root')!).render(<App />);
