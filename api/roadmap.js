const express = require('express');
const { getSupabaseAdminClient } = require('../database');

const router = express.Router();

// GET /api/roadmap - Get public roadmap data from database
router.get('/', async (req, res) => {
  try {
    const supabase = getSupabaseAdminClient();
    const includeTasks = req.query.include_tasks === 'true' || req.query.includeTasks === 'true';
    console.log('??? Express roadmap API: Fetching steps from database...');
    // Get roadmap steps from database
    const { data: stepsData, error: stepsError } = await supabase
      .from('roadmap_steps')
      .select('*')
      .order('step_number');
    if (stepsError) {
      console.error('? Express roadmap steps error:', stepsError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch roadmap steps',
        details: stepsError.message
      });
    }
    console.log(`? Express roadmap: Found ${stepsData?.length || 0} steps`);
    let tasksData = [];
    if (includeTasks) {
      console.log('? Express roadmap: Fetching tasks from database...');
      const { data: tasks, error: tasksError } = await supabase
        .from('roadmap_tasks')
        .select('*')
        .order('roadmap_step_id, order_index');
      if (tasksError) {
        console.error('? Express roadmap tasks error:', tasksError);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch roadmap tasks',
          details: tasksError.message
        });
      } else {
        tasksData = tasks || [];
        console.log(`? Express roadmap: Found ${tasksData.length} tasks`);
      }
    }
    // Transform database data to match frontend format
    const transformedSteps = (stepsData || []).map((step) => {
      const stepTasks = includeTasks ?
        tasksData.filter((task) => task.roadmap_step_id === step.id) : [];
      return {
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
        tasks: stepTasks.map((task) => ({
          id: task.id.toString(),
          text: task.task_description || task.title || 'Untitled Task',
          description: task.task_description || task.description || '',
          completed: task.is_completed || false,
          roadmapStepId: task.roadmap_step_id,
          orderIndex: task.order_index || 0,
          createdAt: task.created_at,
          updatedAt: task.updated_at
        }))
      };
    });
    // Calculate summary statistics
    const totalTasks = transformedSteps.reduce((sum, step) => sum + step.tasks.length, 0);
    const completedTasks = transformedSteps.reduce((sum, step) =>
      sum + step.tasks.filter(task => task.completed).length, 0
    );
    console.log(`? Express roadmap: Returning ${transformedSteps.length} steps with ${totalTasks} total tasks`);
    return res.json({
      success: true,
      roadmapSteps: transformedSteps,
      totalSteps: transformedSteps.length,
      totalTasks,
      completedTasks,
      progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('? Express roadmap error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch roadmap data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
// PUT /api/roadmap/task/:taskId - Update task completion status
router.put('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { completed, isCompleted } = req.body;
    const supabase = getSupabaseAdminClient();
    const completionStatus = completed === undefined ? isCompleted : completed;
    console.log(`?? Express roadmap: Updating task ${taskId} completion to ${completionStatus}`);
    const { data, error } = await supabase
      .from('roadmap_tasks')
      .update({
        is_completed: completionStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select();
    if (error) {
      console.error('? Express roadmap task update error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update task'
      });
    }
    console.log(`? Express roadmap: Task ${taskId} updated successfully`);
    return res.json({
      success: true,
      message: 'Task updated successfully',
      updatedTask: data[0]
    });
  } catch (error) {
    console.error('? Express roadmap task update error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update task',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
// PUT /api/roadmap/step/:stepId - Update step status
router.put('/step/:stepId', async (req, res) => {
  try {
    const { stepId } = req.params;
    const { status } = req.body;
    const supabase = getSupabaseAdminClient();
    console.log(`?? Express roadmap: Updating step ${stepId} status to ${status}`);
    const { data, error } = await supabase
      .from('roadmap_steps')
      .update({
        status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', stepId)
      .select();
    if (error) {
      console.error('? Express roadmap step update error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update step'
      });
    }
    console.log(`? Express roadmap: Step ${stepId} updated successfully`);
    return res.json({
      success: true,
      message: 'Step updated successfully',
      updatedStep: data[0]
    });
  } catch (error) {
    console.error('? Express roadmap step update error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update step',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

module.exports = router;
