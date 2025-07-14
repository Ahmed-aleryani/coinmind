import { isValidSpreadsheetFile } from '../utils/parsers';

// Mock File object for testing
function createMockFile(content: string, fileName: string, type: string): File {
  const blob = new Blob([content], { type });
  return new File([blob], fileName, { type });
}

describe('Spreadsheet Parser', () => {
  describe('isValidSpreadsheetFile', () => {
    it('should accept CSV files', () => {
      const file = createMockFile('test', 'test.csv', 'text/csv');
      expect(isValidSpreadsheetFile(file)).toBe(true);
    });

    it('should accept XLSX files', () => {
      const file = createMockFile('test', 'test.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(isValidSpreadsheetFile(file)).toBe(true);
    });

    it('should accept XLS files', () => {
      const file = createMockFile('test', 'test.xls', 'application/vnd.ms-excel');
      expect(isValidSpreadsheetFile(file)).toBe(true);
    });

    it('should reject unsupported file types', () => {
      const file = createMockFile('test', 'test.txt', 'text/plain');
      expect(isValidSpreadsheetFile(file)).toBe(false);
    });

    it('should reject files that are too large', () => {
      // Create a large file (6MB)
      const largeContent = 'x'.repeat(6 * 1024 * 1024);
      const file = createMockFile(largeContent, 'test.csv', 'text/csv');
      expect(isValidSpreadsheetFile(file)).toBe(false);
    });

    it('should accept files by extension even if MIME type is not recognized', () => {
      const file = createMockFile('test', 'test.xlsx', 'application/octet-stream');
      expect(isValidSpreadsheetFile(file)).toBe(true);
    });
  });
}); 