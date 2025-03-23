import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits

export const encryptionService = {
  // Generate a unique encryption key for each user
  generateEncryptionKey: () => {
    return crypto.randomBytes(KEY_LENGTH).toString("base64");
  },

  // Encrypt message
  encrypt: (message, key) => {
    const iv = crypto.randomBytes(12); // GCM recommended IV length
    const keyBuffer = Buffer.from(key, "base64");

    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    let encryptedData = cipher.update(message, "utf8");
    encryptedData = Buffer.concat([encryptedData, cipher.final()]);

    const authTag = cipher.getAuthTag();

    return {
      encryptedData: Buffer.concat([encryptedData, authTag]),
      iv: iv,
    };
  },

  // Decrypt message
  decrypt: (encryptedData, iv, key) => {
    const keyBuffer = Buffer.from(key, "base64");
    const authTag = encryptedData.slice(-16); // Last 16 bytes are the auth tag
    const encryptedContent = encryptedData.slice(0, -16);

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedContent);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  },
};
