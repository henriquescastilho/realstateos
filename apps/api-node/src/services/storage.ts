/**
 * MinIO/S3 storage service for Node.js backend.
 *
 * Thin wrapper around @aws-sdk/client-s3 for object storage:
 * - Multipart upload
 * - Presigned URL generation (download)
 * - Object deletion
 * - Object copy
 *
 * Falls back gracefully if @aws-sdk/client-s3 is not installed.
 *
 * Configuration via environment variables:
 *   S3_ENDPOINT_URL       — MinIO endpoint (http://minio:9000)
 *   S3_ACCESS_KEY_ID      — MinIO access key
 *   S3_SECRET_ACCESS_KEY  — MinIO secret key
 *   S3_BUCKET_NAME        — target bucket
 */

const S3_ENDPOINT = process.env.S3_ENDPOINT_URL ?? "http://localhost:9000";
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY_ID ?? "minioadmin";
const S3_SECRET_KEY = process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin";
const S3_BUCKET = process.env.S3_BUCKET_NAME ?? "realestateos";
const S3_REGION = process.env.S3_REGION ?? "us-east-1";
const PRESIGNED_URL_TTL_SECONDS = 3600;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface UploadResult {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
}

export interface StorageError extends Error {
  code: string;
}

function makeStorageError(message: string, code = "STORAGE_ERROR"): StorageError {
  const err = new Error(message) as StorageError;
  err.code = code;
  return err;
}

// ─── SDK dynamic import ────────────────────────────────────────────────────

// We dynamically require the SDK so the module loads even without it installed.
// This mirrors the Python StorageService fallback pattern.

type S3Client = {
  send(command: unknown): Promise<unknown>;
};

type GetObjectCommandOutput = {
  Body?: { transformToByteArray(): Promise<Uint8Array> };
};

interface S3Module {
  S3Client: new (config: Record<string, unknown>) => S3Client;
  PutObjectCommand: new (params: Record<string, unknown>) => unknown;
  GetObjectCommand: new (params: Record<string, unknown>) => unknown;
  DeleteObjectCommand: new (params: Record<string, unknown>) => unknown;
  CopyObjectCommand: new (params: Record<string, unknown>) => unknown;
  HeadBucketCommand: new (params: Record<string, unknown>) => unknown;
  CreateBucketCommand: new (params: Record<string, unknown>) => unknown;
}

interface PresignModule {
  getSignedUrl: (
    client: S3Client,
    command: unknown,
    options: { expiresIn: number },
  ) => Promise<string>;
}

let _s3Mod: S3Module | null = null;
let _presignMod: PresignModule | null = null;
let _sdkAvailable = false;

try {
  _s3Mod = require("@aws-sdk/client-s3") as S3Module;
  _presignMod = require("@aws-sdk/s3-request-presigner") as PresignModule;
  _sdkAvailable = true;
} catch {
  console.warn(
    "[storage] @aws-sdk/client-s3 not installed — StorageService will throw on use. " +
      "Install with: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner",
  );
}

// ─── StorageService ────────────────────────────────────────────────────────

export class StorageService {
  private client: S3Client | null = null;
  private bucket: string;

  constructor(bucket = S3_BUCKET) {
    this.bucket = bucket;
    if (_sdkAvailable && _s3Mod) {
      this.client = new _s3Mod.S3Client({
        endpoint: S3_ENDPOINT,
        region: S3_REGION,
        credentials: {
          accessKeyId: S3_ACCESS_KEY,
          secretAccessKey: S3_SECRET_KEY,
        },
        // MinIO requires path-style access
        forcePathStyle: true,
      });
    }
  }

  private requireSdk(): void {
    if (!_sdkAvailable || !this.client || !_s3Mod) {
      throw makeStorageError(
        "@aws-sdk/client-s3 is not installed. Cannot perform storage operations.",
        "SDK_MISSING",
      );
    }
  }

  /**
   * Upload binary data to MinIO.
   * @param data     Buffer or Uint8Array to upload
   * @param contentType  MIME type (e.g. "application/pdf")
   * @param key      Object key (path) inside the bucket
   * @returns UploadResult with key, bucket, size, contentType
   */
  async upload(data: Buffer | Uint8Array, contentType: string, key: string): Promise<UploadResult> {
    this.requireSdk();
    const mod = _s3Mod!;
    const client = this.client!;

    await client.send(
      new mod.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        ContentLength: data.length,
      }),
    );

    return { key, bucket: this.bucket, size: data.length, contentType };
  }

  /**
   * Generate a presigned download URL for an object.
   * @param key       Object key
   * @param expiresIn TTL in seconds (default: 3600)
   */
  async presignedUrl(key: string, expiresIn = PRESIGNED_URL_TTL_SECONDS): Promise<string> {
    this.requireSdk();
    const mod = _s3Mod!;
    const presign = _presignMod!;
    const client = this.client!;

    const command = new mod.GetObjectCommand({ Bucket: this.bucket, Key: key });
    return presign.getSignedUrl(client, command, { expiresIn });
  }

  /**
   * Delete an object by key.
   */
  async delete(key: string): Promise<void> {
    this.requireSdk();
    const mod = _s3Mod!;
    const client = this.client!;

    await client.send(new mod.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Copy an object to a new key within the same bucket.
   */
  async copy(sourceKey: string, destKey: string): Promise<void> {
    this.requireSdk();
    const mod = _s3Mod!;
    const client = this.client!;

    await client.send(
      new mod.CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
      }),
    );
  }

  /**
   * Build the canonical object key for a tenant upload.
   * Format: {orgId}/{folder}/{uuid}-{filename}
   */
  static buildKey(orgId: string, folder: string, filename: string): string {
    const uuid = crypto.randomUUID();
    // Sanitize filename
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
    return `${orgId}/${folder}/${uuid}-${safe}`;
  }

  /**
   * Check whether the configured bucket exists (useful for health checks).
   */
  async bucketExists(): Promise<boolean> {
    if (!_sdkAvailable || !this.client || !_s3Mod) return false;
    try {
      await this.client.send(new _s3Mod.HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance for application use
export const storageService = new StorageService();
