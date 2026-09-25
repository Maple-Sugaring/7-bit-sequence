import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Let the first page boot while Vite finishes walking the rest of the graph.
    holdUntilCrawlEnd: false,
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@emotion/react',
      '@emotion/styled',
      '@mui/material',
      '@mui/material/styles',
      '@mui/x-date-pickers/LocalizationProvider',
      '@mui/x-date-pickers/AdapterDayjs',
      '@mui/x-charts/Gauge',
      // MUI still `import PropTypes from 'prop-types'`. If these CJS helpers
      // are not pre-bundled, Vite serves the raw files and the client dies
      // with "does not provide an export named 'default'" — a white screen.
      'prop-types',
      'react-is',
      'hoist-non-react-statics',
      'dayjs',
    ],
  },
  server: {
    proxy: {
      // Matches nginx in Docker: the browser always talks to /api/*, and the
      // prefix is stripped before the request reaches Express, which mounts
      // routes at the root.
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        timeout: 4000,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
