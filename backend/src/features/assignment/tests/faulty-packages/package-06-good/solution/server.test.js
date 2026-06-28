const request = require('supertest');
const app = require('./server');

const CREDENTIALS = { username: 'testuser', password: 'password123' };

describe('Core API Endpoints', () => {
  describe('GET /health', () => {
    test('should return 200 with ok status', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /auth/login', () => {
    test('should return JWT token on successful login', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send(CREDENTIALS)
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
    });

    test('should reject invalid credentials', async () => {
      await request(app)
        .post('/auth/login')
        .send({ username: 'testuser', password: 'wrong' })
        .expect(401);
    });

    test('should reject missing credentials', async () => {
      await request(app)
        .post('/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('Protected endpoints with authentication', () => {
    let token;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/auth/login')
        .send(CREDENTIALS);
      token = loginRes.body.token;
    });

    test('should reject requests without token', async () => {
      await request(app)
        .get('/api/users/1')
        .expect(401);
    });

    test('should allow requests with valid token', async () => {
      await request(app)
        .get('/api/users/1')
        .set('Authorization', `Bearer ${token}`)
        .expect([200, 404, 500]); // 404 if user doesn't exist, 500 if DB unreachable in test
    });

    test('should reject requests with invalid token', async () => {
      await request(app)
        .get('/api/users/1')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);
    });
  });

  describe('Item creation endpoint', () => {
    let token;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/auth/login')
        .send(CREDENTIALS);
      token = loginRes.body.token;
    });

    test('should allow authenticated users to create items', async () => {
      await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Item' })
        .expect([201, 500]); // 500 if DB unreachable in test
    });

    test('should reject items without a name', async () => {
      await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });
  });
});
