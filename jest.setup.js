// Mock console methods
const originalConsole = { ...console };

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-api-key';
});

afterEach(() => {
  // Restore original console methods after each test
  global.console = originalConsole;
});
