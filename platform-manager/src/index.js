import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import managementApi from './routes/managementApi.js';
import { startOptimizationLoop } from './agents/optimizationAgent.js';
import { startEvolutionScheduler } from './schedulers/evolutionScheduler.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3003);

app.use(cors());
app.use(express.json());
app.use('/management', managementApi);
app.use('/internal/management', managementApi);

app.get('/health', (req, res) => {
  return res.json({
    success: true,
    service: 'platform-manager',
    status: 'ok',
    mockServerUrl: process.env.MOCK_SERVER_URL || 'http://localhost:3001',
  });
});

app.listen(port, () => {
  console.log(`P5 Platform Manager running on port ${port}`);
  const optimizationLoop = startOptimizationLoop();
  console.log('[p5-optimization] loop:', optimizationLoop);
  const evolutionScheduler = startEvolutionScheduler();
  console.log('[p5-evolution] scheduler:', evolutionScheduler);
});
