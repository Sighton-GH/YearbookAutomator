import { useEffect, useState } from "react";
import { withBase } from "../baseUrl";
import { 
  getStoredLicenseKey, 
  setStoredLicenseKey, 
  validateLicenseKey,
  type LicenseValidateResponse 
} from "../licensing";

export function LicensePage() {
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [validationResult, setValidationResult] = useState<LicenseValidateResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [showManagement, setShowManagement] = useState(false);

  useEffect(() => {
    const key = getStoredLicenseKey();
    setCurrentKey(key);
    setKeyInput(key || "");
    if (key) {
      setShowManagement(true);
      void validateCurrentKey(key);
    }
  }, []);

  async function validateCurrentKey(key: string) {
    setIsValidating(true);
    try {
      const result = await validateLicenseKey(key);
      setValidationResult(result);
    } catch {
      setValidationResult({ valid: false, reason: "validation_failed" });
    } finally {
      setIsValidating(false);
    }
  }

  function handleClearKey() {
    if (confirm("Are you sure you want to remove your license key?")) {
      setStoredLicenseKey(null);
      setCurrentKey(null);
      setKeyInput("");
      setValidationResult(null);
      setShowManagement(false);
    }
  }

  return (
    <main className="ss-page document-page">
      <section className="ss-cover simple-cover">
        <div className="ss-cover-inner">
          <h1 className="ss-cover-title">License</h1>
        </div>
      </section>

      <section className="ss-content">
        <div className="ss-content-inner document-content">
          {showManagement && currentKey && (
            <article className="document-article" style={{ marginBottom: "2rem", padding: "1.5rem", background: "var(--bg-panel)", borderRadius: "8px", border: "1px solid var(--border)" }}>
              <h2>License Management</h2>
              
              <div style={{ marginTop: "1rem" }}>
                <h3>Current License Key</h3>
                <div style={{ 
                  padding: "0.75rem", 
                  background: "var(--bg-quiet)", 
                  borderRadius: "4px", 
                  fontFamily: "monospace",
                  wordBreak: "break-all",
                  marginTop: "0.5rem"
                }}>
                  {currentKey}
                </div>
                
                {isValidating && (
                  <p style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>Validating...</p>
                )}
                
                {!isValidating && validationResult && (
                  <div style={{ marginTop: "0.5rem" }}>
                    {validationResult.valid ? (
                      <div style={{ color: "#2e7d32" }}>
                        ✓ Valid {validationResult.license_type || "license"}
                        {validationResult.expires_at && (
                          <span> (expires: {new Date(validationResult.expires_at * 1000).toLocaleDateString()})</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ color: "#d32f2f" }}>
                        ✗ Invalid license ({validationResult.reason || "unknown error"})
                      </div>
                    )}
                  </div>
                )}
                
                <button
                  onClick={handleClearKey}
                  style={{ marginTop: "1rem", padding: "0.5rem 1rem", background: "#d32f2f", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                  Remove License Key
                </button>
              </div>

              <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
                <h3>Step Unlock</h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginTop: "0.5rem" }}>
                  Unlock-all-steps is controlled by your license key (configured in the license admin panel).
                </p>
                <div style={{ marginTop: "0.75rem", fontSize: "0.95rem" }}>
                  {validationResult?.valid && validationResult.unlock_all_steps ? (
                    <span style={{ color: "#2e7d32" }}>✓ This license unlocks all steps</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>This license uses normal step progression</span>
                  )}
                </div>
              </div>
            </article>
          )}

          <article className="document-article">
            <h2>Yearbook Grad Mugshot Automator License</h2>
            <p>Copyright © 2025 Bryan</p>
            <p>This software is free for personal, non-commercial use.</p>
            <p>You may use, copy, and modify this software for your own private, non-commercial purposes at no cost.</p>
            <p>
              Commercial use (including use by businesses, schools, organizations, or for any revenue-generating activity)
              requires a paid commercial license.
            </p>
            <p>
              To obtain a commercial license, please contact:{" "}
              <a href="mailto:your-contact@domain.com">your-contact@domain.com</a>
            </p>
            <p>
              Redistribution of this software, in whole or in part, is not permitted without explicit written permission.
            </p>
            <p>Support and updates are provided only to commercial licensees.</p>
            <p>
              This license is governed by and construed in accordance with the laws of Canada. Any disputes arising from
              this license shall be subject to the exclusive jurisdiction of the courts of Canada.
            </p>
            <h3>Disclaimer</h3>
            <p>
              THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
              TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
              THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
              CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
              DEALINGS IN THE SOFTWARE.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
