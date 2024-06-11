import { Common, Hardfork } from '@ethereumjs/common';
import { type TypedTransaction, TransactionFactory } from '@ethereumjs/tx';
import { hexToBytes } from '@metamask/utils';

export type QredoAPI = {
  signData(
    from: string,
    message: string,
    payload: string,
    refreshToken: string,
  ): Promise<string>;
  signTransaction(tx: any, refreshToken: string): Promise<TypedTransaction>;
};

export type SignRequest = {
  from: string;
  message: string;
  payload: any;
};

export type SignResponse = {
  status: string;
  txHash: string;
  signature: string;
  signedTx: string;
};

export class QredoAPIClient implements QredoAPI {
  #execReqFunc: (actionUrl: string, auth: string, req: any) => Promise<any>;

  #qredoApiUrl: string;

  constructor(
    url: string,
    execReqFunc?: (actionUrl: string, auth: string, req: any) => Promise<any>,
  ) {
    this.#execReqFunc =
      execReqFunc ??
      (async (actionUrl: string, auth: string, req: any) =>
        this.#executeRequest(actionUrl, auth, req));
    this.#qredoApiUrl = url;
  }

  async signData(
    from: string,
    message: string,
    payload: any,
    refreshToken: string,
  ): Promise<string> {
    const auth = await this.#generateOAuthHeader(refreshToken);

    const req: SignRequest = {
      from,
      message,
      payload,
    };
    const json: SignResponse = await this.#execReqFunc(
      '/snaps/sign/sync',
      auth,
      req,
    );

    return json.signature;
  }

  async signTransaction(
    tx: any,
    refreshToken: string,
  ): Promise<TypedTransaction> {
    // Patch the transaction to make sure that the `chainId` is a hex string.
    if (!tx.chainId.startsWith('0x')) {
      tx.chainId = `0x${parseInt(tx.chainId, 10).toString(16)}`;
    }

    const auth = await this.#generateOAuthHeader(refreshToken);

    const json: SignResponse = await this.#execReqFunc(
      '/snaps/tx/sync',
      auth,
      tx,
    );

    if (json.signedTx === '') {
      throw new Error('no signed transaction received');
    }

    const common = Common.custom(
      {
        chainId: tx.chainId,
      },
      {
        hardfork:
          tx.maxPriorityFeePerGas || tx.maxFeePerGas
            ? Hardfork.London
            : Hardfork.Istanbul,
      },
    );

    return TransactionFactory.fromSerializedData(hexToBytes(json.signedTx), {
      common,
    });
  }

  async #generateOAuthHeader(refreshToken: string): Promise<string> {
    const res = await fetch(`${this.#qredoApiUrl}/snaps/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (res.status !== 200) {
      throw new Error(
        `non 200 status code received from qredo api: ${
          res.status
        }, response body: ${await res.text()}`,
      );
    }
    const json = await res.json();
    if (json.error) {
      throw json.error;
    }

    return json.access_token;
  }

  async #executeRequest(
    actionUrl: string,
    auth: string,
    req: any,
  ): Promise<any> {
    const body = JSON.stringify(req);
    const res = await fetch(`${this.#qredoApiUrl}${actionUrl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth}`,
      },
      body,
    });
    if (res.status !== 200) {
      throw new Error(
        `non 200 status code received from qredo api: ${
          res.status
        }, response body: ${await res.text()}`,
      );
    }
    const json = await res.json();
    if (json.error) {
      throw json.error;
    }

    return json;
  }
}
