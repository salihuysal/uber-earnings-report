const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log('[afterSign] Replacing broken signatures with clean ad-hoc signature:', appPath);

  try {
    execSync(
      `find "${appPath}" -name "_CodeSignature" -type d -exec rm -rf {} + 2>/dev/null || true`,
      { stdio: 'inherit' }
    );

    execSync(
      `codesign --force --deep --sign - "${appPath}"`,
      { stdio: 'inherit' }
    );

    console.log('[afterSign] Clean ad-hoc signature applied successfully');
  } catch (e) {
    console.log('[afterSign] Warning:', e.message);
  }
};
