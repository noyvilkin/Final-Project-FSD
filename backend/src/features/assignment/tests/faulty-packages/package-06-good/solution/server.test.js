/**
 * Unit tests for every core endpoint.
 *
 * Coverage:
 *   GET  /health        — healthy response shape
 *   POST /auth/login    — success, wrong password, unknown user, missing fields
 *   GET  /api/users/:id — no token, bad token, invalid id, not found, success, db failure
 *   POST /api/items     — no token, missing name, blank name, success, db failure
 *
 * PostgreSQL is mocked so every assertion is deterministic: a test fails if the
 * endpoint misbehaves, rather than passing on an "unreachable database" fallback.
 */

jest.mock('pg', () => {
  const mockQuery = jest.fn();
  return {
    Pool: jest.fn(() => ({ query: mockQuery })),
    __mockQuery: mockQuery,
  };
});

const request = require('supertest');
const { __mockQuery: mockQuery } = require('pg');
const app = require('./server');

const CREDENTIALS = { username: 'testuser', password: 'password123' };

/** Logs in with the demo account and returns a valid bearer token. */
async function getToken() {
  const res = await request(app).post('/auth/login').send(CREDENTIALS).expect(200);
  return res.body.token;
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('GET /health', () => {
  test('returns 200 with an ok status and a timestamp', async () => {
    const res = await request(app).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(Date.parse(res.body.timestamp)).not.toBeNaN();
  });
});

describe('POST /auth/login', () => {
  test('returns a signed JWT for valid credentials', async () => {
    const res = await request(app).post('/auth/login').send(CREDENTIALS).expect(200);

    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.')).toHaveLength(3);
  });

  test('rejects a wrong password with 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ username: 'testuser', password: 'wrong' })
      .expect(401);

    expect(res.body.error).toBe('invalid credentials');
  });

  test('rejects an unknown username with 401', async () => {
    await request(app)
      .post('/auth/login')
      .send({ username: 'nobody', password: 'password123' })
      .expect(401);
  });

  test('rejects missing credentials with 400', async () => {
    const res = await request(app).post('/auth/login').send({}).expect(400);

    expect(res.body.error).toMatch(/required/);
  });
});

describe('GET /api/users/:id', () => {
  test('rejects a request with no token with 401', async () => {
    await request(app).get('/api/users/1').expect(401);
  });

  test('rejects a malformed token with 403', async () => {
    await request(app)
      .get('/api/users/1')
      .set('Authorization', 'Bearer invalid-token')
      .expect(403);
  });

  test('rejects a non-numeric id with 400', async () => {
    const token = await getToken();

    const res = await request(app)
      .get('/api/users/abc')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(res.body.error).toMatch(/positive integer/);
  });

  test('returns 404 when the user does not exist', async () => {
    const token = await getToken();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get('/api/users/999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  test('returns the user for a valid id', async () => {
    const token = await getToken();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, username: 'testuser' }] });

    const res = await request(app)
      .get('/api/users/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({ id: 1, username: 'testuser' });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [1]);
  });

  test('returns 500 when the database query fails', async () => {
    const token = await getToken();
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    await request(app)
      .get('/api/users/1')
      .set('Authorization', `Bearer ${token}`)
      .expect(500);
  });
});

describe('POST /api/items', () => {
  test('rejects a request with no token with 401', async () => {
    await request(app).post('/api/items').send({ name: 'Test Item' }).expect(401);
  });

  test('rejects a missing name with 400', async () => {
    const token = await getToken();

    await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  test('rejects a blank name with 400', async () => {
    const token = await getToken();

    await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' })
      .expect(400);
  });

  test('creates an item for an authenticated user', async () => {
    const token = await getToken();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 7, name: 'Test Item' }] });

    const res = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '  Test Item  ' })
      .expect(201);

    expect(res.body).toEqual({ id: 7, name: 'Test Item' });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT'), ['Test Item', 1]);
  });

  test('returns 500 when the insert fails', async () => {
    const token = await getToken();
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Item' })
      .expect(500);
  });
});
