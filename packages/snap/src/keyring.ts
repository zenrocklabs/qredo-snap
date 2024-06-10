import type { TypedTransaction } from '@ethereumjs/tx';
import { publicToAddress } from '@ethereumjs/util';
import {
  recoverTypedSignature,
  recoverPersonalSignature,
  SignTypedDataVersion,
} from '@metamask/eth-sig-util';
import type {
  Keyring,
  KeyringAccount,
  KeyringRequest,
  SubmitRequestResponse,
} from '@metamask/keyring-api';
import {
  emitSnapKeyringEvent,
  EthAccountType,
  EthMethod,
} from '@metamask/keyring-api';
import { KeyringEvent } from '@metamask/keyring-api/dist/events';
import { type Json, type JsonRpcRequest, hexToBytes, bytesToHex } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import type { QredoAPI } from './qredoapi';
import type { KeyringState, Wallet } from './state';
import { saveState } from './state';
import {
  isEvmChain,
  isUniqueAddress,
  serializeTransaction,
  throwError,
} from './util';

export class QredoMPCKeyring implements Keyring {
  #state: KeyringState;

  #qredoApiClient: QredoAPI;

  #emitEventFunc: (
    event: KeyringEvent,
    data: Record<string, Json>,
  ) => Promise<void>;

  async #emitEvent(
    event: KeyringEvent,
    data: Record<string, Json>,
  ): Promise<void> {
    await emitSnapKeyringEvent(snap, event, data);
  }

  constructor(
    state: KeyringState,
    qredoApiClient: QredoAPI,
    emitEventFunc?: (
      event: KeyringEvent,
      data: Record<string, Json>,
    ) => Promise<void>,
  ) {
    this.#state = state;
    this.#qredoApiClient = qredoApiClient;
    this.#emitEventFunc =
      emitEventFunc ??
      (async (event: KeyringEvent, data: Record<string, Json>) =>
        this.#emitEvent(event, data));
  }

  async listAccounts(): Promise<KeyringAccount[]> {
    return Object.values(this.#state.wallets).map((wallet) => wallet.account);
  }

  async getAccount(id: string): Promise<KeyringAccount> {
    return (
      this.#state.wallets[id]?.account ??
      throwError(`Account '${id}' not found`)
    );
  }

  async createAccount(
    options: Record<string, Json> = {},
  ): Promise<KeyringAccount> {
    const address = options.mpcAddress as string;
    const refreshToken = options.refreshToken as string;

    if (!isUniqueAddress(address, Object.values(this.#state.wallets))) {
      throw new Error(`Account address already in use: ${address}`);
    }

    try {
      const account: KeyringAccount = {
        id: uuid(),
        options,
        address,
        methods: [
          EthMethod.PersonalSign,
          EthMethod.Sign,
          EthMethod.SignTransaction,
          EthMethod.SignTypedDataV1,
          EthMethod.SignTypedDataV3,
          EthMethod.SignTypedDataV4,
        ],
        type: EthAccountType.Eoa,
      };

      await this.#emitEventFunc(KeyringEvent.AccountCreated, { account });
      this.#state.wallets[account.id] = {
        account,
        refreshToken,
      };
      await this.#saveState();
      return account;
    } catch (error) {
      throw new Error((error as Error).message);
    }
  }

  async filterAccountChains(_id: string, chains: string[]): Promise<string[]> {
    // The `id` argument is not used because all accounts created by this snap
    // are expected to be compatible with any EVM chain.
    return chains.filter((chain) => isEvmChain(chain));
  }

  async updateAccount(_account: KeyringAccount): Promise<void> {
    throwError('updateAccount is not supported');
  }

  async deleteAccount(id: string): Promise<void> {
    try {
      await this.#emitEventFunc(KeyringEvent.AccountDeleted, { id });
      delete this.#state.wallets[id];
      await this.#saveState();
    } catch (error) {
      throwError((error as Error).message);
    }
  }

  async submitRequest(request: KeyringRequest): Promise<SubmitRequestResponse> {
    return this.#syncSubmitRequest(request);
  }

  async #syncSubmitRequest(
    request: KeyringRequest,
  ): Promise<SubmitRequestResponse> {
    const { method, params = [] } = request.request as JsonRpcRequest;
    const signature = await this.#handleSigningRequest(method, params);
    return {
      pending: false,
      result: signature,
    };
  }

  #getWalletByAddress(address: string): Wallet {
    const match = Object.values(this.#state.wallets).find(
      (wallet) =>
        wallet.account.address.toLowerCase() === address.toLowerCase(),
    );

    return match ?? throwError(`Account '${address}' not found`);
  }

  async #handleSigningRequest(method: string, params: Json): Promise<Json> {
    switch (method) {
      case EthMethod.PersonalSign: {
        const [message, from] = params as [string, string];
        return this.#signPersonalMessage(from, message);
      }

      case EthMethod.SignTransaction: {
        const [tx] = params as [any];
        return await this.#signTransaction(tx);
      }

      case EthMethod.SignTypedDataV1: {
        const [from, data] = params as [string, Json];
        return this.#signTypedData(from, data, {
          version: SignTypedDataVersion.V1,
        });
      }

      case EthMethod.SignTypedDataV3: {
        const [from, data] = params as [string, Json];
        return this.#signTypedData(from, data, {
          version: SignTypedDataVersion.V3,
        });
      }

      case EthMethod.SignTypedDataV4: {
        const [from, data] = params as [string, Json];
        return await this.#signTypedData(from, data, {
          version: SignTypedDataVersion.V4,
        });
      }

      case EthMethod.Sign: {
        const [from, data] = params as [string, string];
        return await this.#signMessage(from, data);
      }

      default: {
        throw new Error(`EVM method '${method}' not supported`);
      }
    }
  }

  async #signTransaction(tx: any): Promise<Json> {
    const wallet = this.#getWalletByAddress(tx.from);
    const signedTx = await this.#qredoApiClient.signTransaction(
      tx,
      wallet.refreshToken,
    );
    const serTx = serializeTransaction(signedTx.toJSON(), signedTx.type);
    this.#validateTransactionSig(signedTx, tx.from);
    return serTx;
  }

  async #signPersonalMessage(from: string, message: string): Promise<string> {
    const wallet = this.#getWalletByAddress(from);
    const res = await this.#qredoApiClient.signData(
      from,
      message,
      '',
      wallet.refreshToken,
    );
    this.#validatePersonalSig(message, wallet.account.address, res);
    return res;
  }

  async #signTypedData(
    from: string,
    data: any,
    opts: { version: SignTypedDataVersion } = {
      version: SignTypedDataVersion.V1,
    },
  ): Promise<string> {
    const wallet = this.#getWalletByAddress(from);
    const signature = await this.#qredoApiClient.signData(
      from,
      '',
      data,
      wallet.refreshToken,
    );
    this.#validateTypedSig(
      data,
      wallet.account.address,
      signature,
      opts.version,
    );
    return signature;
  }

  async #signMessage(from: string, data: string): Promise<string> {
    const wallet = this.#getWalletByAddress(from);
    return await this.#qredoApiClient.signData(
      from,
      '',
      data,
      wallet.refreshToken,
    );
  }

  #validatePersonalSig(message: string, from: string, signature: string) {
    const data = hexToBytes(message);
    const recoveredAddress = recoverPersonalSignature({ data, signature });

    if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
      throw new Error(
        `Personal sign signature verification failed for account '${from}' (got '${recoveredAddress}')`,
      );
    }
  }

  #validateTypedSig(
    data: any,
    from: string,
    signature: string,
    version: SignTypedDataVersion,
  ) {
    const recoveredAddress = recoverTypedSignature({
      data,
      signature,
      version,
    });
    if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
      throw new Error(
        `TypedData signature verification failed for account '${from}' (got '${recoveredAddress}')`,
      );
    }
  }

  #validateTransactionSig(signedTx: TypedTransaction, from: string) {
    const publicKey = signedTx.getSenderPublicKey();
    const sender = publicToAddress(publicKey);
    const recoveredAddress = bytesToHex(sender);

    if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
      throw new Error(
        `Transaction signature verification failed for account '${from}' (got '${recoveredAddress}')`,
      );
    }
  }

  async #saveState(): Promise<void> {
    await saveState(this.#state);
  }
}
