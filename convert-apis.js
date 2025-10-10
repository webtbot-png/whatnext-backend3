const fs = require('fs');
const path = require('path');

// Function to convert a single file from ES modules to CommonJS
function convertESMtoCommonJS(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace import statements
    content = content.replace(/import express from 'express';/g, "const express = require('express');");
    content = content.replace(/import { getSupabaseAdminClient } from ['"][^'"]*database[^'"]*['"];/g, "const { getSupabaseAdminClient } = require('../database.js');");
    content = content.replace(/import { getSupabaseClient } from ['"][^'"]*database[^'"]*['"];/g, "const { getSupabaseClient } = require('../database.js');");
    content = content.replace(/import \* as dotenv from 'dotenv';/g, "const dotenv = require('dotenv');");
    content = content.replace(/import cors from 'cors';/g, "const cors = require('cors');");
    content = content.replace(/import helmet from 'helmet';/g, "const helmet = require('helmet');");
    content = content.replace(/import jsonwebtoken from 'jsonwebtoken';/g, "const jsonwebtoken = require('jsonwebtoken');");
    content = content.replace(/import jwt from 'jsonwebtoken';/g, "const jwt = require('jsonwebtoken');");
    content = content.replace(/import multer from 'multer';/g, "const multer = require('multer');");
    content = content.replace(/import sharp from 'sharp';/g, "const sharp = require('sharp');");
    content = content.replace(/import axios from 'axios';/g, "const axios = require('axios');");
    
    // Replace export default
    content = content.replace(/export default router;/g, 'module.exports = router;');
    content = content.replace(/export default/g, 'module.exports =');
    
    // Write back to file
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Converted: ${filePath}`);
    return true;
  } catch (error) {
    console.log(`❌ Failed to convert: ${filePath} - ${error.message}`);
    return false;
  }
}

// Convert all JS files in the api directory
function convertAllAPIFiles() {
  const apiDir = './api';
  const files = fs.readdirSync(apiDir);
  
  let converted = 0;
  
  files.forEach(file => {
    if (file.endsWith('.js') && !file.includes('working')) {
      const filePath = path.join(apiDir, file);
      if (convertESMtoCommonJS(filePath)) {
        converted++;
      }
    }
  });
  
  // Also convert subdirectory files
  const subdirs = ['admin', 'analytics', 'pumpfun', 'ecosystem', 'social', 'giveaway', 'claim', 'roadmap', 'settings', 'media', 'twitter', 'bunny-net'];
  
  subdirs.forEach(subdir => {
    const subdirPath = path.join(apiDir, subdir);
    if (fs.existsSync(subdirPath)) {
      const subFiles = fs.readdirSync(subdirPath);
      subFiles.forEach(file => {
        if (file.endsWith('.js')) {
          const filePath = path.join(subdirPath, file);
          if (convertESMtoCommonJS(filePath)) {
            converted++;
          }
        }
      });
    }
  });
  
  console.log(`🎉 Converted ${converted} API files to CommonJS!`);
}

// Run the conversion
convertAllAPIFiles();