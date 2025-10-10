const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Locations API working',
    timestamp: new Date().toISOString(),
    data: []
  });
});

module.exports = router;
