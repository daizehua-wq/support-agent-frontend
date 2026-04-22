import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('/react-router/') ||
              id.includes('/react-router-dom/') ||
              id.includes('/scheduler/')
            ) {
              return 'react-vendor'
            }

            if (
              id.includes('/@ant-design/icons/')
            ) {
              return 'antd-icons-vendor'
            }

            if (
              id.includes('/@ant-design/cssinjs/') ||
              id.includes('/@ctrl/tinycolor/') ||
              id.includes('/antd/es/config-provider') ||
              id.includes('/antd/es/theme') ||
              id.includes('/antd/es/style') ||
              id.includes('/antd/es/locale') ||
              id.includes('/rc-util/') ||
              id.includes('/compute-scroll-into-view/')
            ) {
              return 'antd-core-vendor'
            }

            if (
              id.includes('/antd/es/button') ||
              id.includes('/antd/es/grid') ||
              id.includes('/antd/es/layout') ||
              id.includes('/antd/es/menu') ||
              id.includes('/antd/es/space') ||
              id.includes('/rc-menu/') ||
              id.includes('/rc-overflow/') ||
              id.includes('/rc-resize-observer/')
            ) {
              return 'antd-layout-vendor'
            }

            if (
              id.includes('/antd/es/card') ||
              id.includes('/antd/es/list') ||
              id.includes('/antd/es/tag') ||
              id.includes('/antd/es/empty') ||
              id.includes('/antd/es/descriptions') ||
              id.includes('/rc-virtual-list/')
            ) {
              return 'antd-display-vendor'
            }

            if (
              id.includes('/antd/es/form') ||
              id.includes('/antd/es/input') ||
              id.includes('/antd/es/input-number') ||
              id.includes('/antd/es/select') ||
              id.includes('/antd/es/switch') ||
              id.includes('/antd/es/checkbox') ||
              id.includes('/antd/es/radio') ||
              id.includes('/antd/es/date-picker') ||
              id.includes('/antd/es/time-picker') ||
              id.includes('/rc-field-form/') ||
              id.includes('/rc-select/') ||
              id.includes('/rc-input/')
            ) {
              return 'antd-form-vendor'
            }

            if (
              id.includes('/antd/es/modal') ||
              id.includes('/antd/es/message') ||
              id.includes('/antd/es/notification') ||
              id.includes('/antd/es/popconfirm') ||
              id.includes('/antd/es/alert') ||
              id.includes('/antd/es/spin') ||
              id.includes('/antd/es/empty') ||
              id.includes('/antd/es/progress') ||
              id.includes('/rc-dialog/') ||
              id.includes('/rc-motion/') ||
              id.includes('/rc-notification/')
            ) {
              return 'antd-feedback-vendor'
            }

            if (
              id.includes('/antd/') ||
              id.includes('/@ant-design/') ||
              id.includes('/@rc-component/') ||
              id.includes('/rc-')
            ) {
              return 'antd-base-vendor'
            }

            if (id.includes('/axios/')) {
              return 'network-vendor'
            }

            return 'vendor'
          }

          if (id.includes('/src/pages/Settings/')) {
            return 'settings-page'
          }

          if (id.includes('/src/pages/ModelCenter/')) {
            return 'model-center-page'
          }

          if (id.includes('/src/pages/DatabaseManager/')) {
            return 'database-manager-page'
          }

          if (id.includes('/src/pages/AssistantCenter/')) {
            return 'assistant-center-page'
          }

          if (id.includes('/src/pages/Search/')) {
            return 'search-page'
          }

          if (id.includes('/src/pages/Script/')) {
            return 'script-page'
          }

          if (id.includes('/src/pages/Sessopns/')) {
            return 'session-page'
          }

          if (
            id.includes('/src/components/governance/') ||
            id.includes('/src/api/assistantCenter') ||
            id.includes('/src/api/databaseManager') ||
            id.includes('/src/api/modelCenter') ||
            id.includes('/src/api/settings')
          ) {
            return 'governance-shared'
          }

          return undefined
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
})
