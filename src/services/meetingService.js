const cron = require('node-cron');
const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');
const aiService = require('./aiService');
const emailService = require('./emailService');
const devopsService = require('./devopsService');

class MeetingService {
  constructor() {
    this.meetings = new Map(); // In-memory storage - use database in production
    this.activeSessions = new Map();
    this.scheduledJobs = new Map();
  }

  async scheduleMeeting(meetingData) {
    try {
      const meeting = {
        id: uuidv4(),
        title: meetingData.title || 'Daily Standup',
        participants: meetingData.participants || [],
        scheduledTime: meetingData.scheduledTime,
        duration: meetingData.duration || 30,
        isVirtualScrumMaster: meetingData.isVirtualScrumMaster || false,
        timezone: meetingData.timezone || 'UTC',
        recurrence: meetingData.recurrence || 'none', // none, daily, weekly
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        createdBy: meetingData.createdBy
      };

      this.meetings.set(meeting.id, meeting);

      // Schedule the meeting using cron
      if (meetingData.recurrence === 'daily') {
        await this.scheduleRecurringMeeting(meeting);
      } else {
        await this.scheduleOneTimeMeeting(meeting);
      }

      return meeting;
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      throw new Error('Failed to schedule meeting');
    }
  }

  async scheduleRecurringMeeting(meeting) {
    const scheduledTime = moment.tz(meeting.scheduledTime, meeting.timezone);
    const cronExpression = `${scheduledTime.minute()} ${scheduledTime.hour()} * * 1-5`; // Monday to Friday
    
    const job = cron.schedule(cronExpression, async () => {
      await this.startMeeting(meeting.id);
    }, {
      scheduled: false,
      timezone: meeting.timezone
    });

    job.start();
    this.scheduledJobs.set(meeting.id, job);
    
    console.log(`Scheduled recurring daily standup for ${meeting.title} at ${scheduledTime.format('HH:mm')} ${meeting.timezone}`);
  }

  async scheduleOneTimeMeeting(meeting) {
    const scheduledTime = moment.tz(meeting.scheduledTime, meeting.timezone);
    const now = moment();
    
    if (scheduledTime.isBefore(now)) {
      throw new Error('Cannot schedule meeting in the past');
    }

    const delay = scheduledTime.diff(now);
    
    setTimeout(async () => {
      await this.startMeeting(meeting.id);
    }, delay);

    console.log(`Scheduled one-time meeting for ${meeting.title} at ${scheduledTime.format('YYYY-MM-DD HH:mm')} ${meeting.timezone}`);
  }

