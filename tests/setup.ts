// Author: yunnuo <ymz@ebox.vip>
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
Object.defineProperty(window, 'matchMedia', { writable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });


// Vitest aliases window to the worker global. Use the real jsdom storage when Node exposes Web Storage too.
const browserWindow = (globalThis as typeof globalThis & { jsdom: { window: Window } }).jsdom.window;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: browserWindow.localStorage });
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: browserWindow.sessionStorage });
