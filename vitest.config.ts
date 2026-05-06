import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/*.module.ts',
        '**/*.dto.ts',
        '**/*.interface.ts',
        '**/constants/**',
        '**/main.ts',
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
        'dist/**',
        'prisma/**',
        'test/**',
      ],
      thresholds: {
        lines: 55,
        functions: 55,
        branches: 35,
        statements: 55,
      },
    },
  },
  plugins: [
    tsconfigPaths(),
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
