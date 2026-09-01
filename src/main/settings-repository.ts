import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ClientSettings {
  serverAddress: string;
}

export interface SettingsRepository {
  load(): Promise<ClientSettings>;
  save(settings: ClientSettings): Promise<void>;
}

const DEFAULT_SETTINGS: ClientSettings = {
  serverAddress: '127.0.0.1:9090',
};

export class JsonSettingsRepository implements SettingsRepository {
  private readonly filePath: string;

  constructor(settingsDirectory: string) {
    this.filePath = path.join(settingsDirectory, 'settings.json');
  }

  async load(): Promise<ClientSettings> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      const value = JSON.parse(content) as Partial<ClientSettings>;
      return {
        serverAddress: typeof value.serverAddress === 'string'
          ? value.serverAddress
          : DEFAULT_SETTINGS.serverAddress,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async save(settings: ClientSettings): Promise<void> {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.filePath);
  }
}
