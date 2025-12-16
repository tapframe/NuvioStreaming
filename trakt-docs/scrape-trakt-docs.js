const https = require('https');
const fs = require('fs');
const path = require('path');

const API_BLUEPRINT_URL = 'https://jsapi.apiary.io/apis/trakt.apib';

// Category mapping based on group names
const CATEGORIES = {
    'introduction': { file: '01-introduction.md', title: 'Introduction' },
    'authentication-oauth': { file: '02-authentication-oauth.md', title: 'Authentication - OAuth' },
    'authentication-devices': { file: '03-authentication-devices.md', title: 'Authentication - Devices' },
    'calendars': { file: '04-calendars.md', title: 'Calendars' },
    'checkin': { file: '05-checkin.md', title: 'Checkin' },
    'certifications': { file: '06-certifications.md', title: 'Certifications' },
    'comments': { file: '07-comments.md', title: 'Comments' },
    'countries': { file: '08-countries.md', title: 'Countries' },
    'genres': { file: '09-genres.md', title: 'Genres' },
    'languages': { file: '10-languages.md', title: 'Languages' },
    'lists': { file: '11-lists.md', title: 'Lists' },
    'movies': { file: '12-movies.md', title: 'Movies' },
    'networks': { file: '13-networks.md', title: 'Networks' },
    'notes': { file: '14-notes.md', title: 'Notes' },
    'people': { file: '15-people.md', title: 'People' },
    'recommendations': { file: '16-recommendations.md', title: 'Recommendations' },
    'scrobble': { file: '17-scrobble.md', title: 'Scrobble' },
    'search': { file: '18-search.md', title: 'Search' },
    'shows': { file: '19-shows.md', title: 'Shows' },
    'seasons': { file: '20-seasons.md', title: 'Seasons' },
    'episodes': { file: '21-episodes.md', title: 'Episodes' },
    'sync': { file: '22-sync.md', title: 'Sync' },
    'users': { file: '23-users.md', title: 'Users' },
};

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function parseApiBlueprint(content) {
    const sections = {};
    let currentGroup = 'introduction';
    let currentContent = [];

    const lines = content.split('\n');

    for (const line of lines) {
        // Detect group headers like "# Group Authentication - OAuth"
        const groupMatch = line.match(/^#\s+Group\s+(.+)$/i);
        if (groupMatch) {
            // Save previous group
            if (currentContent.length > 0) {
                if (!sections[currentGroup]) sections[currentGroup] = [];
                sections[currentGroup].push(...currentContent);
            }

            // Start new group
            const groupName = groupMatch[1].toLowerCase().replace(/\s+/g, '-');
            currentGroup = groupName;
            currentContent = [`# ${groupMatch[1]}\n`];
            continue;
        }

        currentContent.push(line);
    }

    // Save last group
    if (currentContent.length > 0) {
        if (!sections[currentGroup]) sections[currentGroup] = [];
        sections[currentGroup].push(...currentContent);
    }

    return sections;
}

function convertApiBlueprintToMarkdown(content) {
    let md = content;

    // Convert API Blueprint specific syntax to markdown
    // Parameters section
    md = md.replace(/\+ Parameters/g, '### Parameters');

    // Request/Response sections
    md = md.replace(/\+ Request \(([^)]+)\)/g, '### Request ($1)');
    md = md.replace(/\+ Response (\d+)(?: \(([^)]+)\))?/g, (match, code, type) => {
        return type ? `### Response ${code} (${type})` : `### Response ${code}`;
    });

    // Body sections
    md = md.replace(/\+ Body/g, '**Body:**');

    // Headers
    md = md.replace(/\+ Headers/g, '**Headers:**');

    // Attributes
    md = md.replace(/\+ Attributes/g, '### Attributes');

    // Clean up indentation for code blocks
    md = md.replace(/^        /gm, '    ');

    return md;
}

async function main() {
    console.log('🔄 Fetching Trakt API Blueprint...');

    try {
        const content = await fetchUrl(API_BLUEPRINT_URL);
        console.log(`✅ Fetched ${content.length} bytes`);

        // Save raw blueprint
        fs.writeFileSync(path.join(__dirname, 'raw-api-blueprint.apib'), content);
        console.log('📝 Saved raw API Blueprint');

        // Parse and organize by groups
        const sections = parseApiBlueprint(content);
        console.log(`📂 Found ${Object.keys(sections).length} sections`);

        // Create markdown files for each category
        for (const [groupKey, lines] of Object.entries(sections)) {
            const category = CATEGORIES[groupKey];
            const fileName = category ? category.file : `${groupKey}.md`;
            const title = category ? category.title : groupKey;

            let mdContent = lines.join('\n');
            mdContent = convertApiBlueprintToMarkdown(mdContent);

            // Add header if not present
            if (!mdContent.startsWith('# ')) {
                mdContent = `# ${title}\n\n${mdContent}`;
            }

            const filePath = path.join(__dirname, fileName);
            fs.writeFileSync(filePath, mdContent);
            console.log(`✅ Created ${fileName}`);
        }

        // Create README
        const readme = generateReadme(Object.keys(sections));
        fs.writeFileSync(path.join(__dirname, 'README.md'), readme);
        console.log('✅ Created README.md');

        console.log('\n🎉 Done! All documentation files created.');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

function generateReadme(groups) {
    let md = `# Trakt API Documentation

This folder contains the complete Trakt API documentation, scraped from [trakt.docs.apiary.io](https://trakt.docs.apiary.io/).

## API Base URL

\`\`\`
https://api.trakt.tv
\`\`\`

## Documentation Files

`;

    for (const groupKey of groups) {
        const category = CATEGORIES[groupKey];
        if (category) {
            md += `- [${category.title}](./${category.file})\n`;
        } else {
            md += `- [${groupKey}](./${groupKey}.md)\n`;
        }
    }

    md += `
## Quick Reference

### Required Headers

| Header | Value |
|---|---|
| \`Content-Type\` | \`application/json\` |
| \`trakt-api-key\` | Your \`client_id\` |
| \`trakt-api-version\` | \`2\` |
| \`Authorization\` | \`Bearer [access_token]\` (for authenticated endpoints) |

### Useful Links

- [Create API App](https://trakt.tv/oauth/applications/new)
- [GitHub Developer Forum](https://github.com/trakt/api-help/issues)
- [API Blog](https://apiblog.trakt.tv)

---
*Generated on ${new Date().toISOString()}*
`;

    return md;
}

main();
