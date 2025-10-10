const fs = require('fs');

// Read the file
let content = fs.readFileSync('api/claim.js', 'utf8');

// Split into lines
let lines = content.split('\n');

// Track which lines to keep
let newLines = [];
let foundFirstRouter = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip duplicate express requires and database imports and router declarations
    if (line.includes("const express = require('express')") && foundFirstRouter) {
        continue;
    }
    if (line.includes("const { getSupabaseAdminClient") && foundFirstRouter) {
        continue;  
    }
    if (line.includes("const { getSupabaseClient") && foundFirstRouter) {
        continue;
    }
    if (line.includes("const router = express.Router()")) {
        if (foundFirstRouter) {
            continue; // Skip all subsequent router declarations
        } else {
            foundFirstRouter = true; // Keep the first one
        }
    }
    
    newLines.push(line);
}

// Write back the cleaned content
fs.writeFileSync('api/claim.js', newLines.join('\n'));
console.log('✅ Cleaned up claim.js - removed duplicate declarations');