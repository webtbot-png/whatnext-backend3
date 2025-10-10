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

// ❌ REMOVED: Problematic admin proxy causing infinite request loops
// router.use('/admin/spend', spendRouter);

module.exports = router;
