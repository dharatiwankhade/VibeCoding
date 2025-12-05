const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

console.log('Current directory:', __dirname);
console.log('Public directory:', path.join(__dirname, 'public'));
console.log('Index file exists:', fs.existsSync(path.join(__dirname, 'public', 'index.html')));

// Security middleware with relaxed CSP for inline styles
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
app.use(cors());

// Logging
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic routes for testing
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    message: 'AI Scrum Master server is running'
  });
});

// API endpoints - simplified
app.get('/api/meetings', (req, res) => {
  res.json({
    success: true,
    data: [],
    message: 'No meetings scheduled yet'
  });
});

app.post('/api/meetings/schedule', (req, res) => {
  res.json({
    success: true,
    data: {
      id: Date.now().toString(),
      title: req.body.title || 'Daily Standup',
      participants: req.body.participants || [],
      scheduledTime: req.body.scheduledTime,
      status: 'scheduled'
    },
    message: 'Meeting scheduled successfully (demo mode)'
  });
});

// Teams endpoints
const teams = new Map();

app.get('/api/teams', (req, res) => {
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

app.post('/api/teams', (req, res) => {
  try {
    const team = {
      id: Date.now().toString(),
      name: req.body.name,
      members: req.body.members || [],
      leadEmail: req.body.leadEmail,
      description: req.body.description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    teams.set(team.id, team);

    console.log('Team created:', team);
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

// Serve HTML file for root route
app.get('/', (req, res) => {
  console.log('Root route accessed, serving index.html');
  const indexPath = path.join(__dirname, 'public', 'index.html');
  console.log('Serving file from:', indexPath);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading page');
    }
  });
});

// Serve HTML file for any other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Basic error handling
app.use((error, req, res, next) => {
  console.error('Error:', error.message);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 AI Scrum Master server running on port ${PORT}`);
  console.log(`🌐 Visit: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⚠️  Running in simplified mode - Azure services not configured`);
});

module.exports = app;
