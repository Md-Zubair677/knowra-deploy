const bcrypt = require('bcryptjs');
const request = require('supertest');
const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require('./testDb');
const User = require('../src/models/User');
const app = require('../src/app');

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('authentication routes', () => {
  const credentials = {
    name: 'Test Student',
    email: 'student@example.com',
    password: 'securePass123',
  };

  test('registers a user with a hashed password and no password in the response', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(credentials);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data._id).toBeDefined();
    expect(response.body.data).not.toHaveProperty('id');
    expect(response.body.data.email).toBe(credentials.email);
    expect(response.body.data).not.toHaveProperty('password');

    const storedUser = await User.findOne({ email: credentials.email }).select('+password');
    expect(storedUser.password).not.toBe(credentials.password);
    await expect(bcrypt.compare(credentials.password, storedUser.password)).resolves.toBe(true);
  });

  test('allows registering a teacher account when role is teacher', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        ...credentials,
        email: 'teacher@example.com',
        role: 'teacher',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.role).toBe('teacher');
  });

  test('returns 409 when registering an existing email', async () => {
    await request(app).post('/api/auth/register').send(credentials);

    const response = await request(app)
      .post('/api/auth/register')
      .send(credentials);

    expect(response.status).toBe(409);
    expect(response.body.message).toMatch(/already registered/i);
  });

  test('logs in with a token and password-free user', async () => {
    await request(app).post('/api/auth/register').send(credentials);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: credentials.password });

    expect(response.status).toBe(200);
    expect(response.body.data.token).toEqual(expect.any(String));
    expect(response.body.data.user._id).toBeDefined();
    expect(response.body.data.user).not.toHaveProperty('id');
    expect(response.body.data.user.email).toBe(credentials.email);
    expect(response.body.data.user).not.toHaveProperty('password');
  });

  test('rejects an incorrect password', async () => {
    await request(app).post('/api/auth/register').send(credentials);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: credentials.email, password: 'incorrectPass123' });

    expect(response.status).toBe(401);
  });

  test('returns 401 when current user is requested without a token', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
  });
});
