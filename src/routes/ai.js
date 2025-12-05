const express = require('express');
const { body, validationResult } = require('express-validator');
const aiService = require('../services/aiService');

const router = express.Router();

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

// Generate AI response for custom prompts
router.post('/generate-response', [
  body('prompt').notEmpty().withMessage('Prompt is required'),
  body('systemRole').optional().isIn(['scrumMaster', 'summarizer', 'blockerAnalyzer'])
    .withMessage('Invalid system role')
], handleValidationErrors, async (req, res) => {
  try {
    const { prompt, systemRole = 'scrumMaster', context = {} } = req.body;
    
    const response = await aiService.generateResponse(prompt, systemRole, context);
    
    res.json({
      success: true,
      data: {
        response,
        systemRole,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error generating AI response:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate AI response'
    });
  }
});

// Analyze meeting summary for insights
router.post('/analyze-meeting', [
  body('meetingData').notEmpty().withMessage('Meeting data is required')
], handleValidationErrors, async (req, res) => {
  try {
    const insights = await aiService.generateMeetingInsights(req.body.meetingData);
    
    res.json({
      success: true,
      data: insights
    });
  } catch (error) {
    console.error('Error analyzing meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze meeting'
    });
  }
});

// Analyze specific blockers
router.post('/analyze-blockers', [
  body('blockers').isArray().withMessage('Blockers must be an array')
], handleValidationErrors, async (req, res) => {
  try {
    const analysis = await aiService.analyzeBlockers(req.body.blockers);
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error analyzing blockers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to analyze blockers'
    });
  }
});

// Generate meeting summary from raw data
router.post('/summarize', [
  body('meetingData').notEmpty().withMessage('Meeting data is required')
], handleValidationErrors, async (req, res) => {
  try {
    const summary = await aiService.summarizeMeeting(req.body.meetingData);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Error summarizing meeting:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to summarize meeting'
    });
  }
});

// Health check for AI service
router.get('/health', async (req, res) => {
  try {
    // Test AI service with a simple prompt
    const testResponse = await aiService.generateResponse('Hello, are you working?', 'scrumMaster');
    
    res.json({
      success: true,
      message: 'AI service is healthy',
      testResponse: testResponse.substring(0, 100) + '...' // Truncated for brevity
    });
  } catch (error) {
    console.error('AI health check failed:', error);
    res.status(503).json({
      success: false,
      message: 'AI service is not available',
      error: error.message
    });
  }
});

// Get available AI system roles and their descriptions
router.get('/system-roles', (req, res) => {
  const roles = {
    scrumMaster: {
      name: 'Scrum Master',
      description: 'Acts as a virtual scrum master during standup meetings',
      use: 'For conducting standup sessions and providing scrum guidance'
    },
    summarizer: {
      name: 'Meeting Summarizer',
      description: 'Creates comprehensive summaries of standup meetings',
      use: 'For generating meeting summaries and reports'
    },
    blockerAnalyzer: {
      name: 'Blocker Analyzer',
      description: 'Analyzes project blockers and provides recommendations',
      use: 'For analyzing impediments and suggesting solutions'
    }
  };

  res.json({
    success: true,
    data: roles
  });
});

module.exports = router;
