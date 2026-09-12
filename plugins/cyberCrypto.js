import crypto from 'crypto';

export default {
  id: 'cyber_crypto',
  name: 'Tactical Cyber Cryptography',
  description:
    'Cryptographic utility for generating secure tactical hashes (SHA-256, MD5, SHA-512), verifying checksums, or Base64 encoding/decoding payloads.',
  parameters: {
    type: 'OBJECT',
    properties: {
      operation: {
        type: 'STRING',
        description: 'Operation to perform: hash, base64_encode, or base64_decode.',
        enum: ['hash', 'base64_encode', 'base64_decode'],
      },
      data: {
        type: 'STRING',
        description: 'The plaintext, payload, or ciphertext string to process.',
      },
      algorithm: {
        type: 'STRING',
        description: 'Hashing algorithm for hash operation: sha256, md5, or sha512.',
        enum: ['sha256', 'md5', 'sha512'],
      },
    },
    required: ['operation', 'data'],
  },
  execute: async (args = {}) => {
    const operation = (args.operation || 'hash').toLowerCase();
    const data = args.data || '';
    const algorithm = (args.algorithm || 'sha256').toLowerCase();

    if (!data) {
      throw new Error('Data payload cannot be empty.');
    }

    if (operation === 'base64_encode') {
      const encoded = Buffer.from(data, 'utf-8').toString('base64');
      return {
        operation: 'BASE64_ENCODE',
        inputLength: data.length,
        result: encoded,
        timestamp: new Date().toISOString(),
      };
    }

    if (operation === 'base64_decode') {
      const decoded = Buffer.from(data, 'base64').toString('utf-8');
      return {
        operation: 'BASE64_DECODE',
        inputLength: data.length,
        result: decoded,
        timestamp: new Date().toISOString(),
      };
    }

    // Default: Hashing
    const hash = crypto.createHash(algorithm).update(data, 'utf-8').digest('hex');
    return {
      operation: 'HASH',
      algorithm: algorithm.toUpperCase(),
      inputLength: data.length,
      hash,
      timestamp: new Date().toISOString(),
    };
  },
};

