const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

// Enhanced IP geolocation using multiple fallback services
async function getGeolocationFromIP(ip) {
  // For localhost/private IPs, return default data
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return {
      countryCode: 'US',
      countryName: 'United States',
      city: 'Local',
      region: 'Local',
      timezone: 'America/New_York',
      latitude: 40.7128,
      longitude: -74.0060
    };
  }
  const services = [
    {
      url: `http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,city,timezone,lat,lon`,
      transform: data => ({
        countryCode: data.countryCode,
        countryName: data.country,
        city: data.city,
        region: data.region,
        timezone: data.timezone,
        latitude: data.lat,
        longitude: data.lon
      })
    },
    {
      url: `https://ipapi.co/${ip}/json/`,
      transform: data => ({
        countryCode: data.country_code,
        countryName: data.country_name,
        city: data.city,
        region: data.region,
        timezone: data.timezone,
        latitude: data.latitude,
        longitude: data.longitude
      })
    }
  ];
  for (const service of services) {
    try {
      const response = await fetch(service.url, {
        headers: {
          'User-Agent': 'WhatNext-Analytics/1.0'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object' && !('error' in data)) {
          return service.transform(data);
        }
      }
    } catch (error) {
      console.warn(`Geolocation service failed: ${service.url}`, error);
      continue;
    }
  }
  return {
    countryCode: 'Unknown',
    countryName: 'Unknown',
    city: 'Unknown',
    region: 'Unknown',
    timezone: 'Unknown',
    latitude: null,
    longitude: null
  };
}

function getClientIP(req) {
  // Try multiple headers for getting real IP
  const xForwardedFor = req.headers['x-forwarded-for'];
  const xRealIp = req.headers['x-real-ip'];
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs, get the first one
    return xForwardedFor.split(',')[0].trim();
  }
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  if (xRealIp) {
    return xRealIp;
  }
  // Fallback to localhost for development
  return '127.0.0.1';
}

function detectBot(userAgent) {
  const botPatterns = [
    /bot/i, /crawl/i, /spider/i, /scrape/i,
    /curl/i, /wget/i, /http/i, /fetch/i,
    /headless/i, /phantom/i, /selenium/i,
    /puppeteer/i, /playwright/i, /chrome-lighthouse/i
  ];
  return botPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * POST /api/analytics/track-visitor
 * Track visitor sessions
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const clientIP = getClientIP(req);
    // Get enhanced geolocation data
    const geoData = await getGeolocationFromIP(clientIP);
    const supabase = getSupabaseAdminClient();
    // Check if this is a unique visitor
    const { data: existingSession } = await supabase
      .from('visitor_sessions')
      .select('id')
      .eq('ip_address', clientIP)
      .gte('session_start', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Within 24 hours
      .limit(1);
    const isUnique = !existingSession || existingSession.length === 0;
    // Enhanced visitor data with proper validation
    const sessionId = body.sessionId || `visitor-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const visitorData = {
      session_id: sessionId,
      user_agent: body.userAgent || 'Unknown',
      ip_address: clientIP,
      country_code: geoData.countryCode,
      country_name: geoData.countryName,
      city: geoData.city,
      region: geoData.region,
      timezone: geoData.timezone,
      latitude: geoData.latitude,
      longitude: geoData.longitude,
      referrer: body.referrer || '',
      landing_page: body.landingPage || req.headers.referer || '',
      browser: body.browser || 'Unknown',
      browser_version: body.browserVersion || 'Unknown',
      os: body.os || 'Unknown',
      os_version: body.osVersion || 'Unknown',
      device_type: ['desktop', 'mobile', 'tablet'].includes(body.deviceType) ? body.deviceType : 'desktop',
      screen_resolution: body.screenResolution || 'Unknown',
      language: body.language || 'en',
      is_bot: detectBot(body.userAgent || ''),
      is_unique: isUnique,
      session_start: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      page_views: 1,
      session_duration: 0,
      is_active: true
    };
    // Insert visitor session
    const { data, error } = await supabase
      .from('visitor_sessions')
      .insert([visitorData])
      .select('id')
      .single();
    if (error) {
      console.error('Error inserting visitor session:', error);
      // Handle specific constraint violations gracefully
      if (error.code === '23505') { // Unique constraint violation
        console.log('Duplicate session detected, returning existing session');
        return res.json({ success: true, visitorId: `duplicate-${Date.now()}`, country: geoData.countryName, isUnique: false });
      }
      if (error.code === '23503') { // Foreign key constraint violation
        console.log('Foreign key constraint violation, continuing without foreign keys');
        // Try again without problematic references
        const simpleVisitorData = {
          session_id: body.sessionId,
          user_agent: body.userAgent,
          ip_address: clientIP,
          country_code: geoData.countryCode,
          country_name: geoData.countryName,
          is_unique: isUnique,
          session_start: new Date().toISOString()
        };
        const { data: retryData } = await supabase
          .from('visitor_sessions')
          .insert([simpleVisitorData])
          .select('id')
          .single();
        if (retryData) {
          return res.json({ success: true, visitorId: retryData.id, country: geoData.countryName, isUnique });
        }
      }
      return res.status(500).json({ error: 'Failed to track visitor' });
    }
    console.log(`✅ Visitor tracked: ${geoData.countryName} (${clientIP}) - Unique: ${isUnique}`);
    return res.json({ success: true, visitorId: data.id, country: geoData.countryName, isUnique });
  } catch (error) {
    console.error('Error tracking visitor:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

