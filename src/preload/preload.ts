import { contextBridge, ipcRenderer } from 'electron';
import type {
  BootstrapSnapshot,
  CommandResult,
  ConnectionSnapshot,
  ScadaDesktopApi,
  SendCommandInput,
  TelemetryBatch,
} from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';

const api: ScadaDesktopApi = {
  getBootstrap: () => ipcRenderer.invoke(IPC_CHANNELS.getBootstrap) as Promise<BootstrapSnapshot>,
  connect: (address: string) => (
    ipcRenderer.invoke(IPC_CHANNELS.connect, address) as Promise<ConnectionSnapshot>
  ),
  disconnect: () => (
    ipcRenderer.invoke(IPC_CHANNELS.disconnect) as Promise<ConnectionSnapshot>
  ),
  sendCommand: (command: SendCommandInput) => (
    ipcRenderer.invoke(IPC_CHANNELS.sendCommand, command) as Promise<CommandResult>
  ),
  onConnectionChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: ConnectionSnapshot) => listener(snapshot);
    ipcRenderer.on(IPC_CHANNELS.connectionChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.connectionChanged, handler);
  },
  onTelemetryReceived: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, batch: TelemetryBatch) => listener(batch);
    ipcRenderer.on(IPC_CHANNELS.telemetryReceived, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.telemetryReceived, handler);
  },
};

contextBridge.exposeInMainWorld('scada', Object.freeze(api));
