const swaggerSpec = require('../src/docs/swagger');

describe('OpenAPI specification', () => {
  test('documents every API route, security mode, and required resource schema', () => {
    const requiredPaths = [
      '/health',
      '/auth/register',
      '/auth/login',
      '/auth/me',
      '/classrooms',
      '/classrooms/join',
      '/classrooms/{id}',
      '/classrooms/{id}/gaps',
      '/classrooms/{id}/insights',
      '/classrooms/{id}/students',
      '/classrooms/{id}/leave',
      '/classrooms/{id}/regenerate-code',
      '/doubts',
      '/doubts/{id}',
      '/doubts/{id}/retry',
      '/students/{id}/gaps',
      '/students/{id}/learning-plan',
    ];

    for (const path of requiredPaths) {
      expect(swaggerSpec.paths).toHaveProperty(path);
      for (const operation of Object.values(swaggerSpec.paths[path])) {
        expect(operation).toHaveProperty('security');
      }
    }

    expect(swaggerSpec.components.schemas).toEqual(expect.objectContaining({
      User: expect.any(Object),
      Classroom: expect.any(Object),
      Doubt: expect.any(Object),
      ConceptGap: expect.any(Object),
      LearningPlan: expect.any(Object),
      Insights: expect.any(Object),
    }));
  });
});
