const express = require('express');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// Mock team data - in production this would come from Azure AD or a database
const teams = new Map();

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

// Get all teams
router.get('/', async (req, res) => {
  try {
    const allTeams = Array.from(teams.values());
    res.json({
      success: true,
      data: allTeams
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teams'
    });
  }
});

// Get team information
router.get('/:teamId', async (req, res) => {
  try {
    const team = teams.get(req.params.teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    res.json({
      success: true,
      data: team
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team information'
    });
  }
});

// Create or update team
router.post('/', [
  body('name').notEmpty().withMessage('Team name is required'),
  body('members').isArray({ min: 1 }).withMessage('Team must have at least one member'),
  body('leadEmail').isEmail().withMessage('Valid team lead email is required')
], handleValidationErrors, async (req, res) => {
  try {
    const team = {
      id: req.body.id || Date.now().toString(),
      name: req.body.name,
      members: req.body.members,
      leadEmail: req.body.leadEmail,
      description: req.body.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    teams.set(team.id, team);

    res.status(201).json({
      success: true,
      data: team,
      message: 'Team created successfully'
    });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create team'
    });
  }
});

// Get all teams for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const userTeams = Array.from(teams.values()).filter(team => 
      team.members.some(member => member.id === userId || member.email === userId)
    );

    res.json({
      success: true,
      data: userTeams
    });
  } catch (error) {
    console.error('Error fetching user teams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user teams'
    });
  }
});

// Update team members
router.put('/:teamId/members', [
  body('members').isArray({ min: 1 }).withMessage('Team must have at least one member')
], handleValidationErrors, async (req, res) => {
  try {
    const team = teams.get(req.params.teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Team not found'
      });
    }

    team.members = req.body.members;
    team.updatedAt = new Date().toISOString();
    teams.set(team.id, team);

    res.json({
      success: true,
      data: team,
      message: 'Team members updated successfully'
    });
  } catch (error) {
    console.error('Error updating team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update team members'
    });
  }
});

module.exports = router;
