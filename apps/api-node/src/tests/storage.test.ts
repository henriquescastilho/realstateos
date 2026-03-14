/**
 * Unit tests for StorageService.
 * Tests the fallback behaviour (SDK not installed) and key-building utilities.
 */
import { describe, it, expect } from "vitest";
import { StorageService } from "../services/storage";

describe("StorageService.buildKey", () => {
  it("builds a path with orgId/folder/uuid-filename format", () => {
    const key = StorageService.buildKey("org-123", "contracts", "lease.pdf");
    expect(key.startsWith("org-123/contracts/")).toBe(true);
    expect(key.endsWith("-lease.pdf")).toBe(true);
  });

  it("sanitizes special characters in filename", () => {
    const key = StorageService.buildKey("org-1", "uploads", "my file (1).pdf");
    // Spaces and parens should be replaced with underscores
    expect(key).not.toContain(" ");
    expect(key).not.toContain("(");
    expect(key).not.toContain(")");
  });

  it("generates unique keys for same filename", () => {
    const key1 = StorageService.buildKey("org-1", "contracts", "lease.pdf");
    const key2 = StorageService.buildKey("org-1", "contracts", "lease.pdf");
    expect(key1).not.toBe(key2);
  });
});

describe("StorageService — SDK fallback", () => {
  it("upload throws when SDK is missing", async () => {
    // In test env @aws-sdk/client-s3 is not installed so client is null
    const svc = new StorageService();
    await expect(
      svc.upload(Buffer.from("hello"), "application/pdf", "test/key.pdf"),
    ).rejects.toThrow("@aws-sdk/client-s3 is not installed");
  });

  it("presignedUrl throws when SDK is missing", async () => {
    const svc = new StorageService();
    await expect(svc.presignedUrl("test/key.pdf")).rejects.toThrow(
      "@aws-sdk/client-s3 is not installed",
    );
  });

  it("delete throws when SDK is missing", async () => {
    const svc = new StorageService();
    await expect(svc.delete("test/key.pdf")).rejects.toThrow("@aws-sdk/client-s3 is not installed");
  });

  it("bucketExists returns false when SDK is missing", async () => {
    const svc = new StorageService();
    const result = await svc.bucketExists();
    expect(result).toBe(false);
  });
});
