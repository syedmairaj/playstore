import { describe, it, expect } from "vitest";
import { extractBearerToken } from "@/lib/supabase/route-auth";

function mockRequest(headers: Record<string, string> = {}, cookies: string[] = []) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? headers[name] ?? null;
      },
    },
    cookies: {
      getAll() {
        return cookies.map((name) => ({ name, value: "x" }));
      },
    },
  } as unknown as import("next/server").NextRequest;
}

describe("route-auth", () => {
  describe("extractBearerToken", () => {
    it("returns token from Authorization header", () => {
      const req = mockRequest({ authorization: "Bearer test-token-123" });
      expect(extractBearerToken(req)).toBe("test-token-123");
    });

    it("returns null when header is missing", () => {
      expect(extractBearerToken(mockRequest())).toBeNull();
    });
  });
});
