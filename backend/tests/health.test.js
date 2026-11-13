jest.mock('../src/services/ai.service', () => ({
  analyzeDoubt: jest.fn(),
  generateLearningPlan: jest.fn(),
  checkHealth: jest.fn(),
}));

const request = require('supertest');
const {
  connectTestDb,
  disconnectTestDb,
} = require('./testDb');
const app = require('../src/app');
const aiService = require('../src/services/ai.service');

beforeAll(connectTestDb);
beforeEach(() => {
  aiService.checkHealth.mockResolvedValue('mock');
});
afterAll(disconnectTestDb);

describe('health route', () => {
  test('reports database and AI health in the standard success format', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'API is running',
      data: { status: 'ok', db: 'up', aiService: 'mock' },
    });
  });

  test('reports AI outages without failing the health endpoint', async () => {
    aiService.checkHealth.mockResolvedValue('down');

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      status: 'degraded',
      db: 'up',
      aiService: 'down',
    });
  });
});
