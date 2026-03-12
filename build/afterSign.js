const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log('[afterSign] Stripping all code signatures from:', appPath);

  try {
    execSync(
      `find "${appPath}" -name "_CodeSignature" -type d -exec rm -rf {} + 2>/dev/null || true`,
      { stdio: 'inherit' }
    );

    execSync(
      `find "${appPath}" -name "*.dylib" -exec codesign --remove-signature {} \\; 2>/dev/null || true`,
      { stdio: 'inherit' }
    );

    execSync(
      `find "${appPath}" -name "*.framework" -type d -exec codesign --remove-signature {} \\; 2>/dev/null || true`,
      { stdio: 'inherit' }
    );

    execSync(
      `find "${appPath}" -name "*.app" -type d -exec codesign --remove-signature {} \\; 2>/dev/null || true`,
      { stdio: 'inherit' }
    );

    execSync(
      `codesign --remove-signature "${appPath}" 2>/dev/null || true`,
      { stdio: 'inherit' }
    );

    console.log('[afterSign] All code signatures removed successfully');
  } catch (e) {
    console.log('[afterSign] Warning:', e.message);
  }
};
