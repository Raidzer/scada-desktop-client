import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
];

export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'electron',
        'electron-squirrel-startup',
        '@grpc/grpc-js',
        '@grpc/proto-loader',
        ...nodeBuiltins,
      ],
    },
  },
});
