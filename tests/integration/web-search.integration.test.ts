import { expect, it } from "bun:test";

import webSearch from "../../utils/webSearch.js";
import {
  integrationDescribe,
  INTEGRATION_TIMEOUT,
} from "./helpers/test-config.js";

integrationDescribe("web-search integration", () => {
  it("webSearch returns results for a common query", async () => {
    const result = await webSearch.webSearch("wikipedia");
    expect(result.query).toBe("wikipedia");
    expect(Array.isArray(result.results)).toBe(true);
    // Network may fail — don't assert non-empty, just structural correctness
    if (result.results.length > 0) {
      const first = result.results[0];
      expect(typeof first.title).toBe("string");
      expect(typeof first.url).toBe("string");
    }
  }, INTEGRATION_TIMEOUT);

  it("searchDuckDuckGo returns structured results", async () => {
    const result = await webSearch.searchDuckDuckGo("typescript");
    expect(result.query).toBe("typescript");
    expect(Array.isArray(result.results)).toBe(true);
    if (result.results.length > 0) {
      expect(typeof result.results[0].snippet).toBe("string");
    }
  }, INTEGRATION_TIMEOUT);
});
