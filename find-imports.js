const fs = require('fs');
const path = require('path');

function findImportStatements(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findImportStatements(filePath);
    } else if (file.endsWith('.js')) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check for import statements
        const importLines = content.split('\n').filter((line, index) => {
          return line.trim().startsWith('import ') || line.trim().startsWith('export ');
        });
        
        if (importLines.length > 0) {
          console.log(`\n❌ ES Modules found in: ${filePath}`);
          importLines.forEach((line, i) => {
            console.log(`  Line: ${line.trim()}`);
          });
        }
      } catch (err) {
        console.log(`⚠️  Error reading ${filePath}: ${err.message}`);
      }
    }
  });
}

console.log('🔍 Scanning for ES module statements...');
findImportStatements('./api');
console.log('\n✅ Scan complete!');