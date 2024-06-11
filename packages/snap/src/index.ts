import { handleKeyringRequest } from '@metamask/keyring-api';
import type { OnKeyringRequestHandler } from '@metamask/snaps-sdk';
import type { Json } from '@metamask/utils';

import { allowedRPCOrigins, qredoApiUrl } from './config';
import { QredoMPCKeyring } from './keyring';
import { QredoAPIClient } from './qredoapi';
import { getState } from './state';

let keyring: QredoMPCKeyring;

/**
 * Return the keyring instance. If it doesn't exist, create it.
 * @returns The keyring instance.
 * @throws If the keyring cannot be instantiated.
 */
async function getKeyring(): Promise<QredoMPCKeyring> {
  if (!keyring) {
    const state = await getState(snap);
    if (!keyring) {
      keyring = new QredoMPCKeyring(state, new QredoAPIClient(qredoApiUrl));
    }
  }
  return keyring;
}

export const onKeyringRequest: OnKeyringRequestHandler = async ({
  origin,
  request,
}) => {
  if (!allowedRPCOrigins.has(origin)) {
    throw new Error(`Origin '${origin} not allowed`);
  }

  const response = await handleKeyringRequest(await getKeyring(), request);

  return response as Json;
};
