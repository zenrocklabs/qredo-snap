import type { KeyringAccount } from '@metamask/keyring-api';
import type { SnapsProvider } from '@metamask/snaps-sdk';

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
export const defaultState: KeyringState = {
  wallets: {},
};

/**
 * Retrieves the current state of the keyring.
 *
 * @param snap - The snap provider instance.
 * @returns The current state of the keyring.
 */
export async function getState(snap: SnapsProvider): Promise<KeyringState> {
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
 * @param snap - The snap provider instance.
 */
export async function saveState(state: KeyringState, snap: SnapsProvider) {
  await snap.request({
    method: 'snap_manageState',
    params: { operation: 'update', newState: state },
  });
}
