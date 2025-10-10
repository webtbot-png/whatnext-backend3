const fs = require('fs');
const path = require('path');

function cleanupFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Remove lines that contain .cjs imports
        let lines = content.split('\n');
        let cleanLines = lines.filter(line => !line.includes('.cjs'));
        
        fs.writeFileSync(filePath, cleanLines.join('\n'));
        console.log(`✅ Cleaned ${path.basename(filePath)}`);
        return true;
    } catch (error) {
        console.error(`❌ Error cleaning ${filePath}:`, error.message);
        return false;
    }
}

function processDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);
    let cleanedCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            cleanedCount += processDirectory(itemPath);
        } else if (item.endsWith('.js')) {
            if (cleanupFile(itemPath)) {
                cleanedCount++;
            }
        }
    }
    
    return cleanedCount;
}

console.log('🧹 Removing all .cjs imports from API files...');
const totalCleaned = processDirectory('api');
console.log(`🎉 Cleaned ${totalCleaned} files!`);