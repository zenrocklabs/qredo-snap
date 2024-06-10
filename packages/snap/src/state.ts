import type { KeyringAccount } from '@metamask/keyring-api';

export type KeyringState = {
  wallets: Record<string, Wallet>;
};

export type Wallet = {
  account: KeyringAccount;
  refreshToken: string;
};

/**
 * Default keyring state.
 */
const defaultState: KeyringState = {
  wallets: {},
};

/**
 * Retrieves the current state of the keyring.
 *
 * @returns The current state of the keyring.
 */
export async function getState(): Promise<KeyringState> {
  const state = (await snap.request({
    method: 'snap_manageState',
    params: { operation: 'get' },
  })) as any;

  return {
    ...defaultState,
    ...state,
  };
}

/**
 * Persists the given snap state.
 *
 * @param state - New snap state.
 */
export async function saveState(state: KeyringState) {
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', newState: state },
  });
}
