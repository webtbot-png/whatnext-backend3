const fs = require('fs');
const path = require('path');

function convertESModulesToCommonJS(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      convertESModulesToCommonJS(filePath);
    } else if (file.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;
      
      // Convert import statements
      content = content.replace(/^import\s+(.+?)\s+from\s+['"](.+?)['"];?$/gm, (match, imports, module) => {
        changed = true;
        if (imports.includes('{')) {
          return `const ${imports} = require('${module}');`;
        } else if (imports.includes('*')) {
          return `const ${imports} = require('${module}');`;
        } else {
          return `const ${imports} = require('${module}');`;
        }
      });
      
      // Convert export default
      content = content.replace(/^export\s+default\s+(.+);?$/gm, (match, exported) => {
        changed = true;
        return `module.exports = ${exported};`;
      });
      
      // Convert named exports
      content = content.replace(/^export\s+\{(.+?)\};?$/gm, (match, exports) => {
        changed = true;
        return `module.exports = { ${exports} };`;
      });
      
      // Convert export const/function/class
      content = content.replace(/^export\s+(const|function|class)\s+(.+?)$/gm, (match, type, declaration) => {
        changed = true;
        const name = declaration.split(/[\s=\(]/)[0];
        return `${type} ${declaration}\nmodule.exports.${name} = ${name};`;
      });
      
      if (changed) {
        console.log(`Fixed ES modules in: ${filePath}`);
        fs.writeFileSync(filePath, content);
      }
    }
  });
}

console.log('🔧 Converting any remaining ES modules to CommonJS...');
convertESModulesToCommonJS('./api');
console.log('✅ ES module conversion complete!');