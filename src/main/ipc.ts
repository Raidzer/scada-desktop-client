import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { SendCommandInput } from '../shared/contracts';
import { IPC_CHANNELS } from '../shared/contracts';
import type { ScadaGateway } from './scada/scada-gateway';

export function registerIpcHandlers(
  gateway: ScadaGateway,
  getMainWindow: () => BrowserWindow | null,
): () => void {
  const assertTrustedSender = (event: IpcMainInvokeEvent): void => {
    const window = getMainWindow();
    if (!window || event.sender !== window.webContents) {
      throw new Error('IPC-вызов отклонён: неизвестный renderer.');
    }
  };

  ipcMain.handle(IPC_CHANNELS.getBootstrap, (event) => {
    assertTrustedSender(event);
    return gateway.getBootstrap();
  });
  ipcMain.handle(IPC_CHANNELS.connect, (event, address: unknown) => {
    assertTrustedSender(event);
    if (typeof address !== 'string') throw new Error('Адрес сервера должен быть строкой.');
    return gateway.connect(address);
  });
  ipcMain.handle(IPC_CHANNELS.disconnect, (event) => {
    assertTrustedSender(event);
    return gateway.disconnect();
  });
  ipcMain.handle(IPC_CHANNELS.sendCommand, (event, command: unknown) => {
    assertTrustedSender(event);
    if (!isCommandInput(command)) throw new Error('Получена команда неверного формата.');
    return gateway.sendCommand(command);
  });

  const unsubscribeConnection = gateway.onConnectionChanged((snapshot) => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.connectionChanged, snapshot);
    }
  });
  const unsubscribeTelemetry = gateway.onTelemetryReceived((batch) => {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.telemetryReceived, batch);
    }
  });

  return () => {
    unsubscribeConnection();
    unsubscribeTelemetry();
    for (const channel of [
      IPC_CHANNELS.getBootstrap,
      IPC_CHANNELS.connect,
      IPC_CHANNELS.disconnect,
      IPC_CHANNELS.sendCommand,
    ]) {
      ipcMain.removeHandler(channel);
    }
  };
}

function isCommandInput(value: unknown): value is SendCommandInput {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.pointId === 'string'
    && (candidate.type === 'TI' || candidate.type === 'TS')
    && typeof candidate.value === 'number'
    && typeof candidate.flag === 'number';
}
