const express = require('express');
const { body, param, validationResult } = require('express-validator');
const devopsService = require('../services/devopsService');

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

// Get work items for a user
router.get('/work-items/:assignee', [
  param('assignee').notEmpty().withMessage('Assignee is required')
], handleValidationErrors, async (req, res) => {
  try {
    const project = req.query.project || process.env.AZURE_DEVOPS_PROJECT;
    if (!project) {
      return res.status(400).json({
        success: false,
        message: 'Project parameter is required'
      });
    }

    const workItems = await devopsService.getWorkItemsByAssignee(project, req.params.assignee);
    
    res.json({
      success: true,
      data: workItems
    });
  } catch (error) {
    console.error('Error fetching work items:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch work items'
    });
  }
});

// Create a task from a blocker
router.post('/create-blocker-task', [
  body('project').notEmpty().withMessage('Project is required'),
  body('blocker').notEmpty().withMessage('Blocker information is required'),
  body('assignee').notEmpty().withMessage('Assignee is required')
], handleValidationErrors, async (req, res) => {
  try {
    const { project, blocker, assignee } = req.body;
    
    const task = await devopsService.createTaskFromBlocker(project, blocker, assignee);
    
    res.status(201).json({
      success: true,
      data: task,
      message: 'Blocker task created successfully'
    });
  } catch (error) {
    console.error('Error creating blocker task:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create blocker task'
    });
  }
});

// Health check for DevOps service
router.get('/health', async (req, res) => {
  try {
    await devopsService.initialize();
    
    res.json({
      success: true,
      message: 'Azure DevOps service is healthy',
      initialized: devopsService.initialized
    });
  } catch (error) {
    console.error('DevOps health check failed:', error);
    res.status(503).json({
      success: false,
      message: 'Azure DevOps service is not available',
      error: error.message
    });
  }
});

// Get project information
router.get('/projects', async (req, res) => {
  try {
    // This would typically fetch projects from Azure DevOps
    // For now, return configured project
    const project = process.env.AZURE_DEVOPS_PROJECT;
    
    res.json({
      success: true,
      data: {
        defaultProject: project,
        orgUrl: process.env.AZURE_DEVOPS_ORG_URL
      }
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch projects'
    });
  }
});

module.exports = router;
