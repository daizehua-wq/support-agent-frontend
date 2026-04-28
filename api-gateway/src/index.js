import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import defaultConfig from '../config/default.json' with { type: 'json' };
import channelManager from './lib/channelManager.js';
import immuneBoundary from './middleware/immuneBoundary.js';
import channelReloadRoutes from './routes/channelReload.js';
import channelWebhookRoutes from './routes/channelWebhook.js';
import publicApiRoutes from './routes/publicApi.js';

const app = express();
const port = Number(process.env.PORT || defaultConfig.port || 3000);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(immuneBoundary);
app.use('/internal/channels', channelReloadRoutes);
app.use('/channels', channelWebhookRoutes);

app.get('/health', (req, res) => {
  return res.json({
    success: true,
    service: 'api-gateway',
    status: 'ok',
    mockServerUrl:
      String(process.env.MOCK_SERVER_URL || '').trim() ||
      defaultConfig.mockServerUrl ||
      'http://localhost:3001',
    channelsLoaded: channelManager.getLoadedChannels().length,
    channelRuntime: channelManager.getChannelRuntimeSummary(),
  });
});

app.use('/api/v1', publicApiRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error('[api-gateway] unhandled error:', error?.message || error);

  return res.status(500).json({
    success: false,
    message: 'gateway request failed',
  });
});

app.listen(port, () => {
  console.log(`[api-gateway] listening on http://localhost:${port}`);
  console.log(
    `[api-gateway] mock server: ${
      String(process.env.MOCK_SERVER_URL || '').trim() ||
      defaultConfig.mockServerUrl ||
      'http://localhost:3001'
    }`,
  );

  channelManager.loadChannels().catch((error) => {
    console.warn('[api-gateway] initial channel load failed:', error?.message || error);
  });
});
