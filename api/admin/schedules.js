const express = require('express');
const { getSupabaseAdminClient  } = require('../../database.js');

const router = express.Router();

// GET - Fetch schedules with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, limit = '100', offset = '0' } = req.query;
    const limitNum = parseInt(limit);
    const offsetNum = parseInt(offset);
    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('schedules')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);
    if (status) {
      query = query.eq('status', status);
    }
    const { data: schedules, error } = await query;
    if (error) {
      console.error('Error fetching schedules:', error);
      return res.status(500).json({ error: 'Failed to fetch schedules' });
    }
    res.json({
      schedules: schedules || [],
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total: schedules?.length || 0
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST - Create new schedule
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      image_url,
      event_date,
      event_time,
      location,
      tags,
      is_featured = false,
      status
    } = req.body;
    if (!title || !image_url || !event_date) {
      return res.status(400).json({ error: 'Title, image URL, and event date are required' });
    }
    let finalStatus = status;
    if (!finalStatus) {
      const eventDate = new Date(event_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      eventDate.setHours(0, 0, 0, 0);
      if (eventDate < today) {
        finalStatus = 'past';
      } else if (eventDate.getTime() === today.getTime()) {
        finalStatus = 'live';
      } else {
        finalStatus = 'upcoming';
      }
    }
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('schedules')
      .insert({
        title,
        description,
        image_url,
        event_date,
        event_time,
        location,
        tags: tags || [],
        is_featured,
        status: finalStatus
      })
      .select()
      .single();
    if (error) {
      console.error('Error creating schedule:', error);
      return res.status(500).json({ error: 'Failed to create schedule' });
    }
    res.status(201).json({ schedule: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT - Update existing schedule
router.put('/', async (req, res) => {
  try {
    const {
      id,
      title,
      description,
      image_url,
      event_date,
      event_time,
      location,
      tags,
      is_featured,
      status
    } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Schedule ID is required' });
    }
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (event_date !== undefined) updateData.event_date = event_date;
    if (event_time !== undefined) updateData.event_time = event_time;
    if (location !== undefined) updateData.location = location;
    if (tags !== undefined) updateData.tags = tags;
    if (is_featured !== undefined) updateData.is_featured = is_featured;
    if (status !== undefined) updateData.status = status;
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('schedules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('Error updating schedule:', error);
      return res.status(500).json({ error: 'Failed to update schedule' });
    }
    res.json({ schedule: data });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE - Remove schedule
router.delete('/', async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ error: 'Schedule ID is required' });
    }
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('schedules')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting schedule:', error);
      return res.status(500).json({ error: 'Failed to delete schedule' });
    }
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

