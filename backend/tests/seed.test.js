require('./testDb');

const runSeed = require('../scripts/seed');

describe('demo seed safety', () => {
  test('refuses production mode before connecting to the database', () => {
    expect(() => runSeed.assertNotProduction('production')).toThrow(
      'Refusing to seed the database when NODE_ENV is production'
    );
    expect(() => runSeed.assertNotProduction('test')).not.toThrow();
  });
});
