
import { createHmac, timingSafeEqual } from "crypto";

export function verifyWebhookSignature(
  rawBody: Buffer,
  messageId: string | undefined,
  timestamp: string | undefined,
  signature: string | undefined,
  secret: string
): boolean {
  if (
    !rawBody.length ||
    !messageId ||
    !timestamp ||
    !signature ||
    !secret
  ) {
    return false;
  }

  const timestampNumber = Number(timestamp);

  if (
    !Number.isInteger(timestampNumber) ||
    Math.abs(Date.now() / 1000 - timestampNumber) > 300
  ) {
    return false;
  }

  const encodedSecret = secret.startsWith("whsec_")
    ? secret.slice(6)
    : secret;

  const key = Buffer.from(encodedSecret, "base64");

  if (!key.length) {
    return false;
  }

  const signedContent =
    `${messageId}.${timestamp}.${rawBody.toString("utf8")}`;

  const expectedSignature = createHmac("sha256", key)
    .update(signedContent)
    .digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");

    if (version !== "v1" || !value) {
      return false;
    }

    const receivedSignature = Buffer.from(value, "base64");

    return (
      receivedSignature.length === expectedSignature.length &&
      timingSafeEqual(receivedSignature, expectedSignature)
    );
  });
}
