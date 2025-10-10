const fs = require('fs');

console.log(' Starting route fix...');

const indexPath = './index.js';
let content = fs.readFileSync(indexPath, 'utf8');

const newMountRoutes = `// Mount ALL API routes with error handling
const mountRoutes = () => {
  try {
    let loadedRoutes = 0;
    
    // ALL API routes in correct order - SPECIFIC ROUTES FIRST, GENERAL ROUTES LAST
    const originalRoutes = [
      // MOST SPECIFIC ROUTES FIRST (3+ path segments)
      { path: '/api/admin/ecosystem/spend', file: './api/admin/ecosystem/spend.js' },
      { path: '/api/admin/settings/api-config', file: './api/admin/settings/api-config.js' },
      { path: '/api/admin/social/update-followers', file: './api/admin/social/update-followers.js' },
      { path: '/api/analytics/track/session', file: './api/analytics/track/session.js' },
      { path: '/api/analytics/track/session-update', file: './api/analytics/track/session-update.js' },
      
      // SPECIFIC SUB-ROUTES (2 path segments)
      { path: '/api/admin/add-password', file: './api/admin/add-password.js' },
      { path: '/api/admin/analytics', file: './api/admin/analytics.js' },
      { path: '/api/admin/api-config', file: './api/admin/api-config.js' },
      { path: '/api/admin/claims', file: './api/admin/claims.js' },
      { path: '/api/admin/content', file: './api/admin/content.js' },
      { path: '/api/admin/dashboard', file: './api/admin/dashboard.js' },
      { path: '/api/admin/ecosystem', file: './api/admin/ecosystem.js' },
      { path: '/api/admin/force-populate-settings', file: './api/admin/force-populate-settings.js' },
      { path: '/api/admin/giveaway', file: './api/admin/giveaway.js' },
      { path: '/api/admin/giveaway-payout', file: './api/admin/giveaway-payout.js' },
      { path: '/api/admin/giveaway-process', file: './api/admin/giveaway-process.js' },
      { path: '/api/admin/live-stream', file: './api/admin/live-stream.js' },
      { path: '/api/admin/locations', file: './api/admin/locations.js' },
      { path: '/api/admin/login', file: './api/admin/login.js' },
      { path: '/api/admin/media', file: './api/admin/media.js' },
      { path: '/api/admin/populate-settings', file: './api/admin/populate-settings.js' },
      { path: '/api/admin/pumpfun', file: './api/admin/pumpfun.js' },
      { path: '/api/admin/roadmap', file: './api/admin/roadmap.js' },
      { path: '/api/admin/schedules', file: './api/admin/schedules.js' },
      { path: '/api/admin/settings', file: './api/admin/settings.js' },
      { path: '/api/admin/social', file: './api/admin/social.js' },
      { path: '/api/admin/stats', file: './api/admin/stats.js' },
      { path: '/api/admin/toggle-live', file: './api/admin/toggle-live.js' },
      { path: '/api/admin/upload', file: './api/admin/upload.js' },
      { path: '/api/admin/users', file: './api/admin/users.js' },
      
      // Analytics specific routes
      { path: '/api/analytics/live', file: './api/analytics/live.js' },
      { path: '/api/analytics/performance', file: './api/analytics/performance.js' },
      { path: '/api/analytics/realtime', file: './api/analytics/realtime.js' },
      { path: '/api/analytics/track-event', file: './api/analytics/track-event.js' },
      { path: '/api/analytics/track-pageview', file: './api/analytics/track-pageview.js' },
      { path: '/api/analytics/track-visitor', file: './api/analytics/track-visitor.js' },
      { path: '/api/analytics/update-pageview', file: './api/analytics/update-pageview.js' },
      
      // Ecosystem specific routes
      { path: '/api/ecosystem/data', file: './api/ecosystem/data.js' },
      { path: '/api/ecosystem/fees', file: './api/ecosystem/fees.js' },
      { path: '/api/ecosystem/pumpfun-fees', file: './api/ecosystem/pumpfun-fees.js' },
      { path: '/api/ecosystem/spend', file: './api/ecosystem/spend.js' },
      { path: '/api/ecosystem/wallet', file: './api/ecosystem/wallet.js' },
      
      // PumpFun specific routes  
      { path: '/api/pumpfun/data', file: './api/pumpfun/data.js' },
      { path: '/api/pumpfun/stats', file: './api/pumpfun/stats.js' },
      { path: '/api/pumpfun/token-data', file: './api/pumpfun/token-data.js' },
      
      // Settings specific routes
      { path: '/api/settings/public', file: './api/settings/public.js' },
      
      // Social specific routes
      { path: '/api/social/auto-update', file: './api/social/auto-update.js' },
      { path: '/api/social/community-tweets', file: './api/social/community-tweets.js' },
      { path: '/api/social/twitter-followers', file: './api/social/twitter-followers.js' },
      
      // Other specific routes
      { path: '/api/bunny-net', file: './api/bunny-net/bunny.js' },
      { path: '/api/claim/validate', file: './api/claim/validate.js' },
      { path: '/api/giveaway/winners', file: './api/giveaway/winners.js' },
      { path: '/api/media/track-view', file: './api/media/track-view.js' },
      { path: '/api/twitter/stats', file: './api/twitter/stats.js' },
      
      // GENERAL/ROOT ROUTES LAST
      { path: '/api/claim', file: './api/claim.js' },
      { path: '/api/debug', file: './api/debug.js' },
      { path: '/api/giveaway', file: './api/giveaway.js' },
      { path: '/api/locations', file: './api/locations.js' },
      { path: '/api/media', file: './api/media.js' },
      { path: '/api/metadata', file: './api/metadata.js' },
      { path: '/api/qr-codes', file: './api/qr-codes.js' },
      { path: '/api/raw-db', file: './api/raw-db.js' },
      { path: '/api/roadmap', file: './api/roadmap.js' },
      { path: '/api/schedules', file: './api/schedules.js' },
      { path: '/api/seed', file: './api/seed.js' },
      { path: '/api/stats', file: './api/stats.js' },
      { path: '/api/testimonials', file: './api/testimonials.js' },
      { path: '/api/video-test', file: './api/video-test.js' },
      { path: '/api/claim-validation', file: './api/claim-validation.js' },
      
      // INDEX ROUTES ABSOLUTE LAST
      { path: '/api/admin', file: './api/admin/index.js' },
      { path: '/api/analytics', file: './api/analytics/index.js' },
      { path: '/api/ecosystem', file: './api/ecosystem/index.js' },
      { path: '/api/pumpfun', file: './api/pumpfun/index.js' },
      { path: '/api/settings', file: './api/settings/index.js' },
      { path: '/api/social', file: './api/social/index.js' }
    ];

    originalRoutes.forEach(route => {
      try {
        const router = require(route.file);
        app.use(route.path, router);
        loadedRoutes++;
        console.log(\` Loaded route: \${route.path}\`);
      } catch (error) {
        console.log(\` Could not load route \${route.path}:\`, error.message);
      }
    });

    console.log(\` Successfully loaded \${loadedRoutes} API routes\`);
  } catch (error) {
    console.log(' Error during route mounting:', error.message);
  }
};`;

const mountRoutesRegex = /\/\/ Mount ALL API routes with error handling[\s\S]*?};/;
content = content.replace(mountRoutesRegex, newMountRoutes);

fs.writeFileSync(indexPath, content);

console.log(' Routes fixed!');
