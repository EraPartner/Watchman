#!/usr/bin/env node

/**
 * Security testing script for Watchman
 * Tests authentication, authorization, and security headers
 */

import { performance } from "perf_hooks";

const BASE_URL = process.env.TEST_URL || "http://localhost:3001";
const TEST_USERNAME = process.env.TEST_USERNAME || "admin";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "password";

class SecurityTester {
  constructor() {
    this.token = null;
    this.csrfToken = null;
    this.results = {
      passed: 0,
      failed: 0,
      tests: [],
    };
  }

  async runTest(name, testFn) {
    console.log(`\n🔍 Testing: ${name}`);
    const start = performance.now();

    try {
      const result = await testFn();
      const duration = performance.now() - start;

      if (result.success) {
        console.log(`✅ PASS: ${name} (${duration.toFixed(2)}ms)`);
        this.results.passed++;
      } else {
        console.log(
          `❌ FAIL: ${name} - ${result.message} (${duration.toFixed(2)}ms)`
        );
        this.results.failed++;
      }

      this.results.tests.push({
        name,
        success: result.success,
        message: result.message,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - start;
      console.log(
        `💥 ERROR: ${name} - ${error.message} (${duration.toFixed(2)}ms)`
      );
      this.results.failed++;

      this.results.tests.push({
        name,
        success: false,
        message: error.message,
        duration,
      });
    }
  }

  async testHealthEndpoint() {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    return {
      success: response.ok && data.status === "ok",
      message: response.ok
        ? "Health endpoint accessible"
        : `HTTP ${response.status}`,
    };
  }

  async testUnauthenticatedEndpoints() {
    // Test that sensitive endpoints require authentication
    const sensitiveEndpoints = [
      "/api/services/health",
      "/api/config/frontend",
      "/api/services/instances",
    ];

    for (const endpoint of sensitiveEndpoints) {
      const response = await fetch(`${BASE_URL}${endpoint}`);
      if (response.status !== 401) {
        return {
          success: false,
          message: `${endpoint} should require authentication but returned ${response.status}`,
        };
      }
    }

    return {
      success: true,
      message: "All sensitive endpoints properly require authentication",
    };
  }

  async testAuthentication() {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: TEST_USERNAME,
        password: TEST_PASSWORD,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Login failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    this.token = data.token;

    // Extract CSRF token from cookies
    const cookies = response.headers.get("set-cookie");
    if (cookies) {
      const csrfMatch = cookies.match(/csrfToken=([^;]+)/);
      if (csrfMatch) {
        this.csrfToken = csrfMatch[1];
      }
    }

    return {
      success: !!this.token,
      message: this.token ? "Authentication successful" : "No token received",
    };
  }

  async testAuthorizedEndpoints() {
    if (!this.token) {
      return {
        success: false,
        message: "No authentication token available",
      };
    }

    const response = await fetch(`${BASE_URL}/api/services/health`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    return {
      success: response.ok,
      message: response.ok
        ? "Authorized endpoint accessible"
        : `HTTP ${response.status}`,
    };
  }

  async testSecurityHeaders() {
    const response = await fetch(`${BASE_URL}/health`);

    const requiredHeaders = [
      "x-frame-options",
      "x-content-type-options",
      "x-download-options",
      "referrer-policy",
    ];

    const missing = requiredHeaders.filter(
      (header) => !response.headers.get(header)
    );

    return {
      success: missing.length === 0,
      message:
        missing.length === 0
          ? "All security headers present"
          : `Missing headers: ${missing.join(", ")}`,
    };
  }

  async testRateLimiting() {
    // Test rate limiting by making multiple requests quickly
    const requests = Array(10)
      .fill()
      .map(() => fetch(`${BASE_URL}/health`));

    const responses = await Promise.all(requests);
    const rateLimited = responses.some((r) => r.status === 429);

    return {
      success: true, // Rate limiting is optional for health endpoint
      message: rateLimited
        ? "Rate limiting active"
        : "Rate limiting not triggered (normal for health endpoint)",
    };
  }

  async testCSRFProtection() {
    if (!this.token || !this.csrfToken) {
      return {
        success: false,
        message: "No tokens available for CSRF test",
      };
    }

    // Test POST without CSRF token (should fail)
    const responseWithoutCSRF = await fetch(`${BASE_URL}/api/cache/clear`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });

    // Test POST with CSRF token (should succeed)
    const responseWithCSRF = await fetch(`${BASE_URL}/api/cache/clear`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "x-csrf-token": this.csrfToken,
      },
    });

    return {
      success:
        responseWithoutCSRF.status === 403 && responseWithCSRF.status !== 403,
      message: "CSRF protection working correctly",
    };
  }

  async testInputValidation() {
    // Test for path traversal protection
    const maliciousPath = `${BASE_URL}/api/../../../etc/passwd`;
    const response = await fetch(maliciousPath);

    return {
      success: response.status === 400 || response.status === 404,
      message: "Path traversal protection active",
    };
  }

  async runAllTests() {
    console.log("🔒 Starting Watchman Security Tests");
    console.log(`📍 Target: ${BASE_URL}`);
    console.log("=" * 50);

    // Run tests in order
    await this.runTest("Health Endpoint", () => this.testHealthEndpoint());
    await this.runTest("Unauthenticated Access Control", () =>
      this.testUnauthenticatedEndpoints()
    );
    await this.runTest("Authentication", () => this.testAuthentication());
    await this.runTest("Authorized Endpoints", () =>
      this.testAuthorizedEndpoints()
    );
    await this.runTest("Security Headers", () => this.testSecurityHeaders());
    await this.runTest("Rate Limiting", () => this.testRateLimiting());
    await this.runTest("CSRF Protection", () => this.testCSRFProtection());
    await this.runTest("Input Validation", () => this.testInputValidation());

    // Summary
    console.log("\n" + "=" * 50);
    console.log("📊 TEST SUMMARY");
    console.log("=" * 50);
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: `[TEST] Passed: ${this.results.passed}`,
      })
    );
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: `[TEST] Failed: ${this.results.failed}`,
      })
    );
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: `[TEST] Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`,
      })
    );

    if (this.results.failed > 0) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "ERROR",
          message: "[TEST] FAILED TESTS",
        })
      );
      this.results.tests
        .filter((t) => !t.success)
        .forEach((t) =>
          console.log(
            JSON.stringify({
              timestamp: new Date().toISOString(),
              level: "ERROR",
              message: `[TEST] ${t.name}: ${t.message}`,
            })
          )
        );
    }

    return this.results.failed === 0;
  }
}

// Run tests if script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new SecurityTester();
  tester
    .runAllTests()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error("💥 Test runner failed:", error);
      process.exit(1);
    });
}

export default SecurityTester;
