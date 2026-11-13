jest.mock('../src/services/ai.service', () => ({
  analyzeDoubt: jest.fn(),
  generateLearningPlan: jest.fn(),
}));

const request = require('supertest');
const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require('./testDb');
const { createUser, tokenFor, createClassroom } = require('./helpers');
const ConceptGap = require('../src/models/ConceptGap');
const aiService = require('../src/services/ai.service');
const gapService = require('../src/services/gap.service');
const app = require('../src/app');

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

const addGap = (classroom, student, values) => ConceptGap.create({
  classroom: classroom._id,
  student: student._id,
  subject: classroom.subject,
  conceptKey: values.concept.toLowerCase(),
  prerequisiteOf: 'Optics',
  ...values,
});

describe('learning plan', () => {
  beforeEach(() => {
    aiService.generateLearningPlan.mockReset().mockResolvedValue({
      ranked: [],
      plan: [{
        concept: 'Refraction',
        tip: 'Review how light changes direction.',
        practice_question: 'What happens when light enters water?',
      }],
    });
  });

  test('ranks gaps deterministically using severity, occurrences, and recency', () => {
    const now = new Date('2025-02-15T00:00:00.000Z');
    const ranked = gapService.rankLearningGaps([
      {
        concept: 'Old high gap',
        severity: 'high',
        occurrences: 2,
        updatedAt: new Date('2025-01-18T00:00:00.000Z'),
      },
      {
        concept: 'Recent medium gap',
        severity: 'medium',
        occurrences: 3,
        updatedAt: now,
      },
      {
        concept: 'Two-week low gap',
        severity: 'low',
        occurrences: 10,
        updatedAt: new Date('2025-02-01T00:00:00.000Z'),
      },
    ], now, 2);

    expect(ranked).toEqual([
      expect.objectContaining({ concept: 'Recent medium gap', priority: 6 }),
      expect.objectContaining({
        concept: 'Two-week low gap',
        daysSinceLastSeen: 14,
        priority: 5,
      }),
    ]);
  });

  test('returns a ranked plan and sends only gap data to the AI service', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser();
    const classroom = await createClassroom(teacher, [student]);
    await addGap(classroom, student, {
      concept: 'Refraction',
      severity: 'high',
      occurrences: 3,
    });

    const response = await request(app)
      .get(`/api/students/${student._id}/learning-plan?limit=1`)
      .set('Authorization', `Bearer ${tokenFor(student)}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      ranked: [expect.objectContaining({
        concept: 'Refraction',
        severity: 'high',
        occurrences: 3,
      })],
      plan: [expect.objectContaining({ concept: 'Refraction' })],
      aiAvailable: true,
    });
    expect(aiService.generateLearningPlan).toHaveBeenCalledWith({
      gaps: [expect.objectContaining({
        concept: 'Refraction',
        severity: 'high',
        occurrences: 3,
        days_since_last_seen: expect.any(Number),
      })],
      limit: 1,
    });
    expect(JSON.stringify(aiService.generateLearningPlan.mock.calls[0][0]))
      .not.toMatch(/name|email|student|user/i);
  });

  test('falls back to ranked gaps in mock mode or when AI errors', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser();
    const classroom = await createClassroom(teacher, [student]);
    await addGap(classroom, student, {
      concept: 'Reflection',
      severity: 'medium',
      occurrences: 2,
    });
    aiService.generateLearningPlan.mockResolvedValue(null);

    const mockResponse = await request(app)
      .get(`/api/students/${student._id}/learning-plan`)
      .set('Authorization', `Bearer ${tokenFor(student)}`);

    expect(mockResponse.status).toBe(200);
    expect(mockResponse.body.data).toMatchObject({
      ranked: [expect.objectContaining({ concept: 'Reflection' })],
      plan: [],
      aiAvailable: false,
    });

    aiService.generateLearningPlan.mockRejectedValue(new Error('AI unavailable'));
    const errorResponse = await request(app)
      .get(`/api/students/${student._id}/learning-plan`)
      .set('Authorization', `Bearer ${tokenFor(student)}`);

    expect(errorResponse.status).toBe(200);
    expect(errorResponse.body.data).toMatchObject({
      ranked: [expect.objectContaining({ concept: 'Reflection' })],
      plan: [],
      aiAvailable: false,
    });
  });

  test('allows the classroom teacher but blocks unrelated users and invalid limits', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser();
    const otherStudent = await createUser();
    const outsider = await createUser({ role: 'teacher' });
    const classroom = await createClassroom(teacher, [student]);
    await addGap(classroom, student, {
      concept: 'Refraction',
      severity: 'low',
      occurrences: 1,
    });

    const teacherResponse = await request(app)
      .get(`/api/students/${student._id}/learning-plan`)
      .set('Authorization', `Bearer ${tokenFor(teacher)}`);
    const outsiderResponse = await request(app)
      .get(`/api/students/${student._id}/learning-plan`)
      .set('Authorization', `Bearer ${tokenFor(outsider)}`);
    const otherStudentResponse = await request(app)
      .get(`/api/students/${student._id}/learning-plan`)
      .set('Authorization', `Bearer ${tokenFor(otherStudent)}`);
    const invalidLimitResponse = await request(app)
      .get(`/api/students/${student._id}/learning-plan?limit=11`)
      .set('Authorization', `Bearer ${tokenFor(student)}`);

    expect(teacherResponse.status).toBe(200);
    expect(outsiderResponse.status).toBe(403);
    expect(otherStudentResponse.status).toBe(403);
    expect(invalidLimitResponse.status).toBe(400);
  });
});
