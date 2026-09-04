import { describe, it, expect } from "vitest";
import { detectProvider, isAllowedShareUrl, ALLOWED_HOSTS } from "./share-url";

describe("share-url", () => {
  it("detects ChatGPT share URLs", () => {
    expect(detectProvider("https://chatgpt.com/share/6745ed36-9acc-800e-8a90-59204bd13444")).toBe("chatgpt");
    expect(detectProvider("https://chat.openai.com/share/6745ed36-9acc-800e-8a90-59204bd13444")).toBe("chatgpt");
    expect(detectProvider("HTTP://CHATGPT.COM/share/123")).toBe("chatgpt");
  });

  it("detects Claude share URLs", () => {
    expect(detectProvider("https://claude.ai/share/8807c67a-750f-4ba7-a719-7d57df697456")).toBe("claude");
    expect(detectProvider("https://claude.ai/chat/123")).toBe("claude");
  });

  it("rejects unauthorized and malicious hosts", () => {
    expect(detectProvider("https://subdomain.chatgpt.com/share/123")).toBeNull();
    expect(detectProvider("https://chatgpt.com.attacker.com/share/123")).toBeNull();
    expect(detectProvider("https://evil-claude.ai/share/123")).toBeNull();
    expect(detectProvider("https://example.com/share/123")).toBeNull();
    expect(detectProvider("https://google.com")).toBeNull();
  });

  it("rejects malformed URLs and non-string inputs", () => {
    expect(detectProvider("")).toBeNull();
    expect(detectProvider("not a url")).toBeNull();
    expect(detectProvider("ftp://chatgpt.com/share/123")).toBeNull();
    // @ts-expect-error test non-string runtime values
    expect(detectProvider(null)).toBeNull();
    // @ts-expect-error test undefined
    expect(detectProvider(undefined)).toBeNull();
  });

  it("validates allowlist matching", () => {
    expect(isAllowedShareUrl("https://chatgpt.com/share/123")).toBe(true);
    expect(isAllowedShareUrl("https://claude.ai/share/123")).toBe(true);
    expect(isAllowedShareUrl("https://unknown.com/share/123")).toBe(false);
    expect(ALLOWED_HOSTS).toContain("chatgpt.com");
    expect(ALLOWED_HOSTS).toContain("chat.openai.com");
    expect(ALLOWED_HOSTS).toContain("claude.ai");
  });
});
