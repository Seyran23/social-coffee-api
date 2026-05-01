import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['node_modules', 'dist'],
    fileParallelism: false,
    // Load test environment variables
    env: Object.fromEntries(
      Object.entries(
        require('dotenv').config({ path: '.env.test' }).parsed ?? {},
      ),
    ),
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [
    tsconfigPaths(),
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
