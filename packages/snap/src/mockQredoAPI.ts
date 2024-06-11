import { Common, Hardfork } from '@ethereumjs/common';
import { type TypedTransaction, TransactionFactory } from '@ethereumjs/tx';
import { hexToBytes } from '@metamask/utils';

import type { QredoAPI } from './qredoapi';

export class MockQredoAPIClient implements QredoAPI {
  async signData(
    from: string,
    message: string,
    payload: string,
    refreshToken: string,
  ): Promise<string> {
    if (refreshToken === '401') {
      throw new Error(
        `non 200 status code received from qredo api: 401, response body: '{'reason': 'unauthorized'}`,
      );
    }

    if (
      from === '0x6f83e67551C5eB8E3f684D2D61F46BF739ACB5dC' &&
      message ===
        '0x4578616d706c652060706572736f6e616c5f7369676e60206d657373616765' &&
      payload === ''
    ) {
      return '0x539bf68b5432bde5ba4209e00520c14a51f0e18c341b83c894d6e374ca37e2653e8f2fc808dc5ac42e4dfdc699b57704407a7cfab191679b34fc2880ee760ec91c';
    }

    throw new Error(
      `non 200 status code received from qredo api: 404, response body: 'Not found`,
    );
  }

  async signTransaction(
    tx: any,
    refreshToken: string,
  ): Promise<TypedTransaction> {
    if (refreshToken === '401') {
      throw new Error(
        `non 200 status code received from qredo api: 401, response body: '{'reason': 'unauthorized'}`,
      );
    }

    if (tx.from !== '0x6f83e67551c5eb8e3f684d2d61f46bf739acb5dc') {
      throw new Error(
        `non 200 status code received from qredo api: 404, response body: 'Not found`,
      );
    }

    const signature =
      '0x02f87583aa36a7808459682f008502c78edb1582520894b449249acbfd518f868d42ef178e1b8da704618587b1a2bc2ec5000080c080a0d92a063aa79a0e393c231ca57aeee5b99a16b1e98245e01face068d070697f08a0576be1c5d8f8a50ae7cbdfc3e2b97b60940e74c3e2b43f0fe4a47ac22f165586';
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

    return TransactionFactory.fromSerializedData(hexToBytes(signature), {
      common,
    });
  }
}
