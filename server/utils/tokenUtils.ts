
import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import "dotenv/config";

export interface AccessTokenPayload {
  userId: number;
  email: string;
  organizationId: number;
  role: string;
}

const jwtSecret: string = process.env.JWT_SECRET ?? "";

if (!jwtSecret) {
  throw new Error("JWT_SECRET is not configured");
}

const accessTokenExpiry =
  (process.env.ACCESS_TOKEN_EXPIRES_IN || "15m") as SignOptions["expiresIn"];

// Generate JWT access token
export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, jwtSecret, {
    expiresIn: accessTokenExpiry,
  });
}

// Verify JWT access token
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, jwtSecret);

  if (
    typeof decoded === "string" ||
    typeof decoded.userId !== "number" ||
    typeof decoded.organizationId !== "number" ||
    typeof decoded.email !== "string" ||
    typeof decoded.role !== "string"
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    userId: decoded.userId,
    email: decoded.email,
    organizationId: decoded.organizationId,
    role: decoded.role,
  };
}

// Generate an opaque refresh token
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

// Hash refresh token before database storage
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Generate refresh token family ID
export function generateTokenFamilyId(): string {
  return crypto.randomUUID();
}
