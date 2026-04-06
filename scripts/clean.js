const fs = require('fs');
const path = require('path');

/**
 * Cross-platform clean script
 * Safely removes build artifacts and cache directories
 */

const dirsToRemove = [
  '__lwr_cache__',
  'site',
  '__skip_directory_creation__',
  'chrome_ext'
];

function removeDirectory(dir) {
  const fullPath = path.resolve(__dirname, '..', dir);

  if (!fs.existsSync(fullPath)) {
    console.log(`✓ ${dir} (already clean)`);
    return;
  }

  try {
    fs.rmSync(fullPath, { recursive: true, force: true });
    console.log(`✓ Removed ${dir}`);
  } catch (error) {
    console.error(`✗ Failed to remove ${dir}:`, error.message);
    process.exit(1);
  }
}

console.log('Cleaning build artifacts...\n');

dirsToRemove.forEach(removeDirectory);

console.log('\n✓ Clean complete!');
