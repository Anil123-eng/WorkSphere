
import { createHmac } from "crypto";
import { verifyWebhookSignature } from "../utils/webhookUtils";

describe("Webhook signature verification", () => {
  const secret = `whsec_${Buffer.from("test-webhook-secret").toString("base64")}`;
  const messageId = "msg_test_123";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = Buffer.from(
    JSON.stringify({ type: "email.delivered" })
  );

  function createSignature(
    body: Buffer,
    id: string,
    time: string
  ) {
    const key = Buffer.from(secret.slice(6), "base64");
    const signedContent = `${id}.${time}.${body.toString("utf8")}`;

    return `v1,${createHmac("sha256", key)
      .update(signedContent)
      .digest("base64")}`;
  }

  test("accepts a valid signature", () => {
    const signature = createSignature(rawBody, messageId, timestamp);

    expect(
      verifyWebhookSignature(
        rawBody,
        messageId,
        timestamp,
        signature,
        secret
      )
    ).toBe(true);
  });

  test("rejects an invalid signature", () => {
    expect(
      verifyWebhookSignature(
        rawBody,
        messageId,
        timestamp,
        "v1,invalid-signature",
        secret
      )
    ).toBe(false);
  });

  test("rejects an expired timestamp", () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const signature = createSignature(rawBody, messageId, oldTimestamp);

    expect(
      verifyWebhookSignature(
        rawBody,
        messageId,
        oldTimestamp,
        signature,
        secret
      )
    ).toBe(false);
  });

  test("rejects missing signature headers", () => {
    expect(
      verifyWebhookSignature(
        rawBody,
        undefined,
        timestamp,
        undefined,
        secret
      )
    ).toBe(false);
  });
});
