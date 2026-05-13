import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/infra/**', 'src/domain/**'],
      exclude: [
        'src/**/*.test.ts',
        'src/tests/**',
        'src/core/logger.ts',
        'src/core/container.ts',
        // These wrap native modules that can't be mocked via vi.mock (createRequire / N-API)
        'src/infra/gpio/pigpioClientImpl.ts',
        'src/infra/snmp/snmpGetterImpl.ts',
        'src/infra/ssh/sshExecutorImpl.ts',
        'src/infra/roon/roonClientImpl.ts',
        'src/infra/net/pingProbe.ts',
      ],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
