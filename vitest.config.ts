import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = resolve(__dirname, 'packages/shared/src');

export default defineConfig({
  resolve: {
    alias: [
      { find: '@futuremode/shared', replacement: `${SHARED_SRC}/index.ts` },
      { find: /^@futuremode\/shared\/constants$/, replacement: `${SHARED_SRC}/constants.ts` },
      { find: /^@futuremode\/shared\/types$/, replacement: `${SHARED_SRC}/types/index.ts` },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
