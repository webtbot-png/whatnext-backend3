const fs = require('fs');
const path = require('path');

function cleanupAPIFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let lines = content.split('\n');
        let newLines = [];
        let foundFirstExpress = false;
        let foundFirstRouter = false;
        let foundFirstSupabase = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip duplicate imports after the first ones
            if (line.includes("const express = require('express')")) {
                if (foundFirstExpress) {
                    continue;
                } else {
                    foundFirstExpress = true;
                }
            }
            if (line.includes("const router = express.Router()")) {
                if (foundFirstRouter) {
                    continue;
                } else {
                    foundFirstRouter = true;
                }
            }
            if (line.includes("const { getSupabaseAdminClient") || line.includes("const { getSupabaseClient")) {
                if (foundFirstSupabase) {
                    continue;
                } else {
                    foundFirstSupabase = true;
                }
            }
            
            newLines.push(line);
        }

        fs.writeFileSync(filePath, newLines.join('\n'));
        console.log(`✅ Cleaned up ${path.basename(filePath)}`);
        return true;
    } catch (error) {
        console.error(`❌ Error cleaning ${filePath}:`, error.message);
        return false;
    }
}

// List of API files to clean
const apiFiles = [
    'api/testimonials.js',
    'api/metadata.js', 
    'api/qr-codes.js',
    'api/giveaway.js',
    'api/media.js',
    'api/roadmap.js',
    'api/stats.js'
];

let cleaned = 0;
apiFiles.forEach(file => {
    if (fs.existsSync(file)) {
        if (cleanupAPIFile(file)) {
            cleaned++;
        }
    } else {
        console.log(`⚠️ File not found: ${file}`);
    }
});

console.log(`🎉 Cleaned up ${cleaned} API files!`);