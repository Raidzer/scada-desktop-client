import type { ScadaDesktopApi } from '../shared/contracts';

declare global {
  interface Window {
    scada: ScadaDesktopApi;
  }
}

export {};
