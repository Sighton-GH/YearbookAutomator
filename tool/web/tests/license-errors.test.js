import test from "node:test";
import assert from "node:assert/strict";
import {
  licenseFailureMessage, formatLockCountdown, takeoverFailureMessage,
  LICENSE_KEY_INVALID_MESSAGE, LICENSE_SERVER_UNREACHABLE_MESSAGE,
} from "../src/utils/licenseErrors.ts";

test("4xx is a key problem", () => {
  assert.equal(licenseFailureMessage("http_400"), LICENSE_KEY_INVALID_MESSAGE);
  assert.equal(licenseFailureMessage("http_404"), LICENSE_KEY_INVALID_MESSAGE);
});
test("5xx is a server problem and never shows a raw code", () => {
  for (const r of ["http_500", "http_502", "http_503"]) {
    const msg = licenseFailureMessage(r);
    assert.equal(msg, LICENSE_SERVER_UNREACHABLE_MESSAGE);
    assert.ok(!/http_|500/.test(msg));
  }
});
test("other / missing reasons fall back to key message", () => {
  assert.equal(licenseFailureMessage("expired"), LICENSE_KEY_INVALID_MESSAGE);
  assert.equal(licenseFailureMessage(null), LICENSE_KEY_INVALID_MESSAGE);
});
test("countdown format", () => {
  assert.equal(formatLockCountdown(0), "0:00");
  assert.equal(formatLockCountdown(-5), "0:00");
  assert.equal(formatLockCountdown(61_000), "1:01");
  assert.equal(formatLockCountdown(59_001), "1:00");
});
test("takeover messages", () => {
  assert.match(takeoverFailureMessage(401), /isn't available/);
  assert.match(takeoverFailureMessage(400), /isn't enabled/);
  assert.match(takeoverFailureMessage(500), /Couldn't take over/);
  assert.match(takeoverFailureMessage(undefined), /Couldn't take over/);
});
