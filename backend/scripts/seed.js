const mongoose = require('mongoose');
const { mongoUri, nodeEnv } = require('../src/config/env');
const Classroom = require('../src/models/Classroom');
const ConceptGap = require('../src/models/ConceptGap');
const Doubt = require('../src/models/Doubt');
const User = require('../src/models/User');
const classroomService = require('../src/services/classroom.service');
const gapService = require('../src/services/gap.service');

const DEMO_PASSWORD = 'KnowraDemo2026!';
const CLASSROOM_NAME = 'KNOWRA Demo Classroom';
const demoUsers = [
  { name: 'Demo Teacher', email: 'teacher.demo@knowra.local', role: 'teacher' },
  { name: 'Demo Student One', email: 'student1.demo@knowra.local', role: 'student' },
  { name: 'Demo Student Two', email: 'student2.demo@knowra.local', role: 'student' },
  { name: 'Demo Student Three', email: 'student3.demo@knowra.local', role: 'student' },
];

const assertNotProduction = (environment) => {
  if (environment === 'production') {
    throw new Error('Refusing to seed the database when NODE_ENV is production');
  }
};

const ensureDemoUser = async ({ name, email, role }) => {
  let user = await User.findOne({ email });
  if (!user) user = new User({ name, email, role, password: DEMO_PASSWORD });
  else {
    user.name = name;
    user.role = role;
    user.password = DEMO_PASSWORD;
  }
  await user.save();
  return user;
};

const runSeed = async () => {
  assertNotProduction(nodeEnv);

  await mongoose.connect(mongoUri);
  try {
    const [teacher, ...students] = await Promise.all(demoUsers.map(ensureDemoUser));
    const previousClassroom = await Classroom.findOne({
      teacher: teacher._id,
      name: CLASSROOM_NAME,
    });

    if (previousClassroom) {
      await Promise.all([
        Doubt.deleteMany({ classroom: previousClassroom._id }),
        ConceptGap.deleteMany({ classroom: previousClassroom._id }),
      ]);
      await previousClassroom.deleteOne();
    }

    const classroom = await classroomService.createClassroom(teacher._id, {
      name: CLASSROOM_NAME,
      subject: 'Science',
    });
    classroom.students = students.map(({ _id }) => _id);
    await classroom.save();

    const samples = [
      {
        student: 0,
        daysAgo: 1,
        topic: 'Light and refraction',
        text: 'Why does light bend when it enters water?',
        gaps: [{ concept: 'Refractive index', severity: 'high' }],
      },
      {
        student: 0,
        daysAgo: 8,
        topic: 'Fractions',
        text: 'How do I add fractions with different denominators?',
        gaps: [{ concept: 'Common denominator', severity: 'medium' }],
      },
      {
        student: 1,
        daysAgo: 3,
        topic: 'Cell structure',
        text: 'How is a cell membrane different from a cell wall?',
        gaps: [{ concept: 'Cell membrane', severity: 'medium' }],
      },
      {
        student: 1,
        daysAgo: 20,
        topic: 'Chemical bonds',
        text: 'Why do atoms share electrons?',
        gaps: [{ concept: 'Valence electrons', severity: 'high' }],
      },
      {
        student: 2,
        daysAgo: 14,
        topic: 'Forces',
        text: 'How does friction affect motion?',
        gaps: [
          { concept: 'Newton laws', severity: 'low' },
          { concept: 'Net force', severity: 'medium' },
        ],
      },
      {
        student: 2,
        daysAgo: 45,
        topic: 'Energy',
        text: 'What is the difference between kinetic and potential energy?',
        gaps: [],
      },
    ];
    const gapDates = new Map();

    for (const [index, sample] of samples.entries()) {
      const doubt = await Doubt.create({
        student: students[sample.student]._id,
        classroom: classroom._id,
        subject: classroom.subject,
        topic: sample.topic,
        text: sample.text,
        aiAnswer: index === samples.length - 1 ? null : 'Demo answer for classroom testing.',
        status: index === samples.length - 1 ? 'failed' : 'answered',
      });

      if (sample.gaps.length > 0) {
        const gaps = await gapService.recordDoubtGaps(doubt, sample.gaps);
        doubt.detectedGaps = gaps.map(({ _id }) => _id);
        await doubt.save();

        const lastSeenAt = new Date(Date.now() - sample.daysAgo * 24 * 60 * 60 * 1000);
        for (const gap of gaps) {
          const existingDates = gapDates.get(gap._id.toString());
          gapDates.set(gap._id.toString(), {
            createdAt: !existingDates || lastSeenAt < existingDates.createdAt
              ? lastSeenAt
              : existingDates.createdAt,
            updatedAt: !existingDates || lastSeenAt > existingDates.updatedAt
              ? lastSeenAt
              : existingDates.updatedAt,
          });
        }
      }

      const createdAt = new Date(Date.now() - sample.daysAgo * 24 * 60 * 60 * 1000);
      await Doubt.collection.updateOne(
        { _id: doubt._id },
        { $set: { createdAt, updatedAt: createdAt } }
      );
    }

    await Promise.all([...gapDates.entries()].map(([id, dates]) =>
      ConceptGap.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(id) },
        { $set: dates }
      )
    ));

    console.log('Demo data created.');
    console.log(`Teacher: ${demoUsers[0].email} / ${DEMO_PASSWORD}`);
    for (const user of demoUsers.slice(1)) {
      console.log(`Student: ${user.email} / ${DEMO_PASSWORD}`);
    }
    console.log(`Classroom join code: ${classroom.joinCode}`);
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  runSeed().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = runSeed;
module.exports.assertNotProduction = assertNotProduction;
