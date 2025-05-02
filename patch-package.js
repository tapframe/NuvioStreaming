const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directory containing patches
const patchesDir = path.join(__dirname, 'src/patches');

// Check if the directory exists
if (!fs.existsSync(patchesDir)) {
  console.error(`Patches directory not found: ${patchesDir}`);
  process.exit(1);
}

// Get all patch files
const patches = fs.readdirSync(patchesDir).filter(file => file.endsWith('.patch'));

if (patches.length === 0) {
  console.log('No patch files found.');
  process.exit(0);
}

console.log(`Found ${patches.length} patch files.`);

// Apply each patch
patches.forEach(patchFile => {
  const patchPath = path.join(patchesDir, patchFile);
  console.log(`Applying patch: ${patchFile}`);
  
  try {
    // Use the patch command to apply the patch file
    execSync(`patch -p1 < ${patchPath}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log(`✅ Successfully applied patch: ${patchFile}`);
  } catch (error) {
    console.error(`❌ Failed to apply patch ${patchFile}:`, error.message);
    // Continue with other patches even if one fails
  }
});

console.log('Patch process completed.'); 