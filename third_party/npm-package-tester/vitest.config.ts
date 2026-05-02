import { createKitiumVitestConfig } from '@kitiumai/vitest-helpers/config';
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig(
  createKitiumVitestConfig({
    preset: 'library',
    environment: 'node',
    overrides: {
      test: {
        include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
        coverage: {
          exclude: ['src/cli/index.ts'],
        },
      },
      resolve: {
        alias: {
          application: path.resolve(__dirname, 'src/application'),
          formatters: path.resolve(__dirname, 'src/formatters'),
          domain: path.resolve(__dirname, 'src/domain'),
          '@babel/types': path.resolve(__dirname, 'tests/fixtures/babel-types-stub.ts'),
        },
      },
    },
  }),
);
