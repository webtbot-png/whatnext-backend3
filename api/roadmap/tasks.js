const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: tasks, error } = await supabase
      .from('roadmap_tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('❌ Roadmap tasks error:', error);
      return res.status(200).json({
        success: true,
        tasks: [],
        message: 'No tasks table found'
      });
    }
    res.json({
      success: true,
      tasks: tasks || [],
      count: tasks?.length || 0
    });
  } catch (error) {
    console.error('❌ Roadmap tasks error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roadmap tasks'
    });
  }
});

module.exports = router;

