const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

// GET /api/admin/roadmap
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const includeTasks = req.query.include_tasks === 'true' || req.query.includeTasks === 'true';
    const { data: roadmapData, error } = await supabase
      .from('roadmap_steps')
      .select('*')
      .order('step_number');
    console.log('Admin roadmap query result:', { roadmapData, error, count: roadmapData?.length });
    if (roadmapData && roadmapData.length > 0) {
      let tasksData = [];
      if (includeTasks) {
        const { data: tasks, error: tasksError } = await supabase
          .from('roadmap_tasks')
          .select('*')
          .order('order_index');
        if (!tasksError && tasks) {
          tasksData = tasks;
        }
      }
      const roadmapSteps = roadmapData.map(step => ({
        id: step.id.toString(),
        stepNumber: step.step_number || step.phase_order || 1,
        title: step.title || step.name || 'Untitled Step',
        description: step.description || '',
        status: step.status || 'pending',
        targetQuarter: step.target_quarter || 'TBD',
        marketCapGoal: step.market_cap_goal || 'TBD',
        holderTarget: step.holder_target || 'TBD',
        isFeatured: step.is_featured || false,
        orderIndex: step.order_index || step.step_number || 1,
        createdAt: step.created_at,
        updatedAt: step.updated_at,
        tasks: includeTasks ? tasksData.filter(task => task.roadmap_step_id === step.id).map(task => ({
          id: task.id.toString(),
          text: task.task_description || task.title || 'Untitled Task',
          description: task.task_description || task.description || '',
          completed: task.is_completed || false,
          roadmapStepId: task.roadmap_step_id,
          orderIndex: task.order_index || 0,
          createdAt: task.created_at,
          updatedAt: task.updated_at
        })) : []
      }));
      const completedSteps = roadmapSteps.filter(s => s.status === 'completed').length;
      const activeSteps = roadmapSteps.filter(s => s.status === 'in-progress').length;
      const pendingSteps = roadmapSteps.filter(s => s.status === 'pending').length;
      return res.json({
        success: true,
        roadmapSteps,
        settings: {
          enabled: true,
          publicVisible: true,
          maintenance: false
        },
        totalSteps: roadmapSteps.length,
        completedSteps,
        activeSteps,
        pendingSteps,
        lastUpdated: new Date().toISOString()
      });
    }
    return res.json({
      success: true,
      roadmapSteps: [],
      settings: {
        enabled: true,
        publicVisible: true,
        maintenance: false
      },
      totalSteps: 0,
      completedSteps: 0,
      activeSteps: 0,
      pendingSteps: 0,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Admin roadmap error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch roadmap data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/admin/roadmap
router.post('/', async (req, res) => {
  try {
    const { populate } = req.query;
    const supabase = getSupabaseAdminClient();
    if (populate === 'true') {
      const defaultSteps = [
        {
          step_number: 1,
          title: 'Foundation & Token Launch',
          description: 'Launch official website & socials, finalize What Next branding/logo, token launch on PumpFun (fair entry), and activate livestream concept where "What Next?" is decided by chat.',
          status: 'in-progress',
          target_quarter: 'COMPLETED / IN PROGRESS',
          market_cap_goal: 'Foundation Launch',
          holder_target: 'Initial Launch',
          is_featured: true,
          order_index: 1
        },
        {
          step_number: 2,
          title: 'First Milestone & Global Kickoff',
          description: 'Reach $150K Market Cap. Book the first flight live on stream (chat votes destination). Begin the global travel journey.',
          status: 'pending',
          target_quarter: 'PENDING',
          market_cap_goal: '$150K Market Cap',
          holder_target: 'Global Travel Kickoff',
          is_featured: true,
          order_index: 2
        },
        {
          step_number: 3,
          title: 'Building the Core Community',
          description: 'Reach 1,000 live active viewers consistently. Grow to 2,000+ holders. Market cap target: $500K.',
          status: 'pending',
          target_quarter: 'PENDING',
          market_cap_goal: '$500K Market Cap',
          holder_target: '2,000 holders',
          is_featured: true,
          order_index: 3
        }
      ];
      const { data, error } = await supabase
        .from('roadmap_steps')
        .upsert(defaultSteps, { onConflict: 'step_number' })
        .select();
      if (error) {
        console.error('Error populating roadmap:', error);
        return res.status(500).json({ 
          success: false,
          error: error.message 
        });
      }
      return res.json({
        success: true,
        message: `Successfully populated ${data?.length || 0} roadmap steps`,
        data
      });
    }
    const stepData = req.body;
    const { data, error } = await supabase
      .from('roadmap_steps')
      .insert([stepData])
      .select();
    if (error) {
      console.error('Error creating roadmap step:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
    return res.json({
      success: true,
      data: data[0]
    });
  } catch (error) {
    console.error('Admin roadmap POST error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create roadmap data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/admin/roadmap/step/:id
router.put('/step/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('roadmap_steps')
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) {
      console.error('Error updating roadmap step:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
    return res.json({
      success: true,
      data: data[0]
    });
  } catch (error) {
    console.error('Admin roadmap PUT error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update roadmap data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/admin/roadmap/task/:id
router.put('/task/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;
    const supabase = getSupabaseAdminClient();
    console.log(`Updating task ${id} completion to:`, completed);
    const { data, error } = await supabase
      .from('roadmap_tasks')
      .update({ 
        is_completed: completed,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();
    if (error) {
      console.error('Error updating task:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
    console.log('Task updated successfully:', data);
    return res.json({
      success: true,
      data: data[0]
    });
  } catch (error) {
    console.error('Task update error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update task',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/admin/roadmap/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('roadmap_steps')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting roadmap step:', error);
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
    return res.json({
      success: true,
      message: 'Roadmap step deleted successfully'
    });
  } catch (error) {
    console.error('Admin roadmap DELETE error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to delete roadmap data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;

