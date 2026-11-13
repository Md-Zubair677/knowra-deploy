const request = require('supertest');
const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require('./testDb');
const { createUser, tokenFor } = require('./helpers');
const app = require('../src/app');

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('request hardening', () => {
  test('strips Mongo operator and dotted keys from request bodies and queries', async () => {
    const registration = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Sanitized User',
        email: 'sanitized@example.com',
        password: 'securePass123',
        $where: 'this.role === "teacher"',
      });

    expect(registration.status).toBe(201);
    expect(registration.body.data.role).toBe('student');

    const student = await createUser();
    const query = await request(app)
      .get('/api/doubts?%24where=true&filter.status=answered')
      .set('Authorization', `Bearer ${tokenFor(student)}`);

    expect(query.status).toBe(200);
    expect(query.body.data.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 0,
    });
  });

  test('enforces the one-megabyte JSON request limit with a 413 response', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        name: 'Large Payload',
        email: 'large@example.com',
        password: 'securePass123',
        extra: 'x'.repeat(1024 * 1024),
      }));

    expect(response.status).toBe(413);
    expect(response.body.success).toBe(false);
  });

  test('restricts CORS and sends Helmet security headers', async () => {
    const local = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');
    const deployed = await request(app)
      .get('/api/health')
      .set('Origin', 'https://ai-powered-personalized-doubt-solvi-puce.vercel.app');
    const blocked = await request(app)
      .get('/api/health')
      .set('Origin', 'https://untrusted.example');

    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(deployed.headers['access-control-allow-origin'])
      .toBe('https://ai-powered-personalized-doubt-solvi-puce.vercel.app');
    expect(blocked.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
    expect(local.headers['x-content-type-options']).toBe('nosniff');
  });
});
