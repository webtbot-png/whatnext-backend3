const fs = require('fs');
const path = require('path');

function convertESModuleToCommonJS(content) {
    // Convert import statements
    content = content.replace(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require(\'$2\')');
    content = content.replace(/import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"]/g, 'const { $1 } = require(\'$2\')');
    content = content.replace(/import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g, 'const $1 = require(\'$2\')');
    
    // Convert export default
    content = content.replace(/export\s+default\s+(\w+)/g, 'module.exports = $1');
    content = content.replace(/export\s+default\s+/g, 'module.exports = ');
    
    // Convert named exports
    content = content.replace(/export\s+\{\s*([^}]+)\s*\}/g, 'module.exports = { $1 }');
    content = content.replace(/export\s+(const|let|var)\s+(\w+)/g, '$1 $2');
    
    return content;
}

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const convertedContent = convertESModuleToCommonJS(content);
        fs.writeFileSync(filePath, convertedContent, 'utf8');
        console.log(`✅ Fixed: ${path.relative(process.cwd(), filePath)}`);
        return true;
    } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
        return false;
    }
}

function processDirectory(dirPath) {
    const items = fs.readdirSync(dirPath);
    let processedCount = 0;
    
    for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
            processedCount += processDirectory(itemPath);
        } else if (item.endsWith('.js')) {
            if (processFile(itemPath)) {
                processedCount++;
            }
        }
    }
    
    return processedCount;
}

console.log('🔧 Converting API files from ES modules to CommonJS...');
const apiDir = path.join(__dirname, 'api');
const totalProcessed = processDirectory(apiDir);
console.log(`🎉 Successfully converted ${totalProcessed} API files!`);