const express = require('express');
const dataRouter = require('./data');
const spendRouter = require('./spend');
const feesRouter = require('./fees');
const pumpfunFeesRouter = require('./pumpfun-fees');
const walletRouter = require('./wallet');

const router = express.Router();

// Mount ecosystem routes
router.use('/data', dataRouter);
router.use('/spend', spendRouter);
router.use('/fees', feesRouter);
router.use('/pumpfun-fees', pumpfunFeesRouter);
router.use('/wallet', walletRouter);

// NOTE: Admin ecosystem routes are handled separately at /api/admin/ecosystem/*
// No need for proxy routes here to avoid conflicts

module.exports = router;
