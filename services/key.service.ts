import crypto from "crypto";

class KeyExchangeService {
  private tempKeys: Map<string, any>;

  constructor() {
    this.tempKeys = new Map(); // Store temporary keys during exchange process
  }

  // Generate DH keys for a user
  generateKeyPair() {
    const dhGroup = crypto.createDiffieHellman(2048);
    dhGroup.generateKeys();

    return {
      privateKey: dhGroup.getPrivateKey("base64"),
      publicKey: dhGroup.getPublicKey("base64"),
      prime: dhGroup.getPrime("base64"),
      generator: dhGroup.getGenerator("base64"),
    };
  }

  // Generate shared secret from public and private keys
  computeSharedSecret(
    myPrivateKey: string,
    theirPublicKey: string,
    prime: string,
    generator: string
  ) {
    const dh = crypto.createDiffieHellman(
      Buffer.from(prime, "base64"),
      Buffer.from(generator, "base64")
    );

    dh.setPrivateKey(Buffer.from(myPrivateKey, "base64"));
    const sharedSecret = dh.computeSecret(
      Buffer.from(theirPublicKey, "base64")
    );

    // Derive a symmetric key from the shared secret using HKDF
    const symmetricKey = crypto
      .createHmac("sha256", "salt")
      .update(sharedSecret)
      .digest("base64");

    return symmetricKey;
  }

  // Store temporary keys during exchange
  storeTempKeys(userId: string, keys: any) {
    this.tempKeys.set(userId, keys);
  }

  // Get and remove temporary keys
  getTempKeys(userId: string) {
    const keys = this.tempKeys.get(userId);
    this.tempKeys.delete(userId);
    return keys;
  }
}

export const keyExchangeService = new KeyExchangeService();