  async startMeeting(meetingId) {
    try {
      const meeting = this.meetings.get(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      meeting.status = 'in-progress';
      meeting.startedAt = new Date().toISOString();

      // Initialize meeting session data
      const session = {
        meetingId,
        participants: meeting.participants,
        responses: [],
        currentParticipantIndex: 0,
        activeStandupSessions: new Map(),
        startTime: new Date().toISOString(),
        isVirtualScrumMaster: meeting.isVirtualScrumMaster
      };

      this.activeSessions.set(meetingId, session);

      // Send meeting started notifications
      await this.notifyParticipants(meeting, 'Meeting Started', 
        `Your daily standup meeting "${meeting.title}" has started. Please join the meeting.`);

      console.log(`Meeting ${meeting.title} started at ${new Date().toISOString()}`);

      return session;
    } catch (error) {
      console.error('Error starting meeting:', error);
      throw new Error('Failed to start meeting');
    }
  }

  async joinMeeting(meetingId, participantName) {
    try {
      const session = this.activeSessions.get(meetingId);
      if (!session) {
        throw new Error('Meeting session not found or meeting has not started');
      }

      const meeting = this.meetings.get(meetingId);
      if (!meeting.participants.includes(participantName)) {
        throw new Error('Participant not invited to this meeting');
      }

      // Initialize standup session for this participant
      if (session.isVirtualScrumMaster) {
        const standupSession = await aiService.conductStandupSession(participantName, {
          meetingId,
          meetingTitle: meeting.title
        });
        
        session.activeStandupSessions.set(participantName, standupSession);
        
        return {
          sessionId: standupSession.sessionId,
          welcomeMessage: `Welcome to the daily standup, ${participantName}! I'm your virtual Scrum Master today.`,
          firstQuestion: standupSession.questions[0],
          meetingInfo: {
            title: meeting.title,
            startTime: session.startTime,
            participants: session.participants
          }
        };
      } else {
        return {
          welcomeMessage: `Welcome to the daily standup, ${participantName}!`,
          meetingInfo: {
            title: meeting.title,
            startTime: session.startTime,
            participants: session.participants
          }
        };
      }
    } catch (error) {
      console.error('Error joining meeting:', error);
      throw new Error('Failed to join meeting');
    }
  }

  async submitStandupResponse(meetingId, participantName, response) {
    try {
      const session = this.activeSessions.get(meetingId);
      if (!session) {
        throw new Error('Meeting session not found');
      }

      const standupSession = session.activeStandupSessions.get(participantName);
      if (!standupSession) {
        throw new Error('Standup session not found for participant');
      }

      // Process the response with AI
      const updatedSession = await aiService.processStandupResponse(
        standupSession,
        response,
        standupSession.currentQuestionIndex
      );

      session.activeStandupSessions.set(participantName, updatedSession);

      // Prepare response for participant
      const responseData = {
        acknowledgment: updatedSession.lastAIResponse,
        isComplete: updatedSession.isComplete
      };

      // If not complete, provide next question
      if (!updatedSession.isComplete) {
        responseData.nextQuestion = updatedSession.questions[updatedSession.currentQuestionIndex];
      } else {
        // Participant has completed their standup
        responseData.completionMessage = "Thank you for your standup update! You can now leave the meeting or wait for others to finish.";
        
        // Store responses for meeting summary
        const participantIndex = session.participants.indexOf(participantName);
        session.responses[participantIndex] = updatedSession.responses;
        
        // Check if all participants have completed
        await this.checkMeetingCompletion(meetingId);
      }

      return responseData;
    } catch (error) {
      console.error('Error submitting standup response:', error);
      throw new Error('Failed to submit standup response');
    }
  }

  async checkMeetingCompletion(meetingId) {
    const session = this.activeSessions.get(meetingId);
    const completedParticipants = Array.from(session.activeStandupSessions.values())
      .filter(s => s.isComplete).length;

    if (completedParticipants === session.participants.length) {
      await this.endMeeting(meetingId);
    }
  }

  async endMeeting(meetingId) {
    try {
      const session = this.activeSessions.get(meetingId);
      const meeting = this.meetings.get(meetingId);
      
      if (!session || !meeting) {
        throw new Error('Meeting or session not found');
      }

      meeting.status = 'completed';
      meeting.endedAt = new Date().toISOString();
      meeting.duration = Math.round((new Date() - new Date(session.startTime)) / (1000 * 60)); // minutes

      // Generate meeting summary
      const meetingData = {
        id: meetingId,
        title: meeting.title,
        participants: session.participants,
        responses: session.responses,
        date: session.startTime,
        duration: meeting.duration
      };

      const summary = await aiService.summarizeMeeting(meetingData);
      
      // Analyze blockers
      const blockerAnalysis = await aiService.analyzeBlockers(summary.blockers);
      
      // Send summary email to participants
      await emailService.sendMeetingSummary(meeting.participants, summary, meeting.title);
      
      // Alert team lead if blockers need escalation
      if (blockerAnalysis.requiresEscalation) {
        await this.alertTeamLead(meetingId, blockerAnalysis);
      }

      // Update Azure DevOps tasks
      await devopsService.updateTasksFromMeeting(meetingData, summary);

      // Clean up active session
      this.activeSessions.delete(meetingId);

      console.log(`Meeting ${meeting.title} completed at ${meeting.endedAt}`);

      return {
        summary,
        blockerAnalysis,
        meetingData
      };
    } catch (error) {
      console.error('Error ending meeting:', error);
      throw new Error('Failed to end meeting');
    }
  }

  async alertTeamLead(meetingId, blockerAnalysis) {
    try {
      const meeting = this.meetings.get(meetingId);
      // Assume team lead email is in environment or can be derived
      const teamLeadEmail = process.env.TEAM_LEAD_EMAIL || 'teamlead@company.com';
      
      const alertData = {
        subject: `🚨 Urgent Blockers Identified - ${meeting.title}`,
        blockers: blockerAnalysis.blockers,
        analysis: blockerAnalysis.analysis,
        meetingId,
        meetingTitle: meeting.title,
        timestamp: new Date().toISOString()
      };

      await emailService.sendBlockerAlert([teamLeadEmail], alertData);
      console.log(`Team lead alerted about urgent blockers from meeting ${meetingId}`);
    } catch (error) {
      console.error('Error alerting team lead:', error);
    }
  }

  async notifyParticipants(meeting, subject, message) {
    try {
      const emailData = {
        subject: `${subject} - ${meeting.title}`,
        message,
        meetingInfo: {
          title: meeting.title,
          scheduledTime: meeting.scheduledTime,
          duration: meeting.duration,
          timezone: meeting.timezone
        }
      };

      await emailService.sendMeetingNotification(meeting.participants, emailData);
    } catch (error) {
      console.error('Error notifying participants:', error);
    }
  }

  async getMeeting(meetingId) {
    const meeting = this.meetings.get(meetingId);
    if (!meeting) {
      throw new Error('Meeting not found');
    }
    return meeting;
  }

  async getMeetings(userId) {
    // Filter meetings by user participation
    const userMeetings = Array.from(this.meetings.values())
      .filter(meeting => meeting.participants.includes(userId) || meeting.createdBy === userId);
    
    return userMeetings;
  }

  async cancelMeeting(meetingId) {
    try {
      const meeting = this.meetings.get(meetingId);
      if (!meeting) {
        throw new Error('Meeting not found');
      }

      meeting.status = 'cancelled';
      
      // Cancel scheduled job if exists
      const job = this.scheduledJobs.get(meetingId);
      if (job) {
        job.destroy();
        this.scheduledJobs.delete(meetingId);
      }

      // Notify participants
      await this.notifyParticipants(meeting, 'Meeting Cancelled', 
        `The meeting "${meeting.title}" has been cancelled.`);

      console.log(`Meeting ${meeting.title} has been cancelled`);
      return meeting;
    } catch (error) {
      console.error('Error cancelling meeting:', error);
      throw new Error('Failed to cancel meeting');
    }
  }

  async getActiveSessions() {
    return Array.from(this.activeSessions.entries()).map(([meetingId, session]) => ({
      meetingId,
      participants: session.participants,
      startTime: session.startTime,
      completedParticipants: Array.from(session.activeStandupSessions.values())
        .filter(s => s.isComplete).length
    }));
  }
}

module.exports = new MeetingService();
