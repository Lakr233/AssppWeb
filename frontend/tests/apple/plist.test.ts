import { describe, it, expect } from 'vitest';
import { buildPlist, parsePlist } from '../../src/apple/plist';

describe('apple/plist', () => {
  describe('buildPlist', () => {
    it('should create valid XML plist', () => {
      const result = buildPlist({ key: 'value' });
      expect(result).toContain('<?xml');
      expect(result).toContain('<plist');
      expect(result).toContain('<key>key</key>');
      expect(result).toContain('<string>value</string>');
    });

    it('should handle nested objects', () => {
      const result = buildPlist({
        outer: { inner: 'test' },
      });
      expect(result).toContain('<key>outer</key>');
      expect(result).toContain('<key>inner</key>');
      expect(result).toContain('<string>test</string>');
    });

    it('should handle authentication-style payload', () => {
      const payload = {
        appleId: 'test@example.com',
        attempt: '4',
        guid: 'abc123def456',
        password: 'secret',
        rmp: '0',
        why: 'signIn',
      };

      const result = buildPlist(payload);
      expect(result).toContain('<key>appleId</key>');
      expect(result).toContain('<string>test@example.com</string>');
      expect(result).toContain('<key>why</key>');
      expect(result).toContain('<string>signIn</string>');
    });
  });

  describe('parsePlist', () => {
    it('should parse XML plist string', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>name</key>
    <string>test</string>
    <key>count</key>
    <integer>42</integer>
</dict>
</plist>`;

      const result = parsePlist(xml);
      expect(result.name).toBe('test');
      expect(result.count).toBe(42);
    });

    it('should roundtrip (build then parse)', () => {
      const original = {
        email: 'test@test.com',
        value: 'hello world',
      };

      const xml = buildPlist(original);
      const parsed = parsePlist(xml);

      expect(parsed.email).toBe('test@test.com');
      expect(parsed.value).toBe('hello world');
    });
  });
});
