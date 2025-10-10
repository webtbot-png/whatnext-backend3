const fs = require('fs');
const path = require('path');

function fixAPIFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Remove lines that have router.use with undefined routers
        let lines = content.split('\n');
        let cleanLines = lines.filter(line => {
            // Keep the line if it doesn't match problematic router.use patterns
            return !line.match(/router\.use\(['"]\/.+['"],\s*\w+Router\);/);
        });
        
        fs.writeFileSync(filePath, cleanLines.join('\n'));
        console.log(`✅ Fixed router issues in ${path.basename(filePath)}`);
        return true;
    } catch (error) {
        console.error(`❌ Error fixing ${filePath}:`, error.message);
        return false;
    }
}

function processDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);
    let fixedCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            fixedCount += processDirectory(itemPath);
        } else if (item.endsWith('.js')) {
            if (fixAPIFile(itemPath)) {
                fixedCount++;
            }
        }
    }
    
    return fixedCount;
}

console.log('🔧 Fixing undefined router references in API files...');
const totalFixed = processDirectory('api');
console.log(`🎉 Fixed ${totalFixed} files!`);