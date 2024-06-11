import { describe, expect } from '@jest/globals';
import type { KeyringRequest } from '@metamask/keyring-api';
import { EthMethod } from '@metamask/keyring-api';
import { installSnap } from '@metamask/snaps-jest';
import type { SnapsProvider } from '@metamask/snaps-sdk';
import { v4 as uuid } from 'uuid';

import { QredoMPCKeyring } from './keyring';
import { MockQredoAPIClient } from './mockQredoAPI';
import { getState } from './state';

describe('keyring', () => {
  const testAddress = '0x6f83e67551C5eB8E3f684D2D61F46BF739ACB5dC';

  describe('accounts', () => {
    it('should create a new account and add it to the state', async () => {
      const snap = await installSnap();

      const state = await getState(snap as SnapsProvider);
      const keyring = new QredoMPCKeyring(
        state,
        new MockQredoAPIClient(),
        snap as SnapsProvider,
      );

      const options = {
        mpcAddress: testAddress,
        refreshToken: 'refresh-token',
      };

      const account = await keyring.createAccount(options);

      expect(account.address).toBe(testAddress);
    });

    it('trows an error if account exists', async () => {
      const snap = await installSnap();

      const state = await getState(snap as SnapsProvider);
      const keyring = new QredoMPCKeyring(
        state,
        new MockQredoAPIClient(),
        snap as SnapsProvider,
      );

      const options = {
        mpcAddress: testAddress,
        refreshToken: 'refresh-token',
      };

      await expect(keyring.createAccount(options)).rejects.toThrow(
        `Account address already in use: ${testAddress}`,
      );
    });
  });

  describe('signatures', () => {
    const testMessage =
      '0x4578616d706c652060706572736f6e616c5f7369676e60206d657373616765';
    const testMessageSignature =
      '0x539bf68b5432bde5ba4209e00520c14a51f0e18c341b83c894d6e374ca37e2653e8f2fc808dc5ac42e4dfdc699b57704407a7cfab191679b34fc2880ee760ec91c';

    it('should return personal sign', async () => {
      const snap = await installSnap();
      const state = await getState(snap as SnapsProvider);

      const keyring = new QredoMPCKeyring(
        state,
        new MockQredoAPIClient(),
        snap as SnapsProvider,
      );

      const request: KeyringRequest = {
        id: uuid(),
        scope: '',
        account: testAddress,
        request: {
          method: EthMethod.PersonalSign,
          params: [testMessage, testAddress],
        },
      };

      const response = await keyring.submitRequest(request);

      expect(response).toStrictEqual({
        pending: false,
        result: testMessageSignature,
      });
    });
  });
});
