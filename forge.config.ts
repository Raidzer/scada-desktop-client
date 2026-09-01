import fs from 'node:fs';
import path from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

interface PackageLockEntry {
  dev?: boolean;
}

interface PackageLock {
  packages?: Record<string, PackageLockEntry>;
}

const packageLock = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'package-lock.json'), 'utf8'),
) as PackageLock;
const productionPackageRoots = Object.entries(packageLock.packages ?? {})
  .filter(([location, entry]) => location.startsWith('node_modules/') && entry.dev !== true)
  .map(([location]) => `/${location.replaceAll('\\', '/')}`);

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: [path.resolve(__dirname, 'proto')],
    // The Vite plugin otherwise keeps only .vite/**. Include the exact production
    // dependency graph so externalized grpc-js/proto-loader resolve after install.
    ignore: (filePath) => {
      const forwardPath = filePath.replaceAll('\\', '/');
      const normalized = forwardPath === '' || forwardPath.startsWith('/')
        ? forwardPath
        : `/${forwardPath}`;
      const isProductionModule = normalized === '/node_modules'
        || productionPackageRoots.some((root) => (
          normalized === root
          || normalized.startsWith(`${root}/`)
          || root.startsWith(`${normalized}/`)
        ));
      return !(
        normalized === ''
        || normalized === '/package.json'
        || normalized === '/.vite'
        || normalized.startsWith('/.vite/')
        || isProductionModule
      );
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: 'ScadaDesktop',
      setupExe: 'SCADA-Desktop-Setup.exe',
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
