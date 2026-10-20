import { describe, it, expect } from 'vitest';
import { config } from '../src/config.js';

describe('config', () => {
  it('should have default port 8080', () => {
    expect(config.port).toBe(8080);
  });

  it('should have default data directory', () => {
    expect(config.dataDir).toBe('./data');
  });
});
