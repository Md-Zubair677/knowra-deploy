const mongoose = require('mongoose');
const request = require('supertest');
const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require('./testDb');
const { createUser, createClassroom, tokenFor } = require('./helpers');
const Doubt = require('../src/models/Doubt');
const ConceptGap = require('../src/models/ConceptGap');
const gapService = require('../src/services/gap.service');
const app = require('../src/app');

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('gap service', () => {
  const makeDoubt = (student, classroom, topic) =>
    Doubt.create({
      student: student._id,
      classroom: classroom._id,
      subject: classroom.subject,
      topic,
      text: `Question about ${topic}`,
      status: 'pending',
    });

  test('merges case-insensitive concepts, increments occurrences, and aggregates students', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const firstStudent = await createUser();
    const secondStudent = await createUser();
    const classroom = await createClassroom(teacher, [firstStudent, secondStudent]);
    const firstDoubt = await makeDoubt(firstStudent, classroom, 'Trees');

    const firstGaps = await gapService.recordDoubtGaps(firstDoubt, [
      { concept: '  Binary Search  ', severity: 'high' },
      { concept: 'binary search', severity: 'low' },
      { concept: 'BINARY SEARCH', severity: 'medium' },
    ]);

    expect(firstGaps).toHaveLength(1);
    expect(firstGaps[0]).toMatchObject({
      concept: 'Binary Search',
      conceptKey: 'binary search',
      prerequisiteOf: 'Trees',
      severity: 'high',
      occurrences: 1,
    });
    expect(firstGaps[0].doubts.map(String)).toContain(firstDoubt._id.toString());

    const secondDoubt = await makeDoubt(secondStudent, classroom, 'Graph traversal');
    await gapService.recordDoubtGaps(secondDoubt, [
      { concept: ' binary SEARCH ', severity: 'medium' },
    ]);
    const thirdDoubt = await makeDoubt(secondStudent, classroom, 'Sorting');
    await gapService.recordDoubtGaps(thirdDoubt, [
      { concept: 'BINARY search', severity: 'low' },
    ]);

    expect(await ConceptGap.countDocuments({ conceptKey: 'binary search' })).toBe(2);
    const report = await gapService.getClassroomGaps(
      teacher._id.toString(),
      classroom._id.toString()
    );
    expect(report).toEqual([
      expect.objectContaining({
        concept: 'Binary Search',
        totalOccurrences: 3,
        studentCount: 2,
        severity: 'high',
      }),
    ]);
  });

  test('collapses concept whitespace for matching and caps stored names at 80 characters', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser();
    const classroom = await createClassroom(teacher, [student]);
    const firstDoubt = await makeDoubt(student, classroom, 'Optics');
    const secondDoubt = await makeDoubt(student, classroom, 'Optics');
    const longConcept = 'Refraction '.repeat(12);

    await gapService.recordDoubtGaps(firstDoubt, [
      { concept: 'Refractive index', severity: 'low' },
      { concept: longConcept, severity: 'medium' },
    ]);
    await gapService.recordDoubtGaps(secondDoubt, [
      { concept: '  refractive   index ', severity: 'high' },
    ]);

    const gaps = await ConceptGap.find({ student: student._id }).sort({ conceptKey: 1 });
    expect(gaps).toHaveLength(2);
    expect(gaps.find((gap) => gap.conceptKey === 'refractive index')).toMatchObject({
      concept: 'Refractive index',
      occurrences: 2,
      severity: 'high',
    });
    const cappedGap = gaps.find((gap) => gap.conceptKey.startsWith('refraction'));
    expect(cappedGap.concept).toHaveLength(80);
    expect(cappedGap.conceptKey).toHaveLength(80);
  });

  test('allows authorized gap reports and rejects unrelated users', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser();
    const outsiderTeacher = await createUser({ role: 'teacher' });
    const outsiderStudent = await createUser();
    const classroom = await createClassroom(teacher, [student]);
    const doubt = await makeDoubt(student, classroom, 'Fractions');
    await gapService.recordDoubtGaps(doubt, [
      { concept: 'Multiplication', severity: 'low' },
    ]);

    await expect(
      gapService.getClassroomGaps(
        outsiderTeacher._id.toString(),
        classroom._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      gapService.getStudentGaps(
        outsiderTeacher._id.toString(),
        'teacher',
        student._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      gapService.getStudentGaps(
        outsiderStudent._id.toString(),
        'student',
        student._id.toString()
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    const teacherReport = await gapService.getStudentGaps(
      teacher._id.toString(),
      'teacher',
      student._id.toString()
    );
    const studentReport = await gapService.getStudentGaps(
      student._id.toString(),
      'student',
      student._id.toString()
    );

    expect(teacherReport).toHaveLength(1);
    expect(studentReport).toEqual(teacherReport);
  });

  test('rejects malformed student IDs without querying MongoDB', async () => {
    await expect(
      gapService.getStudentGaps(
        new mongoose.Types.ObjectId().toString(),
        'student',
        'not-an-object-id'
      )
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('validates ObjectId path parameters on gap routes', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const authorization = `Bearer ${tokenFor(teacher)}`;

    const classroomResponse = await request(app)
      .get('/api/classrooms/not-an-object-id/gaps')
      .set('Authorization', authorization);
    const studentResponse = await request(app)
      .get('/api/students/not-an-object-id/gaps')
      .set('Authorization', authorization);

    expect(classroomResponse.status).toBe(400);
    expect(studentResponse.status).toBe(400);
  });
});
