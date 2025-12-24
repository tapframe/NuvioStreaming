const { withDangerousMod, withMainApplication, withMainActivity } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Copy MPV native files to android project
 */
function copyMpvFiles(projectRoot) {
    const sourceDir = path.join(projectRoot, 'plugins', 'mpv-bridge', 'android', 'mpv');
    const destDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'nuvio', 'app', 'mpv');

    // Create destination directory if it doesn't exist
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    // Copy all files from source to destination
    if (fs.existsSync(sourceDir)) {
        const files = fs.readdirSync(sourceDir);
        files.forEach(file => {
            const srcFile = path.join(sourceDir, file);
            const destFile = path.join(destDir, file);
            if (fs.statSync(srcFile).isFile()) {
                fs.copyFileSync(srcFile, destFile);
                console.log(`[mpv-bridge] Copied ${file} to android project`);
            }
        });
    }
}

/**
 * Modify MainApplication.kt to include MpvPackage
 */
function withMpvMainApplication(config) {
    return withMainApplication(config, async (config) => {
        let contents = config.modResults.contents;

        // Add import for MpvPackage
        const mpvImport = 'import com.nuvio.app.mpv.MpvPackage';
        if (!contents.includes(mpvImport)) {
            // Add import after the last import statement
            const lastImportIndex = contents.lastIndexOf('import ');
            const endOfLastImport = contents.indexOf('\n', lastImportIndex);
            contents = contents.slice(0, endOfLastImport + 1) + mpvImport + '\n' + contents.slice(endOfLastImport + 1);
        }

        // Add MpvPackage to the packages list
        const packagesPattern = /override fun getPackages\(\): List<ReactPackage> \{[\s\S]*?return PackageList\(this\)\.packages\.apply \{/;
        if (contents.match(packagesPattern) && !contents.includes('MpvPackage()')) {
            contents = contents.replace(
                packagesPattern,
                (match) => match + '\n          add(MpvPackage())'
            );
        }

        config.modResults.contents = contents;
        return config;
    });
}

/**
 * Modify MainActivity.kt to handle MPV lifecycle if needed
 */
function withMpvMainActivity(config) {
    return withMainActivity(config, async (config) => {
        // Currently no modifications needed for MainActivity
        // But this hook is available for future enhancements
        return config;
    });
}

/**
 * Main plugin function
 */
function withMpvBridge(config) {
    // Copy native files during prebuild
    config = withDangerousMod(config, [
        'android',
        async (config) => {
            copyMpvFiles(config.modRequest.projectRoot);
            return config;
        },
    ]);

    // Modify MainApplication to register the package
    config = withMpvMainApplication(config);

    // Modify MainActivity if needed
    config = withMpvMainActivity(config);

    return config;
}

module.exports = withMpvBridge;
