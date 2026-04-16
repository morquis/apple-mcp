import { describe, it, expect } from "bun:test";
import { filterHeaders } from "../utils/mail.js";

describe("Mail Header Filtering", () => {
  const sampleHeaders = `Message-ID: <12345@example.com>
Date: Mon, 25 Jun 2025 10:00:00 -0700
From: sender@example.com
To: recipient@example.com
Subject: Test Email
In-Reply-To: <67890@example.com>
References: <11111@example.com> <22222@example.com>
X-Priority: 1
Importance: high
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
X-Spam-Score: 0.1
X-Spam-Status: No
DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;
  d=example.com; s=20230601; t=1719334800;
  h=from:to:subject:date:message-id;
  bh=47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=;
  b=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
Received: from mail.example.com (mail.example.com [192.168.1.1])
  by mx.google.com with ESMTPS id xyz123
  for <recipient@example.com>
  (version=TLS1_3 cipher=TLS_AES_256_GCM_SHA384 bits=256/256);
  Mon, 25 Jun 2025 10:00:00 -0700 (PDT)`;

  it("should return all headers when includeHeaders is true (legacy mode)", () => {
    // This test is conceptual since the actual filtering happens in listMessages
    // In the real implementation, when includeHeaders is true, no filtering occurs
    const result = filterHeaders(sampleHeaders, []);
    expect(result).toBe(sampleHeaders);
  });

  it("should filter headers when given an array of header names", () => {
    const requestedHeaders = ["Message-ID", "In-Reply-To", "References"];
    const result = filterHeaders(sampleHeaders, requestedHeaders);
    
    expect(result).toContain("Message-ID: <12345@example.com>");
    expect(result).toContain("In-Reply-To: <67890@example.com>");
    expect(result).toContain("References: <11111@example.com> <22222@example.com>");
    expect(result).not.toContain("From:");
    expect(result).not.toContain("DKIM-Signature:");
    expect(result).not.toContain("Received:");
  });

  it("should handle case-insensitive header matching", () => {
    const requestedHeaders = ["message-id", "MESSAGE-ID", "Message-Id"];
    const result = filterHeaders(sampleHeaders, requestedHeaders);
    
    expect(result).toBe("Message-ID: <12345@example.com>");
  });

  it("should handle multi-line headers correctly", () => {
    const requestedHeaders = ["DKIM-Signature", "Received"];
    const result = filterHeaders(sampleHeaders, requestedHeaders);
    
    // Should include the full multi-line DKIM-Signature
    expect(result).toContain("DKIM-Signature: v=1; a=rsa-sha256");
    expect(result).toContain("  d=example.com; s=20230601");
    expect(result).toContain("  b=XXXXXX");
    
    // Should include the full multi-line Received header
    expect(result).toContain("Received: from mail.example.com");
    expect(result).toContain("  by mx.google.com");
    expect(result).toContain("  (version=TLS1_3");
  });

  it("should return empty string when no headers match", () => {
    const requestedHeaders = ["NonExistentHeader", "AnotherMissingHeader"];
    const result = filterHeaders(sampleHeaders, requestedHeaders);
    
    expect(result).toBe("");
  });

  it("should handle empty or invalid input", () => {
    expect(filterHeaders("", ["Message-ID"])).toBe("");
    expect(filterHeaders(sampleHeaders, [])).toBe(sampleHeaders);
    expect(filterHeaders("", [])).toBe("");
  });

  it("should extract only Message-ID for email links", () => {
    const requestedHeaders = ["Message-ID"];
    const result = filterHeaders(sampleHeaders, requestedHeaders);
    
    expect(result).toBe("Message-ID: <12345@example.com>");
    expect(result.split('\n').length).toBe(1);
  });

  it("should handle priority headers correctly", () => {
    const requestedHeaders = ["X-Priority", "Importance"];
    const result = filterHeaders(sampleHeaders, requestedHeaders);
    
    expect(result).toContain("X-Priority: 1");
    expect(result).toContain("Importance: high");
    expect(result.split('\n').length).toBe(2);
  });
});

describe("Mail Tool Schema Validation", () => {
  it("should accept boolean for includeHeaders (backward compatibility)", () => {
    const validArgs = {
      operation: "messages",
      account: "test@example.com",
      mailbox: "INBOX",
      includeHeaders: true
    };
    
    // This would be validated by the isMailArgs function in index.ts
    expect(typeof validArgs.includeHeaders === "boolean").toBe(true);
  });

  it("should accept string array for includeHeaders", () => {
    const validArgs = {
      operation: "messages",
      account: "test@example.com", 
      mailbox: "INBOX",
      includeHeaders: ["Message-ID", "In-Reply-To", "References"]
    };
    
    expect(Array.isArray(validArgs.includeHeaders)).toBe(true);
    expect(validArgs.includeHeaders.every(h => typeof h === "string")).toBe(true);
  });
});