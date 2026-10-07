import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      // Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
      include: ['test/**/*.test.{js,jsx}'],
    },
  }),
);
