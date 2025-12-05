const { openAIClient } = require('../../config/azure');

class AIService {
  constructor() {
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
    this.systemPrompts = {
      scrumMaster: `You are an experienced Scrum Master facilitating a daily standup meeting. 
      You should be professional, encouraging, and help keep the meeting focused and time-boxed.
      Ask the three standard standup questions one at a time and wait for responses.
      Keep track of blockers and provide constructive feedback when appropriate.
      Be supportive and help the team stay motivated.`,
      
      summarizer: `You are tasked with summarizing a daily standup meeting. 
      Create a clear, concise summary that includes:
      1. Meeting participants
      2. What each person accomplished yesterday
      3. What each person plans to do today
      4. Any blockers or impediments mentioned
      5. Key decisions or action items
      Format the summary professionally for email distribution.`,
      
      blockerAnalyzer: `You are an expert at analyzing project blockers and impediments.
      Analyze the blockers mentioned in the standup meeting and:
      1. Categorize them by type (technical, process, dependency, etc.)
      2. Assess their urgency and impact
      3. Suggest potential solutions or escalation paths
      4. Identify if immediate team lead attention is required
      Provide actionable insights for resolution.`
    };
  }

  async generateResponse(prompt, systemRole = 'scrumMaster', context = {}) {
    try {
      if (!openAIClient) {
        console.warn('Azure OpenAI client not configured. Returning mock response.');
        return `[DEMO MODE] Mock AI response for: ${prompt.substring(0, 50)}...`;
      }

      const messages = [
        {
          role: 'system',
          content: this.systemPrompts[systemRole]
        },
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await openAIClient.getChatCompletions(
        this.deploymentName,
        messages,
        {
          maxTokens: 500,
          temperature: 0.7,
          topP: 0.9
        }
      );

      return response.choices[0]?.message?.content || 'I apologize, but I could not generate a response.';
    } catch (error) {
      console.error('Error generating AI response:', error);
      return `[DEMO MODE] Error generating AI response. Mock response for: ${prompt.substring(0, 50)}...`;
    }
  }

  async conductStandupSession(participantName, meetingContext = {}) {
    const questions = [
      `Hello ${participantName}! Let's start with our daily standup. What did you accomplish yesterday?`,
      `Great! Now, what are you planning to work on today?`,
      `Perfect! Do you have any blockers or impediments that are preventing you from moving forward?`
    ];

    return {
      questions,
      currentQuestionIndex: 0,
      responses: [],
      participantName,
      sessionId: `standup_${Date.now()}_${participantName.replace(/\s+/g, '_')}`
    };
  }

  async processStandupResponse(sessionData, response, questionIndex) {
    try {
      // Store the response
      sessionData.responses[questionIndex] = {
        question: sessionData.questions[questionIndex],
        answer: response,
        timestamp: new Date().toISOString()
      };

      // Generate contextual follow-up or acknowledgment
      let aiResponse = '';
      
      if (questionIndex === 0) {
        // Yesterday's work
        aiResponse = await this.generateResponse(
          `The team member said they accomplished: "${response}". Provide a brief, encouraging acknowledgment and ask about today's plans.`,
          'scrumMaster'
        );
      } else if (questionIndex === 1) {
        // Today's plans
        aiResponse = await this.generateResponse(
          `The team member plans to work on: "${response}". Acknowledge their plans and ask about any blockers.`,
          'scrumMaster'
        );
      } else if (questionIndex === 2) {
        // Blockers
        if (response.toLowerCase().includes('no') || response.toLowerCase().includes('none')) {
          aiResponse = "Excellent! No blockers is great to hear. Thanks for the update!";
        } else {
          aiResponse = await this.generateResponse(
            `The team member mentioned these blockers: "${response}". Provide supportive response and indicate you'll help address them.`,
            'scrumMaster'
          );
        }
      }

      return {
        ...sessionData,
        currentQuestionIndex: questionIndex + 1,
        lastAIResponse: aiResponse,
        isComplete: questionIndex >= 2
      };
    } catch (error) {
      console.error('Error processing standup response:', error);
      throw new Error('Failed to process standup response');
    }
  }

  async summarizeMeeting(meetingData) {
    try {
      const participants = meetingData.participants || [];
      const responses = meetingData.responses || [];

      let summaryPrompt = `Summarize this daily standup meeting:
      
Participants: ${participants.join(', ')}
Meeting Date: ${meetingData.date || new Date().toLocaleDateString()}

Responses:
`;

      responses.forEach((participantResponses, index) => {
        if (participantResponses && participantResponses.length > 0) {
          summaryPrompt += `\n${participants[index] || `Participant ${index + 1}`}:`;
          participantResponses.forEach(response => {
            summaryPrompt += `\n- ${response.question}: ${response.answer}`;
          });
        }
      });

      const summary = await this.generateResponse(summaryPrompt, 'summarizer');
      
      return {
        summary,
        meetingDate: meetingData.date || new Date().toISOString(),
        participants: participants,
        duration: meetingData.duration || 'Not recorded',
        blockers: this.extractBlockers(responses)
      };
    } catch (error) {
      console.error('Error summarizing meeting:', error);
      throw new Error('Failed to summarize meeting');
    }
  }

  async analyzeBlockers(blockers) {
    try {
      if (!blockers || blockers.length === 0) {
        return {
          analysis: 'No blockers were identified in this standup meeting.',
          requiresEscalation: false,
          categories: [],
          recommendations: []
        };
      }

      const blockersText = blockers.map(blocker => 
        `${blocker.participant}: ${blocker.blocker}`
      ).join('\n');

      const analysisPrompt = `Analyze these project blockers from a daily standup:

${blockersText}

Provide detailed analysis including categorization, urgency assessment, and recommendations.`;

      const analysis = await this.generateResponse(analysisPrompt, 'blockerAnalyzer');
      
      // Determine if escalation is needed based on keywords
      const urgentKeywords = ['urgent', 'critical', 'blocked completely', 'cannot proceed', 'escalate'];
      const requiresEscalation = urgentKeywords.some(keyword => 
        analysis.toLowerCase().includes(keyword) || 
        blockersText.toLowerCase().includes(keyword)
      );

      return {
        analysis,
        requiresEscalation,
        blockers: blockers,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error analyzing blockers:', error);
      throw new Error('Failed to analyze blockers');
    }
  }

  extractBlockers(responses) {
    const blockers = [];
    
    responses.forEach((participantResponses, index) => {
      if (participantResponses && participantResponses.length > 2) {
        const blockerResponse = participantResponses[2]; // Third question is about blockers
        if (blockerResponse && 
            !blockerResponse.answer.toLowerCase().includes('no') && 
            !blockerResponse.answer.toLowerCase().includes('none')) {
          blockers.push({
            participant: `Participant ${index + 1}`,
            blocker: blockerResponse.answer,
            timestamp: blockerResponse.timestamp
          });
        }
      }
    });

    return blockers;
  }

  async generateMeetingInsights(meetingData) {
    try {
      const insightsPrompt = `Based on this standup meeting data, provide insights about team productivity, potential issues, and recommendations:

Meeting Summary: ${JSON.stringify(meetingData, null, 2)}

Focus on:
1. Team velocity and productivity indicators
2. Communication patterns
3. Recurring issues or themes
4. Recommendations for improvement`;

      const insights = await this.generateResponse(insightsPrompt, 'scrumMaster');
      
      return {
        insights,
        generatedAt: new Date().toISOString(),
        meetingId: meetingData.id || 'unknown'
      };
    } catch (error) {
      console.error('Error generating meeting insights:', error);
      throw new Error('Failed to generate meeting insights');
    }
  }
}

module.exports = new AIService();
