const request = require('supertest');
const {
  connectTestDb,
  clearTestDb,
  disconnectTestDb,
} = require('./testDb');
const { createUser, tokenFor } = require('./helpers');
const Classroom = require('../src/models/Classroom');
const Doubt = require('../src/models/Doubt');
const app = require('../src/app');

beforeAll(connectTestDb);
afterEach(clearTestDb);
afterAll(disconnectTestDb);

describe('classroom routes', () => {
  test('allows teachers to create classrooms with a unique six-character code', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const response = await request(app)
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${tokenFor(teacher)}`)
      .send({ name: 'Biology 101', subject: 'Biology' });

    expect(response.status).toBe(201);
    expect(response.body.data.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(response.body.data.teacher).toBe(teacher._id.toString());
  });

  test('does not allow students to create classrooms', async () => {
    const student = await createUser();
    const response = await request(app)
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${tokenFor(student)}`)
      .send({ name: 'Biology 101', subject: 'Biology' });

    expect(response.status).toBe(403);
  });

  test('allows a student to join a classroom by code and rejects duplicate joins', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser();
    const classroom = await request(app)
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${tokenFor(teacher)}`)
      .send({ name: 'Biology 101', subject: 'Biology' });

    expect(classroom.status).toBe(201);

    const join = () =>
      request(app)
        .post('/api/classrooms/join')
        .set('Authorization', `Bearer ${tokenFor(student)}`)
        .send({ joinCode: classroom.body.data.joinCode.toLowerCase() });

    const joined = await join();
    expect(joined.status).toBe(200);
    expect(joined.body.data.students).toContain(student._id.toString());

    const duplicate = await join();
    expect(duplicate.status).toBe(409);
  });

  test('lists classroom students with their doubt counts for the owning teacher only', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const outsider = await createUser({ role: 'teacher' });
    const firstStudent = await createUser();
    const secondStudent = await createUser();
    const classroomResponse = await request(app)
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${tokenFor(teacher)}`)
      .send({ name: 'Biology 101', subject: 'Biology' });
    const classroomId = classroomResponse.body.data._id;

    await request(app)
      .post('/api/classrooms/join')
      .set('Authorization', `Bearer ${tokenFor(firstStudent)}`)
      .send({ joinCode: classroomResponse.body.data.joinCode });
    await request(app)
      .post('/api/classrooms/join')
      .set('Authorization', `Bearer ${tokenFor(secondStudent)}`)
      .send({ joinCode: classroomResponse.body.data.joinCode });
    await Doubt.create({
      student: firstStudent._id,
      classroom: classroomId,
      subject: 'Biology',
      topic: 'Cells',
      text: 'Question about a cell',
      status: 'pending',
    });

    const response = await request(app)
      .get(`/api/classrooms/${classroomId}/students`)
      .set('Authorization', `Bearer ${tokenFor(teacher)}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        _id: firstStudent._id.toString(),
        name: firstStudent.name,
        email: firstStudent.email,
        doubtCount: 1,
      }),
      expect.objectContaining({
        _id: secondStudent._id.toString(),
        doubtCount: 0,
      }),
    ]));
    expect(JSON.stringify(response.body.data)).not.toContain('password');

    const forbidden = await request(app)
      .get(`/api/classrooms/${classroomId}/students`)
      .set('Authorization', `Bearer ${tokenFor(outsider)}`);
    expect(forbidden.status).toBe(403);
    const studentForbidden = await request(app)
      .get(`/api/classrooms/${classroomId}/students`)
      .set('Authorization', `Bearer ${tokenFor(firstStudent)}`);
    expect(studentForbidden.status).toBe(403);
  });

  test('allows a student to leave while retaining their past doubts', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const student = await createUser();
    const classroom = await request(app)
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${tokenFor(teacher)}`)
      .send({ name: 'Biology 101', subject: 'Biology' });
    await request(app)
      .post('/api/classrooms/join')
      .set('Authorization', `Bearer ${tokenFor(student)}`)
      .send({ joinCode: classroom.body.data.joinCode });
    const doubt = await Doubt.create({
      student: student._id,
      classroom: classroom.body.data._id,
      subject: 'Biology',
      topic: 'Cells',
      text: 'Question about a cell',
      status: 'pending',
    });

    const response = await request(app)
      .delete(`/api/classrooms/${classroom.body.data._id}/leave`)
      .set('Authorization', `Bearer ${tokenFor(student)}`);

    expect(response.status).toBe(200);
    expect(response.body.data.students).not.toContain(student._id.toString());
    expect(await Doubt.findById(doubt._id)).not.toBeNull();
    const oldDoubt = await request(app)
      .get(`/api/doubts/${doubt._id}`)
      .set('Authorization', `Bearer ${tokenFor(student)}`);
    expect(oldDoubt.status).toBe(200);
  });

  test('regenerates a unique join code only for the classroom owner', async () => {
    const teacher = await createUser({ role: 'teacher' });
    const outsider = await createUser({ role: 'teacher' });
    const classroom = await request(app)
      .post('/api/classrooms')
      .set('Authorization', `Bearer ${tokenFor(teacher)}`)
      .send({ name: 'Biology 101', subject: 'Biology' });
    const oldCode = classroom.body.data.joinCode;

    const response = await request(app)
      .post(`/api/classrooms/${classroom.body.data._id}/regenerate-code`)
      .set('Authorization', `Bearer ${tokenFor(teacher)}`);

    expect(response.status).toBe(200);
    expect(response.body.data.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(response.body.data.joinCode).not.toBe(oldCode);
    expect(await Classroom.countDocuments({
      joinCode: response.body.data.joinCode,
    })).toBe(1);

    const forbidden = await request(app)
      .post(`/api/classrooms/${classroom.body.data._id}/regenerate-code`)
      .set('Authorization', `Bearer ${tokenFor(outsider)}`);
    expect(forbidden.status).toBe(403);
  });
});
