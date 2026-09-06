import { describe, it, expect } from "vitest";
import {
  extractShareUrl,
  sharePendingCookie,
  setPendingShare,
  getPendingShare,
  clearPendingShare,
} from "./share-pending.server";

describe("share-pending.server", () => {
  describe("extractShareUrl", () => {
    it("extracts URL when passed directly via url param", () => {
      const url = extractShareUrl("https://chatgpt.com/share/12345", null);
      expect(url).toBe("https://chatgpt.com/share/12345");
    });

    it("prefers url over text if both are valid URLs", () => {
      const url = extractShareUrl(
        "https://chatgpt.com/share/url-param",
        "Here is a link: https://claude.ai/share/text-param"
      );
      expect(url).toBe("https://chatgpt.com/share/url-param");
    });

    it("extracts the first https URL from text when url param is absent or invalid", () => {
      const text = "Check out this conversation: https://claude.ai/share/abcd-1234 and let me know!";
      const url = extractShareUrl(null, text);
      expect(url).toBe("https://claude.ai/share/abcd-1234");
    });

    it("extracts the first https URL from mixed text containing multiple URLs", () => {
      const text = "First https://first.com/link then second https://second.com/link";
      const url = extractShareUrl("", text);
      expect(url).toBe("https://first.com/link");
    });

    it("ignores invalid schemes like javascript: or ftp: in url and falls back to text or returns undefined", () => {
      const url1 = extractShareUrl("javascript:alert(1)", "Check out https://chatgpt.com/share/valid");
      expect(url1).toBe("https://chatgpt.com/share/valid");

      const url2 = extractShareUrl("ftp://ftp.example.com", "No links here");
      expect(url2).toBeUndefined();
    });

    it("returns undefined when neither url nor text contains an http/https URL", () => {
      expect(extractShareUrl("", "Just plain text without any links")).toBeUndefined();
      expect(extractShareUrl(null, null)).toBeUndefined();
    });
  });

  describe("cookie lifecycle", () => {
    it("serializes, parses, and clears pending share cookie", async () => {
      const payload = {
        url: "https://chatgpt.com/share/test",
        title: "Test Chat",
        text: "Some text",
      };

      const setCookieHeader = await setPendingShare(payload);
      expect(setCookieHeader).toContain("__share_pending=");

      // Extract cookie value to simulate request
      const cookieValue = setCookieHeader.split(";")[0];
      const req = new Request("http://localhost/app/share", {
        headers: {
          Cookie: cookieValue,
        },
      });

      const parsed = await getPendingShare(req);
      expect(parsed).toEqual(payload);

      const clearHeader = await clearPendingShare();
      expect(clearHeader).toContain("__share_pending=;");
      expect(clearHeader).toContain("Max-Age=0");
    });
  });
});
