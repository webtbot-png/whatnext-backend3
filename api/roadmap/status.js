const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: roadmapSteps, error } = await supabase
      .from('roadmap_steps')
      .select('status, step_number')
      .order('step_number', { ascending: true });
    if (error) {
      throw error;
    }
    const statusSummary = {
      total: roadmapSteps?.length || 0,
      completed: roadmapSteps?.filter(step => step.status === 'completed').length || 0,
      inProgress: roadmapSteps?.filter(step => step.status === 'in-progress').length || 0,
      pending: roadmapSteps?.filter(step => step.status === 'pending').length || 0,
      notStarted: roadmapSteps?.filter(step => step.status === 'not-started').length || 0
    };
    const currentStep = roadmapSteps?.find(step => step.status === 'in-progress')?.step_number || 1;
    res.json({
      success: true,
      status: statusSummary,
      currentStep,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Roadmap status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roadmap status'
    });
  }
});

module.exports = router;

