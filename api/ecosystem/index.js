const express = require('express');
const spendRouter = require('./spend');
const feesRouter = require('./fees');
const pumpfunFeesRouter = require('./pumpfun-fees');
const walletRouter = require('./wallet');
const dataRouter = require('./data');

const router = express.Router();

// Mount ecosystem routes
router.use('/spend', spendRouter);
router.use('/fees', feesRouter);
router.use('/pumpfun-fees', pumpfunFeesRouter);
router.use('/wallet', walletRouter);
router.use('/data', dataRouter);

// TEMPORARY ADMIN ROUTE COMPATIBILITY (until server restart)
// This allows admin dashboard to work by proxying to existing endpoints
router.use('/admin/spend', spendRouter); // Proxy /api/ecosystem/admin/spend to /api/ecosystem/spend

module.exports = router;
