const fs = require('fs');

const finalFiles = [
    'api/claim-validation-backup.js',
    'api/stats-working.js'
];

function fixFile(filePath) {
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
        console.log(`✅ Fixed ${filePath}`);
        return true;
    } catch (error) {
        console.error(`❌ Error fixing ${filePath}:`, error.message);
        return false;
    }
}

console.log('🔧 Fixing final API files...');
let fixed = 0;
finalFiles.forEach(file => {
    if (fs.existsSync(file)) {
        if (fixFile(file)) {
            fixed++;
        }
    } else {
        console.log(`⚠️ File not found: ${file}`);
    }
});

console.log(`🎉 Fixed ${fixed} final files!`);