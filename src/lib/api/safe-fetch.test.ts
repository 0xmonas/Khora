import { describe, it, expect } from 'vitest';
import { isSafeURL } from './safe-fetch';

describe('isSafeURL — SSRF protection', () => {
  // ── Should ALLOW ──
  describe('allows safe external URLs', () => {
    it('allows normal HTTPS URLs', () => {
      expect(isSafeURL('https://example.com/api')).toBe(true);
      expect(isSafeURL('https://ipfs.io/ipfs/QmHash')).toBe(true);
      expect(isSafeURL('https://arweave.net/txid')).toBe(true);
    });

    it('allows public 172.x addresses (outside 16-31 range)', () => {
      expect(isSafeURL('https://172.1.2.3')).toBe(true);
      expect(isSafeURL('https://172.15.0.1')).toBe(true);
      expect(isSafeURL('https://172.32.0.1')).toBe(true);
      expect(isSafeURL('https://172.255.0.1')).toBe(true);
    });
  });

  // ── Should BLOCK ──
  describe('blocks non-HTTPS protocols', () => {
    it('blocks HTTP', () => {
      expect(isSafeURL('http://example.com')).toBe(false);
    });

    it('blocks FTP', () => {
      expect(isSafeURL('ftp://example.com')).toBe(false);
    });

    it('blocks file://', () => {
      expect(isSafeURL('file:///etc/passwd')).toBe(false);
    });

    it('blocks javascript:', () => {
      expect(isSafeURL('javascript:alert(1)')).toBe(false);
    });
  });

  describe('blocks loopback addresses', () => {
    it('blocks localhost', () => {
      expect(isSafeURL('https://localhost')).toBe(false);
      expect(isSafeURL('https://localhost:3000')).toBe(false);
    });

    it('blocks 127.0.0.1', () => {
      expect(isSafeURL('https://127.0.0.1')).toBe(false);
      expect(isSafeURL('https://127.0.0.1:8080/api')).toBe(false);
    });

    it('blocks 0.0.0.0', () => {
      expect(isSafeURL('https://0.0.0.0')).toBe(false);
    });
  });

  describe('blocks RFC 1918 private ranges', () => {
    it('blocks 10.x.x.x', () => {
      expect(isSafeURL('https://10.0.0.1')).toBe(false);
      expect(isSafeURL('https://10.255.255.255')).toBe(false);
    });

    it('blocks 172.16-31.x.x (private range only)', () => {
      expect(isSafeURL('https://172.16.0.1')).toBe(false);
      expect(isSafeURL('https://172.20.0.1')).toBe(false);
      expect(isSafeURL('https://172.31.255.255')).toBe(false);
    });

    it('blocks 192.168.x.x', () => {
      expect(isSafeURL('https://192.168.0.1')).toBe(false);
      expect(isSafeURL('https://192.168.1.1')).toBe(false);
    });
  });

  describe('blocks link-local and cloud metadata', () => {
    it('blocks 169.254.x.x (full /16 range)', () => {
      expect(isSafeURL('https://169.254.169.254')).toBe(false);
      expect(isSafeURL('https://169.254.0.1')).toBe(false);
      expect(isSafeURL('https://169.254.1.1')).toBe(false);
    });

    it('blocks GCP metadata endpoint', () => {
      expect(isSafeURL('https://metadata.google.internal')).toBe(false);
    });
  });

  describe('blocks IPv6 addresses', () => {
    it('blocks IPv6 localhost [::1]', () => {
      expect(isSafeURL('https://[::1]')).toBe(false);
    });

    it('blocks IPv6-mapped IPv4 (SSRF bypass vector)', () => {
      expect(isSafeURL('https://[::ffff:127.0.0.1]')).toBe(false);
      expect(isSafeURL('https://[::ffff:169.254.169.254]')).toBe(false);
    });

    it('blocks IPv6 private addresses', () => {
      expect(isSafeURL('https://[fc00::1]')).toBe(false);
      expect(isSafeURL('https://[fd00::1]')).toBe(false);
      expect(isSafeURL('https://[fe80::1]')).toBe(false);
    });
  });

  describe('blocks internal TLDs', () => {
    it('blocks .internal', () => {
      expect(isSafeURL('https://my-service.internal')).toBe(false);
    });

    it('blocks .local', () => {
      expect(isSafeURL('https://my-service.local')).toBe(false);
      expect(isSafeURL('https://printer.local')).toBe(false);
    });
  });

  describe('handles edge cases', () => {
    it('returns false for invalid URLs', () => {
      expect(isSafeURL('')).toBe(false);
      expect(isSafeURL('not-a-url')).toBe(false);
      expect(isSafeURL('://missing-protocol')).toBe(false);
    });

    it('blocks data: URIs', () => {
      expect(isSafeURL('data:text/html,<script>alert(1)</script>')).toBe(false);
    });
  });
});
