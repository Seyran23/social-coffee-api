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
        '**/*.type.ts',
        '**/constants/**',
        '**/types/**',
        '**/main.ts',
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
        'dist/**',
        'prisma/**',
        'test/**',
        // Infrastructure — no business logic, better covered by e2e
        'src/database/**',
        'src/common/guards/**',
        'src/common/logger/**',
        'src/common/middleware/**',
        // External-service wrappers — need integration tests, not unit tests
        'src/modules/file-upload/services/cloudinary.service.ts',
        'src/modules/file-upload/services/file-upload.service.ts',
        'src/modules/file-upload/validators/**',
        'src/modules/file-upload/interceptors/**',
        // Dead / rarely-hit utility code
        'src/modules/venue/utils/qr-code.util.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 75,
        branches: 70,
        statements: 80,
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
