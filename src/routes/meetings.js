const express = require('express');
const { body, param, validationResult } = require('express-validator');
const meetingService = require('../services/meetingService');
const aiService = require('../services/aiService');

const router = express.Router();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

// Schedule a new meeting
router.post('/schedule', [
  body('title').notEmpty().withMessage('Meeting title is required'),
  body('participants').isArray({ min: 1 }).withMessage('At least one participant is required'),
  body('scheduledTime').isISO8601().withMessage('Valid scheduled time is required'),
  body('isVirtualScrumMaster').isBoolean().withMessage('Virtual scrum master preference must be boolean'),
  body('recurrence').optional().isIn(['none', 'daily', 'weekly']).withMessage('Invalid recurrence type'),
  body('timezone').optional().isString().withMessage('Timezone must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const meetingData = {
      title: req.body.title,
      participants: req.body.participants,
      scheduledTime: req.body.scheduledTime,
      duration: req.body.duration || 30,
      isVirtualScrumMaster: req.body.isVirtualScrumMaster || false,
      timezone: req.body.timezone || 'UTC',
      recurrence: req.body.recurrence || 'none',
      createdBy: req.user?.id || 'system' // Assume user middleware sets req.user
    };

    const meeting = await meetingService.scheduleMeeting(meetingData);

    res.status(201).json({
      success: true,
      data: meeting,
      message: 'Meeting scheduled successfully'
    });
  } catch (error) {
    console.error('Error scheduling meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to schedule meeting'
    });
  }
});

// Get user's meetings
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const meetings = await meetingService.getMeetings(userId);
    
    res.json({
      success: true,
      data: meetings
    });
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch meetings'
    });
  }
});

// Get specific meeting details
router.get('/:meetingId', async (req, res) => {
  try {
    const meeting = await meetingService.getMeeting(req.params.meetingId);
    
    res.json({
      success: true,
      data: meeting
    });
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(error.message === 'Meeting not found' ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to fetch meeting'
    });
  }
});

// Start a meeting manually
router.post('/:meetingId/start', async (req, res) => {
  try {
    const session = await meetingService.startMeeting(req.params.meetingId);
    
    res.json({
      success: true,
      data: session,
      message: 'Meeting started successfully'
    });
  } catch (error) {
    console.error('Error starting meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to start meeting'
    });
  }
});

// Join a meeting
router.post('/:meetingId/join', [
  param('meetingId').isUUID().withMessage('Valid meeting ID is required'),
  body('participantName').notEmpty().withMessage('Participant name is required')
], handleValidationErrors, async (req, res) => {
  try {
    const joinData = await meetingService.joinMeeting(
      req.params.meetingId,
      req.body.participantName
    );
    
    res.json({
      success: true,
      data: joinData,
      message: 'Successfully joined meeting'
    });
  } catch (error) {
    console.error('Error joining meeting:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      message: error.message || 'Failed to join meeting'
    });
  }
});

// Submit standup response
router.post('/:meetingId/standup-response', [
  param('meetingId').isUUID().withMessage('Valid meeting ID is required'),
  body('participantName').notEmpty().withMessage('Participant name is required'),
  body('response').notEmpty().withMessage('Response is required')
], handleValidationErrors, async (req, res) => {
  try {
    const responseData = await meetingService.submitStandupResponse(
      req.params.meetingId,
      req.body.participantName,
      req.body.response
    );
    
    res.json({
      success: true,
      data: responseData
    });
  } catch (error) {
    console.error('Error submitting standup response:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to submit response'
    });
  }
});

// End meeting manually
router.post('/:meetingId/end', [
  param('meetingId').isUUID().withMessage('Valid meeting ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const results = await meetingService.endMeeting(req.params.meetingId);
    
    res.json({
      success: true,
      data: results,
      message: 'Meeting ended successfully'
    });
  } catch (error) {
    console.error('Error ending meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to end meeting'
    });
  }
});

// Cancel meeting
router.delete('/:meetingId', [
  param('meetingId').isUUID().withMessage('Valid meeting ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    const meeting = await meetingService.cancelMeeting(req.params.meetingId);
    
    res.json({
      success: true,
      data: meeting,
      message: 'Meeting cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling meeting:', error);
    res.status(error.message === 'Meeting not found' ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to cancel meeting'
    });
  }
});

// Get active meeting sessions (admin endpoint)
router.get('/admin/active-sessions', async (req, res) => {
  try {
    const sessions = await meetingService.getActiveSessions();
    
    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    console.error('Error fetching active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active sessions'
    });
  }
});

// WebSocket endpoint for real-time meeting updates
router.get('/:meetingId/status', [
  param('meetingId').isUUID().withMessage('Valid meeting ID is required')
], handleValidationErrors, async (req, res) => {
  try {
    // This would typically be implemented with WebSocket
    // For now, return current meeting status
    const meeting = await meetingService.getMeeting(req.params.meetingId);
    
    res.json({
      success: true,
      data: {
        status: meeting.status,
        startedAt: meeting.startedAt,
        endedAt: meeting.endedAt
      }
    });
  } catch (error) {
    console.error('Error fetching meeting status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch meeting status'
    });
  }
});

module.exports = router;
