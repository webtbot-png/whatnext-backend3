const fs = require('fs');
const path = require('path');

function convertESModulesToCommonJS(dir) {
  try {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          // Skip node_modules and hidden directories
          if (!file.startsWith('.') && file !== 'node_modules') {
            convertESModulesToCommonJS(filePath);
          }
        } else if (file.endsWith('.js')) {
          let content = fs.readFileSync(filePath, 'utf8');
          let changed = false;
          let originalContent = content;
          
          // Skip files that already use CommonJS or have specific markers
          if (content.includes('module.exports') || content.includes('require(') || content.includes('// @skip-conversion')) {
            return;
          }
          
          // Convert import statements with better handling
          content = content.replace(/^import\s+(.+?)\s+from\s+['"](.+?)['"];?\s*$/gm, (match, imports, modulePath) => {
            changed = true;
            
            // Handle destructuring imports
            if (imports.trim().startsWith('{') && imports.trim().endsWith('}')) {
              return `const ${imports.trim()} = require('${modulePath}');`;
            }
            // Handle default imports with destructuring
            else if (imports.includes(',') && imports.includes('{')) {
              const parts = imports.split(',').map(p => p.trim());
              const defaultImport = parts[0];
              const destructured = parts.slice(1).join(',').trim();
              return `const ${defaultImport} = require('${modulePath}');\nconst ${destructured} = require('${modulePath}');`;
            }
            // Handle namespace imports (* as something)
            else if (imports.includes('*') && imports.includes('as')) {
              const nameMatch = imports.match(/\*\s+as\s+(\w+)/);
              if (nameMatch) {
                return `const ${nameMatch[1]} = require('${modulePath}');`;
              }
            }
            // Handle default imports
            else {
              const cleanImport = imports.trim().replace(/^default\s+/, '');
              return `const ${cleanImport} = require('${modulePath}');`;
            }
            
            return match; // fallback
          });
          
          // Convert export default with better handling
          content = content.replace(/^export\s+default\s+(.+?);?\s*$/gm, (match, exported) => {
            changed = true;
            // Handle function/class declarations
            if (exported.match(/^(function|class)\s+\w+/)) {
              const nameMatch = exported.match(/^(?:function|class)\s+(\w+)/);
              if (nameMatch) {
                return `${exported.replace(/;$/, '')}\nmodule.exports = ${nameMatch[1]};`;
              }
            }
            // Handle arrow functions and other expressions
            return `module.exports = ${exported.replace(/;$/, '')};`;
          });
          
          // Convert named exports with better handling
          content = content.replace(/^export\s+\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?\s*;?\s*$/gm, (match, exports, fromModule) => {
            changed = true;
            if (fromModule) {
              // Re-export from another module
              return `const { ${exports} } = require('${fromModule}');\nmodule.exports = { ${exports} };`;
            } else {
              // Export local variables
              return `module.exports = { ${exports} };`;
            }
          });
          
          // Convert export const/function/class with better handling
          content = content.replace(/^export\s+(const|let|var|function|class)\s+(.+?)$/gm, (match, type, declaration) => {
            changed = true;
            
            // Extract the name from the declaration
            let name;
            if (type === 'function' || type === 'class') {
              const nameMatch = declaration.match(/^(\w+)/);
              name = nameMatch ? nameMatch[1] : 'unknown';
            } else {
              // For const/let/var, extract name before = or destructuring
              const nameMatch = declaration.match(/^(\w+)/);
              name = nameMatch ? nameMatch[1] : 'unknown';
            }
            
            return `${type} ${declaration}\nmodule.exports.${name} = ${name};`;
          });
          
          // Convert simple export statements
          content = content.replace(/^export\s+(.+?);?\s*$/gm, (match, exported) => {
            changed = true;
            if (exported.startsWith('{')) {
              // Already handled above
              return match;
            }
            return `module.exports.${exported} = ${exported};`;
          });
          
          // Only write if content actually changed and is valid
          if (changed && content !== originalContent) {
            // Basic validation - ensure we didn't break the syntax
            try {
              // Simple check for balanced braces
              const openBraces = (content.match(/\{/g) || []).length;
              const closeBraces = (content.match(/\}/g) || []).length;
              
              if (openBraces === closeBraces) {
                console.log(`✅ Fixed ES modules in: ${filePath}`);
                fs.writeFileSync(filePath, content, 'utf8');
              } else {
                console.log(`⚠️ Skipped ${filePath} - potential syntax issues`);
              }
            } catch (err) {
              console.log(`⚠️ Skipped ${filePath} - validation error: ${err.message}`);
            }
          }
        }
      } catch (fileError) {
        console.log(`⚠️ Error processing ${filePath}: ${fileError.message}`);
      }
    });
  } catch (dirError) {
    console.log(`⚠️ Error reading directory ${dir}: ${dirError.message}`);
  }
}

function validateApiDirectory() {
  const apiDir = path.join(process.cwd(), 'api');
  
  if (!fs.existsSync(apiDir)) {
    console.log('❌ API directory not found');
    return false;
  }
  
  console.log(`✅ Found API directory: ${apiDir}`);
  return true;
}

// Main execution
console.log('🔧 Starting ES module to CommonJS conversion...');
console.log(`📁 Working directory: ${process.cwd()}`);

if (validateApiDirectory()) {
  convertESModulesToCommonJS('./api');
  console.log('✅ ES module conversion complete!');
} else {
  console.log('❌ Conversion aborted - API directory not found');
  process.exit(1);
}
