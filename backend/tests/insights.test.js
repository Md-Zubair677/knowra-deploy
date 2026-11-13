const request = require('supertest');
const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require('./testDb');
const { createUser, tokenFor, createClassroom } = require('./helpers');
const Doubt = require('../src/models/Doubt');
const ConceptGap = require('../src/models/ConceptGap');
const app = require('../src/app');

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('classroom insights', () => {
  test('aggregates doubt counts, joined students, class gaps, and attention scores', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const firstStudent = await createUser();
    const secondStudent = await createUser();
    const classroom = await createClassroom(teacher, [firstStudent, secondStudent]);

    await Doubt.create([
      {
        student: firstStudent._id,
        classroom: classroom._id,
        subject: classroom.subject,
        topic: 'Refraction',
        text: 'Question one',
        status: 'answered',
      },
      {
        student: secondStudent._id,
        classroom: classroom._id,
        subject: classroom.subject,
        topic: 'Reflection',
        text: 'Question two',
        status: 'failed',
      },
    ]);
    await ConceptGap.create([
      {
        classroom: classroom._id,
        student: firstStudent._id,
        subject: classroom.subject,
        concept: 'Light',
        conceptKey: 'light',
        severity: 'high',
        occurrences: 3,
      },
      {
        classroom: classroom._id,
        student: secondStudent._id,
        subject: classroom.subject,
        concept: 'Light',
        conceptKey: 'light',
        severity: 'medium',
        occurrences: 2,
      },
      {
        classroom: classroom._id,
        student: secondStudent._id,
        subject: classroom.subject,
        concept: 'Angles',
        conceptKey: 'angles',
        severity: 'low',
        occurrences: 1,
      },
    ]);

    const response = await request(app)
      .get(`/api/classrooms/${classroom._id}/insights`)
      .set('Authorization', `Bearer ${tokenFor(teacher)}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      totalDoubts: 2,
      doubtsByStatus: { pending: 0, answered: 1, failed: 1 },
      activeStudents: 2,
      topGaps: [
        { concept: 'Light', totalOccurrences: 5, studentCount: 2 },
        { concept: 'Angles', totalOccurrences: 1, studentCount: 1 },
      ],
    });
    expect(response.body.data.studentsNeedingAttention[0].name).toBe(firstStudent.name);
    expect(response.body.data.studentsNeedingAttention[0].score).toBeGreaterThan(0);
    expect(response.body.data.studentsNeedingAttention[0]).toEqual({
      name: firstStudent.name,
      score: expect.any(Number),
    });
  });

  test('rejects callers who do not teach the classroom', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const outsider = await createUser({ role: 'teacher' });
    const student = await createUser();
    const classroom = await createClassroom(teacher, [student]);

    const response = await request(app)
      .get(`/api/classrooms/${classroom._id}/insights`)
      .set('Authorization', `Bearer ${tokenFor(outsider)}`);
    const studentResponse = await request(app)
      .get(`/api/classrooms/${classroom._id}/insights`)
      .set('Authorization', `Bearer ${tokenFor(student)}`);

    expect(response.status).toBe(403);
    expect(studentResponse.status).toBe(403);
  });
});
