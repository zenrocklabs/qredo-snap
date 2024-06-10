import { describe, expect } from '@jest/globals';

import { isEvmChain } from './util';

describe('snap utils', () => {
  describe('isEvmChain', () => {
    it('isEvmChain true', () => {
      expect(isEvmChain('eip155:1')).toBe(true);
    });
    it('isEvmChain false', () => {
      expect(isEvmChain('cosmos:zenrock')).toBe(false);
    });
  });
});
