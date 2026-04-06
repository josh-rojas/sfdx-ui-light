# SF Toolkit - Security Analysis & Best Practices

Comprehensive security analysis covering authentication, data storage, CSP policies, and Chrome extension security for SF Toolkit.

---

## Table of Contents

1. [Security Overview](#security-overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Data Storage Security](#data-storage-security)
4. [Chrome Extension Security](#chrome-extension-security)
5. [Content Security Policy (CSP)](#content-security-policy-csp)
6. [API Security](#api-security)
7. [XSS Prevention](#xss-prevention)
8. [Data Privacy](#data-privacy)
9. [Security Audit Findings](#security-audit-findings)
10. [Security Checklist](#security-checklist)
11. [Incident Response](#incident-response)

---

## Security Overview

### Threat Model

SF Toolkit handles sensitive Salesforce credentials and organizational data. Key security concerns:

**Assets to Protect:**
- OAuth tokens (access_token, refresh_token)
- Salesforce session IDs
- User credentials (if using username/password flow)
- Salesforce org data (metadata, records, permissions)
- API keys (OpenAI, external services)

**Threat Actors:**
- Malicious Chrome extensions
- Man-in-the-middle (MITM) attacks
- XSS attacks via injected scripts
- Compromised Salesforce orgs
- Malicious npm packages

**Attack Surfaces:**
- Chrome storage (local/sync)
- Web application localStorage/sessionStorage
- Network traffic (HTTP/HTTPS)
- Content scripts in Salesforce pages
- Server-side API endpoints
- Third-party dependencies

---

## Authentication & Authorization

### OAuth 2.0 Flow

**Current Implementation:**

Location: `src/client/lwc/modules/connection/utils/credentialStrategies/oauth.js`

```javascript
const FULL_SCOPE = 'id api web openid sfap_api einstein_gpt_api refresh_token';
```

**Security Analysis:**

✅ **Strengths:**
- Uses OAuth 2.0 (industry standard)
- Requests `refresh_token` for long-term access
- Implements PKCE (Proof Key for Code Exchange) - *Verify in implementation*

⚠️ **Concerns:**
- **Broad Scopes**: Requests `api` (full API access) and `web` (full web access)
  - **Recommendation**: Use least privilege principle - only request scopes needed for each feature
  - Example: `api` for API operations, `web` for frontdoor URLs, `einstein_gpt_api` only if using Einstein

🔴 **Critical Issues:**

1. **Token Storage Location** (HIGH RISK):
   ```javascript
   // Current: chrome.storage.local (unencrypted)
   chrome.storage.local.get(['credentials'], (data) => {
     // Tokens stored in plaintext
   });
   ```

   **Risk**: Chrome extensions can access `chrome.storage.local` if they request the `storage` permission. Tokens are NOT encrypted at rest.

   **Mitigation:**
   - Use `chrome.storage.session` for short-lived tokens (Chrome 102+)
   - Encrypt sensitive data before storing:
     ```javascript
     import { encrypt, decrypt } from './crypto';

     const encryptedToken = await encrypt(accessToken, userPassword);
     await chrome.storage.local.set({ token: encryptedToken });
     ```
   - Consider using Web Crypto API for encryption

2. **Token Transmission** (MEDIUM RISK):
   - Tokens sent via `postMessage` for cross-origin communication
   - **Risk**: Other extensions can listen to messages
   - **Mitigation**: Use `targetOrigin` parameter in `postMessage`:
     ```javascript
     window.postMessage({ token }, 'https://sf-toolkit.com');
     ```

3. **Refresh Token Rotation** (LOW RISK):
   - No evidence of refresh token rotation
   - **Recommendation**: Implement rotation on each refresh to limit exposure window

**Secure OAuth Implementation:**

```javascript
// Recommended implementation
class SecureOAuthHandler {
  async authorize() {
    // 1. Generate PKCE challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);

    // 2. Request authorization with PKCE
    const authUrl = `${loginUrl}/services/oauth2/authorize?` +
      `response_type=code&` +
      `client_id=${clientId}&` +
      `redirect_uri=${redirectUri}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256&` +
      `scope=${MINIMAL_SCOPE}`;  // Use minimal scopes

    // 3. Exchange code for tokens (server-side preferred)
    const tokens = await this.exchangeCodeForTokens(code, codeVerifier);

    // 4. Encrypt tokens before storage
    const encryptedTokens = await this.encryptTokens(tokens);
    await chrome.storage.local.set({ tokens: encryptedTokens });
  }

  async refreshAccessToken() {
    // Implement refresh token rotation
    const newTokens = await fetch('/oauth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: oldRefreshToken })
    });

    // Store new refresh token, invalidate old one
    await this.updateTokens(newTokens);
  }
}
```

### Username/Password Flow

**Location:** `src/client/lwc/modules/connection/utils/credentialStrategies/usernamePassword.js`

🔴 **CRITICAL SECURITY ISSUE**:
- Username/password flow is **deprecated** by Salesforce
- Passwords transmitted over network (even if HTTPS)
- No MFA support

**Recommendation:**
- **Disable username/password flow entirely**
- Force users to use OAuth 2.0
- If must support: Use only for sandbox/dev orgs, add prominent security warning

### Session Tokens

**Location:** `src/client/lwc/modules/connection/utils/credentialStrategies/session.js`

- Users can manually provide session IDs
- **Risk**: Session hijacking if user copies session from insecure source
- **Mitigation**: Add warning about session expiration and security implications

---

## Data Storage Security

### Chrome Storage API

**Current Usage:**

```javascript
// src/client/assets/libs/localforage/drivers/chrome.js
chrome.storage.local.set({ [key]: value }, callback);
chrome.storage.local.get([key], callback);
```

**Storage Types:**

| Type | Security | Capacity | Sync | Use Case |
|------|----------|----------|------|----------|
| `chrome.storage.local` | ⚠️ Unencrypted | 10MB | ❌ | Large data, device-specific |
| `chrome.storage.sync` | ⚠️ Unencrypted | 100KB | ✅ | Small data, multi-device |
| `chrome.storage.session` | ⚠️ Unencrypted | 10MB | ❌ | Session-only (Chrome 102+) |

**Security Analysis:**

🔴 **Critical Vulnerabilities:**

1. **No Encryption at Rest:**
   - All data in `chrome.storage.local` is stored in plaintext
   - Location: `%APPDATA%\Local\Google\Chrome\User Data\Default\Local Storage\` (Windows)
   - Other extensions with `storage` permission can access this data

2. **Cross-Extension Access:**
   - Malicious extensions can read storage if they declare `storage` permission
   - **Mitigation**: Encrypt sensitive data before storing

3. **Sync Storage Risks:**
   - `chrome.storage.sync` syncs across all user's devices
   - Data passes through Google's servers
   - **Recommendation**: NEVER store tokens or credentials in sync storage

**Secure Storage Implementation:**

```javascript
// utils/secureStorage.js
import { subtle } from 'crypto';

class SecureStorage {
  constructor() {
    this.SALT_KEY = 'sf-toolkit-salt';
    this.IV_KEY = 'sf-toolkit-iv';
  }

  async deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encrypt(data, userPin) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(JSON.stringify(data));

    // Generate salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Derive key from user PIN
    const key = await this.deriveKey(userPin, salt);

    // Encrypt data
    const encryptedData = await subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBuffer
    );

    // Store salt and IV for decryption
    await chrome.storage.local.set({
      [this.SALT_KEY]: Array.from(salt),
      [this.IV_KEY]: Array.from(iv)
    });

    return {
      encrypted: Array.from(new Uint8Array(encryptedData)),
      salt: Array.from(salt),
      iv: Array.from(iv)
    };
  }

  async decrypt(encryptedData, userPin) {
    // Retrieve salt and IV
    const { [this.SALT_KEY]: salt, [this.IV_KEY]: iv } =
      await chrome.storage.local.get([this.SALT_KEY, this.IV_KEY]);

    // Derive key
    const key = await this.deriveKey(userPin, new Uint8Array(salt));

    // Decrypt data
    const decryptedData = await subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(encryptedData.encrypted)
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decryptedData));
  }

  async setSecureItem(key, value, userPin) {
    const encrypted = await this.encrypt(value, userPin);
    await chrome.storage.local.set({ [key]: encrypted });
  }

  async getSecureItem(key, userPin) {
    const { [key]: encryptedData } = await chrome.storage.local.get(key);
    if (!encryptedData) return null;
    return await this.decrypt(encryptedData, userPin);
  }
}

export const secureStorage = new SecureStorage();
```

**Usage:**

```javascript
// Store credentials securely
const userPin = await promptForPin();  // Ask user for PIN/password
await secureStorage.setSecureItem('credentials', {
  accessToken: 'xxx',
  refreshToken: 'yyy'
}, userPin);

// Retrieve credentials
const credentials = await secureStorage.getSecureItem('credentials', userPin);
```

**Best Practices:**

1. ✅ **Encrypt sensitive data** (tokens, credentials) before storage
2. ✅ **Use `chrome.storage.session`** for temporary tokens (Chrome 102+)
3. ✅ **Never store plaintext passwords**
4. ✅ **Implement token expiration checks**
5. ✅ **Clear storage on logout**
6. ❌ **Never use `chrome.storage.sync` for credentials**
7. ❌ **Never use localStorage for extension** (accessible to web pages)

### Web Application Storage

**Current Usage:**

- `localStorage`: Used in web app for non-sensitive data
- `sessionStorage`: Session-specific data

**Security Issues:**

1. **localStorage Persistence:**
   - Data persists even after browser close
   - Accessible via JavaScript (XSS risk)
   - **Recommendation**: Use sessionStorage for sensitive data

2. **No Encryption:**
   - Data stored in plaintext
   - **Mitigation**: Encrypt before storing, same as Chrome storage

3. **Cross-Site Scripting (XSS) Risk:**
   - If XSS vulnerability exists, attacker can read all storage
   - **Mitigation**: Implement strict CSP (see CSP section)

---

## Chrome Extension Security

### Manifest V3 Security

**Current Manifest:** `/manifest.json`

```json
{
  "manifest_version": 3,
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  },
  "permissions": [
    "identity", "cookies", "storage", "tabs", "tabGroups",
    "sidePanel", "contextMenus", "unlimitedStorage",
    "activeTab", "scripting"
  ],
  "host_permissions": ["<all_urls>"]
}
```

**Security Analysis:**

✅ **Strengths:**
- Uses Manifest V3 (more secure than V2)
- Service worker instead of background page
- Declarative permissions

⚠️ **Concerns:**

1. **`'wasm-unsafe-eval'` in CSP** (MEDIUM RISK):
   - Allows WebAssembly execution
   - Required for: OpenAI worker, possibly Monaco Editor
   - **Risk**: If dependency is compromised, could execute arbitrary code
   - **Mitigation**:
     - Audit all WASM dependencies
     - Consider removing if not strictly necessary
     - Use subresource integrity (SRI) for external resources

2. **`host_permissions: ["<all_urls>"]`** (HIGH RISK):
   - Extension can access ALL websites
   - **Risk**: Over-permissioned, potential for abuse
   - **Mitigation**: Limit to specific domains:
     ```json
     "host_permissions": [
       "https://*.salesforce.com/*",
       "https://*.force.com/*",
       "https://sf-toolkit.com/*"
     ]
     ```

3. **Broad Permissions:**
   - `storage`: Can access all extension storage
   - `tabs`: Can read tab URLs and titles
   - `cookies`: Can read all cookies
   - `scripting`: Can inject scripts into any page
   - **Recommendation**: Use `activeTab` instead of `tabs` where possible

### Content Script Security

**Current Implementation:**

```json
"content_scripts": [{
  "matches": [
    "https://*.sf-toolkit.com/*",
    "http://localhost:3000/*"
  ],
  "run_at": "document_end",
  "js": ["scripts/inject_toolkit.js"]
}]
```

**Security Analysis:**

✅ **Good**: Limited to specific domains

⚠️ **Concerns:**

1. **Content Script Injection:**
   - Content scripts run in page context
   - Can access page DOM and inject code
   - **Risk**: If content script has XSS vulnerability, can compromise page
   - **Mitigation**:
     - Sanitize all user inputs
     - Use `textContent` instead of `innerHTML`
     - Validate all messages from page

2. **Message Passing Security:**
   ```javascript
   // INSECURE - no origin check
   window.addEventListener('message', (event) => {
     const data = event.data;  // Trust any message
   });

   // SECURE - validate origin
   window.addEventListener('message', (event) => {
     if (event.origin !== 'https://sf-toolkit.com') return;
     // Process trusted message
   });
   ```

### Web-Accessible Resources

```json
"web_accessible_resources": [{
  "matches": ["<all_urls>"],
  "resources": [
    "scripts/*", "assets/*", "styles/*", "libs/*",
    "views/*", "openai/index.js", "workers/openaiWorker/worker.js"
  ]
}]
```

**Security Issues:**

🔴 **HIGH RISK**: Web-accessible resources can be loaded by ANY website.

**Attack Scenario:**
1. Malicious website detects SF Toolkit extension
2. Loads `chrome-extension://<extension-id>/scripts/background.js`
3. Exploits vulnerabilities in exposed scripts

**Mitigation:**

1. **Limit matches to specific origins:**
   ```json
   "matches": [
     "https://*.salesforce.com/*",
     "https://sf-toolkit.com/*"
   ]
   ```

2. **Minimize exposed resources**:
   - Only expose resources truly needed by web pages
   - Never expose background scripts

3. **Add integrity checks**:
   ```javascript
   // In exposed resources
   if (chrome.runtime.id !== EXPECTED_EXTENSION_ID) {
     throw new Error('Unauthorized access');
   }
   ```

---

## Content Security Policy (CSP)

### Current CSP

**Extension Pages:**
```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self';
```

**Web App:** (Check server configuration)

### CSP Analysis

⚠️ **Issues:**

1. **`'wasm-unsafe-eval'` Allows WASM Execution:**
   - Required for: OpenAI worker (likely)
   - **Risk**: If WASM module compromised, arbitrary code execution
   - **Recommendation**: Audit all WASM usage

2. **Missing Directives:**
   - `default-src`: Not specified (defaults to 'self')
   - `connect-src`: Not specified (allows connections to any domain)
   - `img-src`: Not specified
   - `style-src`: Not specified

**Recommended CSP:**

```json
"content_security_policy": {
  "extension_pages": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://*.salesforce.com https://*.force.com https://api.openai.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; form-action 'none';"
}
```

### Web App CSP

**Server-Side CSP Headers:**

```javascript
// src/server/server-prod.js
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +  // LWC requires unsafe-eval
    "connect-src 'self' https://*.salesforce.com https://*.force.com https://api.openai.com; " +
    "img-src 'self' data: https:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "font-src 'self' data:; " +
    "frame-ancestors 'none';"
  );
  next();
});
```

**Note**: LWC framework requires `'unsafe-eval'` for dynamic component loading. This is a known limitation.

---

## API Security

### Server-Side API Endpoints

**Current Implementation:** `src/server/server-dev.js`, `src/server/server-prod.js`

**Security Analysis:**

1. **OAuth Callback Handler:**
   ```javascript
   app.get('/oauth2/callback', async (req, res) => {
     const { code } = req.query;
     // Exchange code for tokens
   });
   ```

   **Issues:**
   - No state parameter validation (CSRF risk)
   - No rate limiting

   **Secure Implementation:**
   ```javascript
   app.get('/oauth2/callback', async (req, res) => {
     const { code, state } = req.query;

     // 1. Validate state (CSRF protection)
     const storedState = req.session.oauthState;
     if (!state || state !== storedState) {
       return res.status(400).send('Invalid state');
     }

     // 2. Exchange code for tokens
     const tokens = await exchangeCode(code);

     // 3. Clear state
     delete req.session.oauthState;

     res.send('Success');
   });
   ```

2. **Proxy Endpoint:**
   ```javascript
   // src/server/modules/proxy.js
   app.post('/api/proxy', async (req, res) => {
     const { url, method, body } = req.body;
     // Forward request to Salesforce
   });
   ```

   **Issues:**
   - **SSRF Risk**: Server-Side Request Forgery
   - No URL validation
   - Could be used to access internal services

   **Mitigation:**
   ```javascript
   const ALLOWED_HOSTS = [
     'salesforce.com',
     'force.com',
     'salesforce-sites.com'
   ];

   app.post('/api/proxy', async (req, res) => {
     const { url } = req.body;

     // Validate URL
     const parsedUrl = new URL(url);
     if (!ALLOWED_HOSTS.some(host => parsedUrl.hostname.endsWith(host))) {
       return res.status(400).send('Invalid URL');
     }

     // Forward request
   });
   ```

3. **OpenAI Proxy:**
   ```javascript
   // src/server/modules/openaiProxy.js
   ```

   **Issues:**
   - API key exposure risk
   - No rate limiting
   - Cost control

   **Mitigation:**
   - Implement rate limiting per user
   - Set usage quotas
   - Monitor costs
   - Validate/sanitize all inputs

### Rate Limiting

**Recommended Implementation:**

```javascript
const rateLimit = require('express-rate-limit');

// Apply to OAuth endpoints
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,  // Limit each IP to 10 requests per window
  message: 'Too many authorization attempts'
});

app.use('/oauth2/', oauthLimiter);

// Apply to proxy endpoints
const proxyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 60,  // 60 requests per minute
  message: 'Too many requests'
});

app.use('/api/proxy', proxyLimiter);
```

---

## XSS Prevention

### Current XSS Vulnerabilities

**Grep Results:** Found multiple uses of potentially dangerous functions:

1. **`innerHTML` Usage:**
   - Location: Multiple LWC components
   - **Risk**: If user input is inserted via innerHTML, XSS possible
   - **Audit Required**: Search for all `innerHTML` usage and ensure sanitization

2. **`eval()` Usage:**
   - Location: Third-party libraries (Prism.js, require.js, JSZip)
   - **Risk**: Arbitrary code execution if input not sanitized
   - **Mitigation**: Update libraries, avoid eval in custom code

### XSS Prevention Techniques

**1. Use `textContent` Instead of `innerHTML`:**

```javascript
// INSECURE
element.innerHTML = userInput;

// SECURE
element.textContent = userInput;
```

**2. Sanitize HTML with DOMPurify:**

```javascript
import DOMPurify from 'dompurify';

// Sanitize before insertion
element.innerHTML = DOMPurify.sanitize(userInput);
```

**3. LWC Template Binding (Automatic Escaping):**

```html
<!-- LWC automatically escapes this -->
<div>{userInput}</div>

<!-- Dangerous: unescaped HTML -->
<div lwc:dom="manual"></div>
```

**4. Monaco Editor Security:**

- Monaco Editor allows arbitrary JavaScript execution (by design)
- **Mitigation**: Run in sandboxed iframe or web worker
- Validate all code before execution

### SOQL Injection Prevention

**Current Implementation:** SOQL builder in `src/client/lwc/applications/tools/soql/`

**Risks:**
- User-controlled SOQL queries
- Potential for unauthorized data access

**Mitigation:**

```javascript
// Validate field names against schema
function validateQuery(query, objectSchema) {
  const parser = new SOQLParser();
  const ast = parser.parse(query);

  // Check all fields exist in schema
  for (const field of ast.fields) {
    if (!objectSchema.fields[field]) {
      throw new Error(`Invalid field: ${field}`);
    }
  }

  return query;
}

// Escape user inputs in WHERE clauses
function escapeString(value) {
  return value.replace(/'/g, "\\'");
}
```

---

## Data Privacy

### Sensitive Data Handling

**Types of Sensitive Data:**

1. **Credentials:**
   - Access tokens, refresh tokens
   - Session IDs
   - API keys

2. **Salesforce Org Data:**
   - User records
   - Permission sets
   - Metadata
   - Custom objects

3. **Personal Information:**
   - User emails, names
   - IP addresses (in logs)

### Data Retention

**Current State:** No explicit data retention policy

**Recommendations:**

1. **Tokens:**
   - Clear on logout
   - Implement token expiration (max 24 hours)
   - Auto-refresh before expiration

2. **Cached Data:**
   - Clear on org switch
   - Implement TTL (Time-To-Live) for cached metadata
   - Never cache sensitive records

3. **Logs:**
   - Never log credentials or tokens
   - Sanitize logs before sending to analytics
   - Implement log rotation

### GDPR Compliance

**Required Actions:**

1. ✅ **Data Access Request**: Allow users to export their data
2. ✅ **Data Deletion Request**: Allow users to delete all stored data
3. ✅ **Consent**: Require explicit consent for data collection
4. ✅ **Privacy Policy**: Document what data is collected and why

**Implementation:**

```javascript
// Add to settings page
async function exportUserData() {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  // Trigger download
}

async function deleteAllData() {
  await chrome.storage.local.clear();
  await chrome.storage.sync.clear();
  // Clear cookies, cache, etc.
}
```

---

## Security Audit Findings

### High Priority Issues

1. 🔴 **Unencrypted Token Storage** (CRITICAL)
   - Tokens stored in plaintext in chrome.storage.local
   - **Impact**: Token theft by malicious extensions
   - **Fix**: Implement encryption (see Secure Storage section)

2. 🔴 **Over-Permissioned Extension** (HIGH)
   - `host_permissions: ["<all_urls>"]`
   - **Impact**: Extension can access all websites
   - **Fix**: Limit to Salesforce domains only

3. 🔴 **Missing CSRF Protection** (HIGH)
   - OAuth flow doesn't validate state parameter
   - **Impact**: CSRF attacks on OAuth callback
   - **Fix**: Implement state parameter validation

4. 🔴 **SSRF Vulnerability in Proxy** (HIGH)
   - No URL validation in proxy endpoint
   - **Impact**: Access to internal services
   - **Fix**: Whitelist allowed hosts

### Medium Priority Issues

5. ⚠️ **Broad OAuth Scopes** (MEDIUM)
   - Requests `api` and `web` (full access)
   - **Impact**: Over-permissioned, violates least privilege
   - **Fix**: Request only required scopes per feature

6. ⚠️ **Web-Accessible Resources Exposed to All Sites** (MEDIUM)
   - All resources accessible to any website
   - **Impact**: Fingerprinting, potential exploits
   - **Fix**: Limit to specific domains

7. ⚠️ **No Rate Limiting** (MEDIUM)
   - API endpoints lack rate limiting
   - **Impact**: DoS, abuse
   - **Fix**: Implement express-rate-limit

8. ⚠️ **Username/Password Flow Supported** (MEDIUM)
   - Deprecated authentication method
   - **Impact**: Less secure than OAuth
   - **Fix**: Deprecate and remove

### Low Priority Issues

9. ℹ️ **CSP Missing Directives** (LOW)
   - `connect-src`, `img-src` not specified
   - **Impact**: More permissive than necessary
   - **Fix**: Add explicit CSP directives

10. ℹ️ **No Subresource Integrity (SRI)** (LOW)
    - External scripts lack integrity checks
    - **Impact**: Compromised CDN could inject malicious code
    - **Fix**: Add SRI hashes to external scripts

---

## Security Checklist

### Before Every Release

- [ ] Audit all third-party dependencies for vulnerabilities (`npm audit`)
- [ ] Review all code changes for security implications
- [ ] Test OAuth flow with various scenarios (expired tokens, revoked access)
- [ ] Verify CSP headers in production
- [ ] Check for exposed API keys or credentials in code
- [ ] Test extension with minimal permissions
- [ ] Validate all user inputs are sanitized
- [ ] Ensure tokens are encrypted before storage
- [ ] Run security scan (OWASP ZAP, Burp Suite)
- [ ] Review Chrome Web Store privacy disclosures

### Regular Security Maintenance

- [ ] Monthly: Review and update dependencies
- [ ] Quarterly: Full security audit
- [ ] Annually: Penetration testing
- [ ] Continuous: Monitor security advisories for dependencies

---

## Incident Response

### Security Incident Procedure

**1. Identification:**
- User reports suspicious activity
- Automated security scan detects vulnerability
- Third-party discloses vulnerability

**2. Containment:**
- Disable affected feature/endpoint
- Revoke compromised tokens
- Notify affected users

**3. Investigation:**
- Determine scope of breach
- Identify root cause
- Document timeline

**4. Remediation:**
- Patch vulnerability
- Update dependencies
- Deploy hotfix

**5. Communication:**
- Notify users via email/in-app notification
- Publish security advisory
- Update changelog

**6. Post-Incident:**
- Conduct retrospective
- Update security procedures
- Implement preventive measures

### Reporting Security Issues

**DO NOT** open public GitHub issues for security vulnerabilities.

Instead:
1. Email: security@sf-toolkit.com
2. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

Expected response time: 48 hours

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Salesforce Security Best Practices](https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/)

---

**Security is Everyone's Responsibility. Report Issues Promptly. 🔒**
