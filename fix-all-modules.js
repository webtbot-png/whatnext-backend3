const fs = require('fs');
const path = require('path');

function shouldSkipFile(content) {
  return content.includes('module.exports') || 
         content.includes('require(') || 
         content.includes('// @skip-conversion');
}

function convertImportStatement(match, imports, modulePath) {
  const trimmedImports = imports.trim();
  
  if (trimmedImports.startsWith('{') && trimmedImports.endsWith('}')) {
    return `const ${trimmedImports} = require('${modulePath}');`;
  }
  
  if (trimmedImports.includes(',') && trimmedImports.includes('{')) {
    const parts = trimmedImports.split(',').map(p => p.trim());
    const defaultImport = parts[0];
    const destructured = parts.slice(1).join(',').trim();
    return `const ${defaultImport} = require('${modulePath}');\nconst ${destructured} = require('${modulePath}');`;
  }
  
  if (trimmedImports.includes('*') && trimmedImports.includes('as')) {
    const nameMatch = trimmedImports.match(/\*\s+as\s+(\w+)/);
    return nameMatch ? `const ${nameMatch[1]} = require('${modulePath}');` : match;
  }
  
  const cleanImport = trimmedImports.replace(/^default\s+/, '');
  return `const ${cleanImport} = require('${modulePath}');`;
}

function convertExportDefault(match, exported) {
  if (exported.match(/^(function|class)\s+\w+/)) {
    const nameMatch = exported.match(/^(?:function|class)\s+(\w+)/);
    if (nameMatch) {
      return `${exported.replace(/;$/, '')}\nmodule.exports = ${nameMatch[1]};`;
    }
  }
  return `module.exports = ${exported.replace(/;$/, '')};`;
}

function convertNamedExports(match, exports, fromModule) {
  if (fromModule) {
    return `const { ${exports} } = require('${fromModule}');\nmodule.exports = { ${exports} };`;
  }
  return `module.exports = { ${exports} };`;
}

function convertExportDeclaration(match, type, declaration) {
  const nameMatch = declaration.match(/^(\w+)/);
  const name = nameMatch ? nameMatch[1] : null;
  
  if (name && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    return `${type} ${declaration}\nmodule.exports.${name} = ${name};`;
  }
  
  return `${type} ${declaration}`;
}

function isValidSyntax(content) {
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  return openBraces === closeBraces;
}

function processJavaScriptFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  if (shouldSkipFile(content)) {
    return;
  }
  
  let changed = false;
  
  // Convert import statements
  content = content.replace(/^import\s+(.+?)\s+from\s+['"](.+?)['"];?\s*$/gm, (match, imports, modulePath) => {
    changed = true;
    return convertImportStatement(match, imports, modulePath);
  });
  
  // Convert export default
  content = content.replace(/^export\s+default\s+(.+?);?\s*$/gm, (match, exported) => {
    changed = true;
    return convertExportDefault(match, exported);
  });
  
  // Convert named exports
  content = content.replace(/^export\s+\{([^}]+)\}(?:\s+from\s+['"]([^'"]+)['"])?\s*;?\s*$/gm, (match, exports, fromModule) => {
    changed = true;
    return convertNamedExports(match, exports, fromModule);
  });
  
  // Convert export declarations
  content = content.replace(/^export\s+(const|let|var|function|class)\s+(.+?)$/gm, (match, type, declaration) => {
    changed = true;
    return convertExportDeclaration(match, type, declaration);
  });
  
  // Convert remaining exports
  content = content.replace(/^export\s+(?!default|const|let|var|function|class|\{)(.+?);?\s*$/gm, (match, exported) => {
    changed = true;
    const cleanExported = exported.trim();
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleanExported) 
      ? `module.exports.${cleanExported} = ${cleanExported};`
      : match;
  });
  
  if (changed && content !== originalContent && isValidSyntax(content)) {
    console.log(`✅ Fixed ES modules in: ${filePath}`);
    fs.writeFileSync(filePath, content, 'utf8');
  } else if (changed) {
    console.log(`⚠️ Skipped ${filePath} - potential syntax issues`);
  }
}

function convertESModulesToCommonJS(dir) {
  try {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      
      try {
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          convertESModulesToCommonJS(filePath);
        } else if (file.endsWith('.js')) {
          processJavaScriptFile(filePath);
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
