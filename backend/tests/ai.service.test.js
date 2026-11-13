process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/knowra_test_only';
process.env.JWT_SECRET = 'jest-only-ai-signing-key';
process.env.AI_SERVICE_URL = 'https://ai-service.test/v1';
process.env.AI_SERVICE_KEY = 'jest-only-service-key';

const {
  analyzeDoubt,
  generateLearningPlan,
  checkHealth,
} = require('../src/services/ai.service');

describe('analyzeDoubt', () => {
  const originalFetch = global.fetch;
  const request = {
    subject: 'Computer Science',
    topic: 'Arrays',
    text: 'How does indexing work?',
  };
  const expected = {
    answer: 'A useful explanation.',
    gaps: [{ concept: 'Prerequisite concept', severity: 'high' }],
  };
  const expectedLearningPlan = {
    ranked: [{
      concept: 'Prerequisite concept',
      severity: 'high',
      occurrences: 2,
      priority: 3,
    }],
    plan: [{
      concept: 'Prerequisite concept',
      tip: 'Review the foundational definition.',
      practice_question: 'How does the concept apply here?',
    }],
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const providerResponse = (payload) => ({
    ok: true,
    status: 200,
    json: async () => payload,
  });

  test('returns a topic-specific mock when AI_SERVICE_URL is empty', async () => {
    jest.resetModules();
    process.env.AI_SERVICE_URL = '';
    const mockService = require('../src/services/ai.service');
    const mockAnalyzeDoubt = mockService.analyzeDoubt;
    const mockGenerateLearningPlan = mockService.generateLearningPlan;
    const mockCheckHealth = mockService.checkHealth;

    await expect(mockAnalyzeDoubt(request)).resolves.toEqual({
      answer: expect.stringContaining('Arrays'),
      gaps: [{ concept: 'Arrays', severity: 'medium' }],
    });
    await expect(mockGenerateLearningPlan({ gaps: [], limit: 5 })).resolves.toBeNull();
    await expect(mockCheckHealth()).resolves.toBe('mock');
    expect(global.fetch).not.toHaveBeenCalled();

    jest.resetModules();
    process.env.AI_SERVICE_URL = 'https://ai-service.test/v1';
  });

  test('posts only the analysis fields and validates a valid response', async () => {
    global.fetch.mockResolvedValue(providerResponse(expected));

    await expect(analyzeDoubt(request)).resolves.toEqual(expected);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://ai-service.test/v1/analyze');
    const options = global.fetch.mock.calls[0][1];
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer jest-only-service-key');
    expect(JSON.parse(options.body)).toEqual(request);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test('posts learning-plan gaps to the dedicated endpoint and validates the response', async () => {
    const payload = {
      gaps: [{
        concept: 'Prerequisite concept',
        severity: 'high',
        occurrences: 2,
        days_since_last_seen: 14,
      }],
      limit: 1,
    };
    global.fetch.mockResolvedValue(providerResponse(expectedLearningPlan));

    await expect(generateLearningPlan(payload)).resolves.toEqual(expectedLearningPlan);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0])
      .toBe('https://ai-service.test/v1/learning/plan');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual(payload);
  });

  test('uses the unavailable sentinel in learning-plan mock mode', async () => {
    jest.resetModules();
    process.env.AI_SERVICE_URL = '';
    const mockGenerateLearningPlan = require('../src/services/ai.service').generateLearningPlan;

    await expect(mockGenerateLearningPlan({ gaps: [], limit: 5 })).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();

    jest.resetModules();
    process.env.AI_SERVICE_URL = 'https://ai-service.test/v1';
  });

  test('rejects malformed learning-plan responses', async () => {
    global.fetch.mockResolvedValue(providerResponse({ plan: [] }));

    await expect(generateLearningPlan({ gaps: [], limit: 5 }))
      .rejects.toMatchObject({ statusCode: 502 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('checks the AI health endpoint once and returns its availability', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    await expect(checkHealth()).resolves.toBe('up');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe('https://ai-service.test/v1/health');
    expect(global.fetch.mock.calls[0][1].method).toBe('GET');
  });

  test('marks an AI health timeout as down after two seconds', async () => {
    jest.useFakeTimers();
    global.fetch.mockImplementation((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('request aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));

    try {
      const result = checkHealth();
      await jest.advanceTimersByTimeAsync(2000);
      await expect(result).resolves.toBe('down');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('rejects malformed JSON without retrying', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('invalid JSON'); },
    });

    await expect(analyzeDoubt(request)).rejects.toMatchObject({ statusCode: 502 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects a response missing required fields without retrying', async () => {
    global.fetch.mockResolvedValue(providerResponse({ answer: 'No gaps field.' }));

    await expect(analyzeDoubt(request)).rejects.toMatchObject({ statusCode: 502 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries one time on server errors but not on client errors', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce(providerResponse(expected));

    await expect(analyzeDoubt(request)).resolves.toEqual(expected);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    global.fetch.mockReset();
    global.fetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(analyzeDoubt(request)).rejects.toMatchObject({ statusCode: 502 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('retries once after a network failure', async () => {
    global.fetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(providerResponse(expected));

    await expect(analyzeDoubt(request)).resolves.toEqual(expected);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('aborts timed-out requests and retries once', async () => {
    jest.useFakeTimers();
    global.fetch
      .mockImplementationOnce((url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('request aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }))
      .mockResolvedValueOnce(providerResponse(expected));

    try {
      const result = analyzeDoubt(request);
      await jest.advanceTimersByTimeAsync(20000);
      await expect(result).resolves.toEqual(expected);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
