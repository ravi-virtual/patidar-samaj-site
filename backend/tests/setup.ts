// Test environment: set before any module imports src/config/constants.ts.
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.SESSION_SECRET = 'test-only-secret-that-is-long-enough-0123456789';
// Always a dedicated *_test database, regardless of what backend/.env points at.
process.env.MONGO_URI = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27018/patidar_samaj_test';
// Uploads go to a throwaway folder so tests never touch real files.
process.env.UPLOAD_DIR = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/samaj-test-uploads-${process.pid}`;
