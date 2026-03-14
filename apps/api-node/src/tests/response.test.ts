/**
 * Unit tests for response helpers.
 */
import { describe, it, expect, vi } from "vitest";
import { ok, created, noContent, paginated, errorResponse } from "../lib/response";

function mockRes() {
  const res = {
    _status: 0,
    _body: null as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

describe("ok", () => {
  it("responds 200 with ok=true and data", () => {
    const res = mockRes();
    ok(res as never, { id: "1" });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ ok: true, data: { id: "1" } });
  });
});

describe("created", () => {
  it("responds 201 with ok=true and data", () => {
    const res = mockRes();
    created(res as never, { id: "2" });
    expect(res._status).toBe(201);
    expect(res._body).toEqual({ ok: true, data: { id: "2" } });
  });
});

describe("noContent", () => {
  it("responds 204 with no body", () => {
    const res = mockRes();
    const endSpy = vi.spyOn(res, "end");
    noContent(res as never);
    expect(res._status).toBe(204);
    expect(endSpy).toHaveBeenCalledOnce();
  });
});

describe("paginated", () => {
  it("responds 200 with data and meta", () => {
    const res = mockRes();
    paginated(res as never, [{ id: "1" }, { id: "2" }], { total: 50, page: 1, pageSize: 20 });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({
      ok: true,
      data: [{ id: "1" }, { id: "2" }],
      meta: { total: 50, page: 1, pageSize: 20 },
    });
  });
});

describe("errorResponse", () => {
  it("responds with given status and error envelope", () => {
    const res = mockRes();
    errorResponse(res as never, 422, "VALIDATION_ERROR", "bad input", { field: "email" });
    expect(res._status).toBe(422);
    expect(res._body).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "bad input", details: { field: "email" } },
    });
  });
});
