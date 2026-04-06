# SF Toolkit - Development Guide

Complete guide for setting up, developing, and debugging SF Toolkit across all platforms (Web, Chrome Extension, Electron).

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Development Workflow](#development-workflow)
4. [Platform-Specific Development](#platform-specific-development)
5. [Debugging](#debugging)
6. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
7. [Code Quality](#code-quality)
8. [Performance Optimization](#performance-optimization)

---

## Prerequisites

### Required Software

- **Node.js**: v22.14 (exact version - see package.json)
  - Use [nvm](https://github.com/nvm-sh/nvm) to manage Node versions
  - Install: `nvm install 22.14 && nvm use 22.14`
- **npm**: v10+ (comes with Node.js)
- **Git**: v2.20+

### Optional but Recommended

- **Chrome Browser**: For extension development and testing
- **VSCode**: Recommended IDE (see [IDE Setup](#ide-setup))
- **Chrome DevTools**: Built-in (press F12 in Chrome)

### System Requirements

- **RAM**: 8GB minimum (16GB recommended for large builds)
- **Disk Space**: 2GB free space for dependencies and build artifacts
- **OS**: Windows 10+, macOS 10.15+, or Linux (Ubuntu 20.04+)

---

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/josh-rojas/sfdx-ui-light.git
cd sfdx-ui-light
```

### 2. Install Dependencies

```bash
# Ensure you're on Node v22.14
node -v  # Should output v22.14.x

# Install all dependencies
npm install
```

**Common Installation Issues:**

| Issue | Solution |
|-------|----------|
| `EACCES` permissions error | Use `sudo npm install` or fix npm permissions ([guide](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)) |
| `node-gyp` build failures | Install build tools: `npm install -g node-gyp` and platform-specific build tools |
| `@salesforce-ux/design-system` native deps fail | Install Python 2.7 and C++ compiler (Windows: VS Build Tools) |
| `ENOMEM` out of memory | Increase Node memory: `export NODE_OPTIONS="--max-old-space-size=4096"` |

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your Salesforce Connected App credentials:

```env
# Salesforce OAuth Configuration
CLIENT_ID='your_salesforce_connected_app_client_id'
CLIENT_SECRET='your_salesforce_connected_app_secret'

# Optional: Custom redirect URI (default: http://localhost:3000/oauth2/callback)
REDIRECT_URI='http://localhost:3000/oauth2/callback'

# Optional: Salesforce API Version
DOC_VERSION='255.0'

# Optional: Chrome Extension ID (for development)
CHROME_ID='dmlgjapbfifmeopbfikbdmlgdcgcdmfb'
```

**Getting Salesforce Credentials:**

1. Log in to your Salesforce org
2. Setup → Apps → App Manager → New Connected App
3. Enable OAuth Settings
4. Callback URL: `http://localhost:3000/oauth2/callback`
5. Scopes: `Full access (full)`, `Perform requests on your behalf at any time (refresh_token, offline_access)`
6. Save and retrieve Consumer Key (CLIENT_ID) and Consumer Secret (CLIENT_SECRET)

### 4. Verify Installation

```bash
# Check if dependencies are installed
npm list --depth=0

# Run linter to verify setup
npm run lint

# Verify environment variables
node -e "require('dotenv').config(); console.log('CLIENT_ID:', process.env.CLIENT_ID ? '✓' : '✗')"
```

---

## Development Workflow

### Web Application Development

**Development Server** (with hot reload):

```bash
npm run start:dev:client
```

- Opens at: `http://localhost:3000`
- Hot reload: Automatic (LWR watches for file changes)
- Build time: ~30-60 seconds initial, ~5-10 seconds incremental

**Production Build** (static site):

```bash
npm run start:prod:build  # Build only
npm run start:prod:run    # Run production server
```

### Chrome Extension Development

**Development Build** (with watch mode):

```bash
npm run start:dev:extension
```

- Output: `chrome_ext/` directory
- Watch mode: Rebuilds on file changes (3-second debounce)
- Serves at: `http://localhost:5000` (for asset preview)

**Load Extension in Chrome:**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `chrome_ext/` folder
5. Extension ID will be displayed (update CHROME_ID in .env if needed)

**Production Build:**

```bash
npm run start:prod:extension
```

- Output: Optimized bundle in `chrome_ext/`
- Minified + tree-shaken
- Ready for Chrome Web Store upload

### Web Workers Development

```bash
npm run start:dev:workers
```

- Builds: `accessAnalyzer.worker.js`, `metadata.worker.js`, `openaiWorker/worker.js`
- Output: `src/client/assets/libs/workers/`

---

## Platform-Specific Development

### 🌐 Web App

**Architecture:**
- **Framework**: LWR (Lightning Web Runtime)
- **Frontend**: LWC components + Redux
- **Backend**: Express.js server
- **Routing**: LWR Router

**File Structure:**
```
src/client/
├── lwc/              # LWC components
│   ├── modules/      # Shared modules
│   ├── components/   # Reusable components
│   └── applications/ # Feature apps
├── layouts/          # Page templates
├── content/          # Static content
└── assets/           # Images, styles, libs
```

**Key Files:**
- `lwr.config.json`: Routes, LWC modules, assets
- `src/server/server-dev.js`: Development server
- `src/server/server-prod.js`: Production server

**Hot Reload:**
- LWC changes: Automatic (LWR watches)
- Server changes: Manual restart required
- Asset changes: Automatic

### 🧩 Chrome Extension

**Architecture:**
- **Manifest**: V3 (service workers)
- **Background**: `scripts/background.js` (ES module)
- **Content Scripts**: Injected into Salesforce pages
- **Popup/Options**: LWC-based UI

**File Structure:**
```
src/client_chrome/
├── components/       # Extension-specific LWC
├── inject/           # Content scripts
│   ├── inject_salesforce.js
│   └── inject_toolkit.js
└── main.js           # Extension entry point
```

**Key Files:**
- `manifest.json`: Extension configuration
- `rollup.config.mjs`: Extension bundler config

**Development Tips:**
- **Console Logs**: Check background service worker console (chrome://extensions → Inspect views: service worker)
- **Content Script Logs**: Check page console (F12 on target page)
- **Hot Reload**: Use [Extensions Reloader](https://chrome.google.com/webstore/detail/extensions-reloader/fimgfedafeadlieiabdeeaodndnlbhid)

**Extension Permissions:**
- `storage`: For credentials (chrome.storage.local/sync)
- `identity`: For OAuth flow
- `tabs`: For tab management
- `scripting`: For content script injection
- `sidePanel`: For side panel UI

### 🔧 Workers

**Purpose:**
- `accessAnalyzer.worker.js`: Heavy permission calculations
- `metadata.worker.js`: Metadata parsing/analysis
- `openaiWorker/worker.js`: AI model inference

**Communication:**
```javascript
// Main thread
const worker = new Worker('/workers/metadata.worker.js');
worker.postMessage({ action: 'parse', data: metadata });
worker.onmessage = (e) => console.log(e.data);

// Worker
self.onmessage = (e) => {
  const { action, data } = e.data;
  // Process...
  self.postMessage({ result: processed });
};
```

---

## Debugging

### 🐛 Debugging LWC Components

**Chrome DevTools:**

1. Open component in browser
2. Press F12 → Sources tab
3. Search for component file (Ctrl+P)
4. Set breakpoints

**LWC Inspector:**

Install: [LWC Dev Tools](https://chrome.google.com/webstore/detail/lwc-developer-tools/ldlkfknjgdcpldoocnelgajllpanbgco)

Features:
- Component tree visualization
- Props/state inspection
- Event tracking
- Performance profiling

**Redux DevTools:**

Install: [Redux DevTools](https://chrome.google.com/webstore/detail/redux-devtools/lmhkpmbekcpmknklioeibfkpmmfibljd)

Usage:
```javascript
// Already configured in src/client/lwc/modules/core/store/index.js
// Open Redux DevTools in Chrome (press F12 → Redux tab)
```

### 🔍 Debugging Server-Side Code

**Node.js Debugger:**

```bash
# Add --inspect flag
node --inspect -r dotenv/config src/server/server-dev.js

# In Chrome, navigate to: chrome://inspect
# Click "Inspect" under your Node process
```

**VSCode Debugger:**

Add `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "runtimeArgs": ["-r", "dotenv/config"],
      "program": "${workspaceFolder}/src/server/server-dev.js",
      "console": "integratedTerminal"
    }
  ]
}
```

Press F5 to start debugging.

### 📦 Debugging Extension Background Scripts

**Service Worker Console:**

1. Open `chrome://extensions/`
2. Find "SF Toolkit"
3. Click "Inspect views: service worker"
4. Use console for logs and debugging

**Storage Inspection:**

```javascript
// In service worker console or content script:
chrome.storage.local.get(null, (data) => console.log(data));
chrome.storage.sync.get(null, (data) => console.log(data));
```

### 🔬 Debugging Build Issues

**Rollup Build Debugging:**

```bash
# Enable verbose logging
rollup -c rollup.config.mjs --logLevel debug

# Watch for specific errors
rollup -c rollup.config.mjs 2>&1 | grep -i "error\|warning"
```

**LWR Build Debugging:**

```bash
# Clear cache and rebuild
npm run clean
NODE_ENV=development lwr build -m dev

# Check for LWC compilation errors
cat __lwr_cache__/build.log
```

---

## Common Issues & Troubleshooting

### ❌ Issue: `npm install` Fails

**Symptom:** Errors during `npm install`, especially with native dependencies.

**Solutions:**

1. **Clear npm cache:**
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Check Node version:**
   ```bash
   node -v  # Must be v22.14.x
   nvm use 22.14
   ```

3. **Install build tools** (Windows):
   ```bash
   npm install -g windows-build-tools
   ```

4. **Install build tools** (macOS):
   ```bash
   xcode-select --install
   ```

5. **Install build tools** (Linux):
   ```bash
   sudo apt-get install build-essential
   ```

### ❌ Issue: LWR Build Fails or Hangs

**Symptom:** `npm run start:dev:client` hangs or fails with "Module not found" errors.

**Solutions:**

1. **Clear LWR cache:**
   ```bash
   npm run clean
   rm -rf __lwr_cache__ site
   ```

2. **Check LWC module paths in `lwr.config.json`:**
   - Ensure all directories in `lwc.modules` exist
   - Verify component names match folder names

3. **Check for circular dependencies:**
   ```bash
   npx madge --circular --extensions js src/client/lwc/
   ```

4. **Increase Node memory:**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm run start:dev:client
   ```

### ❌ Issue: Extension Won't Load in Chrome

**Symptom:** "Manifest file is missing or unreadable" or CSP errors.

**Solutions:**

1. **Verify build completed:**
   ```bash
   ls chrome_ext/
   # Should see: manifest.json, scripts/, views/, etc.
   ```

2. **Check manifest.json placeholders:**
   ```bash
   cat chrome_ext/manifest.json | grep "__build"
   # Should be empty (no __buildVersion__ or __buildLogo__)
   ```

3. **Rebuild extension:**
   ```bash
   rm -rf chrome_ext
   npm run start:prod:extension
   ```

4. **Check CSP violations:**
   - Open `chrome://extensions/`
   - Click "Errors" button under extension
   - Look for "Refused to execute inline script" or "Refused to load..."

### ❌ Issue: OAuth Callback Fails

**Symptom:** "Redirect URI mismatch" or "Invalid client" errors.

**Solutions:**

1. **Verify REDIRECT_URI in .env:**
   ```env
   REDIRECT_URI='http://localhost:3000/oauth2/callback'
   ```

2. **Check Salesforce Connected App settings:**
   - Callback URL must exactly match REDIRECT_URI
   - Include `http://` or `https://`
   - No trailing slash

3. **Verify CLIENT_ID and CLIENT_SECRET:**
   ```bash
   node -e "require('dotenv').config(); console.log('CLIENT_ID:', process.env.CLIENT_ID)"
   ```

4. **Check server is running:**
   ```bash
   curl http://localhost:3000
   ```

### ❌ Issue: Hot Reload Not Working

**Symptom:** File changes don't trigger rebuilds or refreshes.

**Solutions:**

1. **Web App - Check LWR watcher:**
   ```bash
   # Restart with verbose logging
   NODE_ENV=development node -r dotenv/config src/server/server-dev.js
   ```

2. **Extension - Check Rollup watch:**
   ```bash
   # Terminal should show: "waiting for changes..."
   npm run watch:extension
   ```

3. **Increase watch delay** (if too sensitive):
   Edit `package.json`:
   ```json
   "watch:extension": "rollup -c rollup.config.mjs --watch --watch.buildDelay 5000"
   ```

### ❌ Issue: Worker Fails to Load

**Symptom:** "Failed to construct 'Worker': Script at '...' cannot be accessed from origin"

**Solutions:**

1. **Check worker path:**
   ```javascript
   // Use absolute path from public root
   new Worker('/workers/metadata.worker.js');
   ```

2. **Verify worker is built:**
   ```bash
   npm run start:dev:workers
   ls src/client/assets/libs/workers/
   ```

3. **Check CSP in manifest.json:**
   ```json
   "content_security_policy": {
     "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
   }
   ```

### ❌ Issue: Monaco Editor Not Loading

**Symptom:** Code editor appears blank or fails to initialize.

**Solutions:**

1. **Check Monaco assets:**
   ```bash
   ls src/client/assets/libs/monaco/
   # Should see: monaco.bundle.js, workers/
   ```

2. **Verify Monaco configuration:**
   - Check `src/client/lwc/components/editor/` for initialization code
   - Ensure worker paths are correct

3. **Check browser console for errors:**
   - Look for "Failed to load resource" errors
   - Verify asset paths match `lwr.config.json` asset mappings

---

## Code Quality

### Linting

**Run ESLint:**

```bash
# Check all files
npm run lint

# Auto-fix issues
npm run lint:eslint:fix
```

**ESLint Configuration:**
- File: `.eslintrc.json`
- Rules: ESLint recommended + import ordering
- Ignored: `.eslintignore`

### Formatting

**Run Prettier:**

```bash
# Check formatting
npm run format:check

# Auto-format
npm run format
```

**Prettier Configuration:**
- File: `.prettierrc`
- Ignored: `.prettierignore`

### Pre-commit Hooks

*Coming soon: Husky + lint-staged will auto-run linting and formatting before commits.*

---

## Performance Optimization

### Build Performance

**Measure Build Time:**

```bash
time npm run start:prod:build
```

**Optimize Rollup Build:**

1. **Enable caching:**
   ```javascript
   // In rollup.config.mjs
   export default {
     cache: true,
     // ...
   }
   ```

2. **Parallelize builds:**
   ```bash
   # Build extension and workers in parallel
   npm-run-all --parallel start:dev:extension start:dev:workers
   ```

### Bundle Size Analysis

**Analyze Extension Bundle:**

```bash
# Install visualizer
npm install --save-dev rollup-plugin-visualizer

# Generate report (added in rollup.config.mjs)
npm run start:prod:extension

# Open report
open stats.html
```

### Runtime Performance

**Profile LWC Components:**

1. Open Chrome DevTools (F12)
2. Performance tab → Record
3. Interact with application
4. Stop recording
5. Analyze flamegraph for slow renders

**Profile Redux Actions:**

```javascript
// Enable Redux DevTools trace
import { configureStore } from '@reduxjs/toolkit';

const store = configureStore({
  // ...
  devTools: {
    trace: true,
    traceLimit: 25
  }
});
```

---

## IDE Setup

### VSCode (Recommended)

**Required Extensions:**

- [LWC](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode-lwc) - LWC syntax and IntelliSense
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) - Linting
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) - Formatting

**Recommended Extensions:**

- [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens) - Git supercharged
- [Thunder Client](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client) - REST API testing
- [Salesforce Extension Pack](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode) - Full Salesforce dev tools

**Workspace Settings:**

*See `.vscode/settings.json` (created by setup scripts)*

---

## Additional Resources

- **LWR Documentation**: https://lwc.dev/guide/lwr
- **LWC Documentation**: https://lwc.dev
- **Chrome Extension Docs**: https://developer.chrome.com/docs/extensions/mv3/
- **Salesforce APIs**: https://developer.salesforce.com/docs
- **Rollup Documentation**: https://rollupjs.org/guide/en/

---

## Getting Help

1. **Check this guide** for common issues
2. **Search existing issues**: https://github.com/josh-rojas/sfdx-ui-light/issues
3. **Open a new issue** with:
   - Node version (`node -v`)
   - npm version (`npm -v`)
   - OS and version
   - Full error logs
   - Steps to reproduce

---

**Happy Coding! 🚀**
