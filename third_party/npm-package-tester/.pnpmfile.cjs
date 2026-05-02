function readPackage(pkg) {
  if (pkg.name === '@kitiumai/logger') {
    // This is needed to work around ESM module resolution issues
    console.log('Patching @kitiumai/logger for ESM compatibility');
  }
  return pkg;
}

function afterAllResolved(lockfile) {
  // Patch the logger package's ESM files after installation
  const fs = require('fs');
  const path = require('path');

  // Find the logger package in node_modules
  const loggerPath = path.join(__dirname, 'node_modules', '@kitiumai', 'logger', 'dist', 'esm');

  if (fs.existsSync(loggerPath)) {
    try {
      // Recursively find and patch all .js files
      function patchFiles(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            patchFiles(filePath);
          } else if (file.endsWith('.js')) {
            let content = fs.readFileSync(filePath, 'utf-8');
            const original = content;

            // Fix all relative imports to add .js extensions
            content = content.replace(/from ['"]\.\/([^'"]+)(?<!\.js)['"]/g, "from './$1.js'");
            content = content.replace(/from ['"]\.\.\/([^'"]+)(?<!\.js)['"]/g, "from '../$1.js'");

            if (content !== original) {
              fs.writeFileSync(filePath, content, 'utf-8');
            }
          }
        }
      }

      patchFiles(loggerPath);
      console.log('Patched @kitiumai/logger ESM imports recursively');
    } catch (e) {
      console.warn('Failed to patch @kitiumai/logger:', e.message);
    }
  }

  return lockfile;
}

module.exports = {
  hooks: {
    readPackage,
    afterAllResolved,
  },
};
