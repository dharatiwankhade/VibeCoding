const azdev = require('azure-devops-node-api');
const { azureDevOpsConfig } = require('../../config/azure');

class DevOpsService {
  constructor() {
    this.connection = null;
    this.workItemApi = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (!azureDevOpsConfig.serverUrl || !azureDevOpsConfig.token) {
        console.warn('Azure DevOps configuration not found. DevOps integration will be disabled.');
        return;
      }

      const authHandler = azdev.getPersonalAccessTokenHandler(azureDevOpsConfig.token);
      this.connection = new azdev.WebApi(azureDevOpsConfig.serverUrl, authHandler);
      this.workItemApi = await this.connection.getWorkItemTrackingApi();
      this.initialized = true;
      
      console.log('Azure DevOps service initialized successfully');
    } catch (error) {
      console.error('Error initializing Azure DevOps service:', error);
      this.initialized = false;
    }
  }

  async updateTasksFromMeeting(meetingData, summary) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.initialized) {
        console.warn('Azure DevOps not configured. Skipping task updates.');
        return;
      }

      const project = process.env.AZURE_DEVOPS_PROJECT;
      if (!project) {
        console.warn('Azure DevOps project not configured. Skipping task updates.');
        return;
      }

      const updates = [];

      // Process each participant's responses
      for (let i = 0; i < meetingData.participants.length; i++) {
        const participant = meetingData.participants[i];
        const responses = meetingData.responses[i];

        if (responses && responses.length >= 2) {
          // Extract work completed yesterday and planned for today
          const yesterdayWork = responses[0]?.answer || '';
          const todayPlans = responses[1]?.answer || '';
          const blockers = responses[2]?.answer || '';

          // Find and update tasks mentioned in the responses
          await this.processParticipantUpdates(project, participant, {
            yesterdayWork,
            todayPlans,
            blockers
          });

          updates.push({
            participant,
            yesterdayWork,
            todayPlans,
            blockers
          });
        }
      }

      // Create a summary work item for the standup meeting
      await this.createStandupSummaryWorkItem(project, meetingData, summary);

      console.log(`Updated Azure DevOps tasks for ${updates.length} participants`);
      return updates;
    } catch (error) {
      console.error('Error updating Azure DevOps tasks:', error);
      throw new Error('Failed to update Azure DevOps tasks');
    }
  }

  async processParticipantUpdates(project, participant, updateData) {
    try {
      // Search for work items assigned to this participant
      const wiql = {
        query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType]
                FROM WorkItems 
                WHERE [System.AssignedTo] CONTAINS '${participant}' 
                AND [System.State] IN ('Active', 'In Progress', 'To Do', 'New')
                ORDER BY [System.ChangedDate] DESC`
      };

      const queryResult = await this.workItemApi.queryByWiql(wiql, project);
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        console.log(`No active work items found for ${participant}`);
        return;
      }

      // Get detailed work item information
      const workItemIds = queryResult.workItems.map(wi => wi.id);
      const workItems = await this.workItemApi.getWorkItems(workItemIds, project);

      // Update work items based on standup responses
      for (const workItem of workItems) {
        await this.updateWorkItemFromStandup(project, workItem, participant, updateData);
      }

    } catch (error) {
      console.error(`Error processing updates for ${participant}:`, error);
    }
  }

  async updateWorkItemFromStandup(project, workItem, participant, updateData) {
    try {
      const updates = [];
      const currentHistory = workItem.fields['System.History'] || '';
      
      // Create standup update entry
      const standupUpdate = this.formatStandupUpdate(participant, updateData);
      
      // Update the history/comments
      updates.push({
        op: 'add',
        path: '/fields/System.History',
        value: `${currentHistory}\n\n--- Daily Standup Update (${new Date().toLocaleDateString()}) ---\n${standupUpdate}`
      });

      // Update state based on work status
      const newState = this.determineNewState(workItem, updateData);
      if (newState && newState !== workItem.fields['System.State']) {
        updates.push({
          op: 'replace',
          path: '/fields/System.State',
          value: newState
        });
      }

      // Add blocker tag if blockers mentioned
      if (updateData.blockers && 
          !updateData.blockers.toLowerCase().includes('no') && 
          !updateData.blockers.toLowerCase().includes('none')) {
        
        const currentTags = workItem.fields['System.Tags'] || '';
        const blockerTag = 'Blocked';
        
        if (!currentTags.includes(blockerTag)) {
          updates.push({
            op: 'replace',
            path: '/fields/System.Tags',
            value: currentTags ? `${currentTags}; ${blockerTag}` : blockerTag
          });
        }
      }

      // Apply updates if any
      if (updates.length > 0) {
        await this.workItemApi.updateWorkItem(
          null, // customHeaders
          updates,
          workItem.id,
          project
        );

        console.log(`Updated work item ${workItem.id} for ${participant}`);
      }

    } catch (error) {
      console.error(`Error updating work item ${workItem.id}:`, error);
    }
  }

  formatStandupUpdate(participant, updateData) {
    return `
**Standup Update for ${participant}**
📅 Yesterday: ${updateData.yesterdayWork}
🎯 Today: ${updateData.todayPlans}
🚫 Blockers: ${updateData.blockers || 'None'}
`.trim();
  }

  determineNewState(workItem, updateData) {
    const currentState = workItem.fields['System.State'];
    const workType = workItem.fields['System.WorkItemType'];
    
    // Simple state logic - can be enhanced based on specific workflow
    if (updateData.blockers && 
        !updateData.blockers.toLowerCase().includes('no') && 
        !updateData.blockers.toLowerCase().includes('none')) {
      return 'Blocked'; // If your process supports this state
    }

    if (updateData.todayPlans.toLowerCase().includes('complete') || 
        updateData.todayPlans.toLowerCase().includes('finish') ||
        updateData.yesterdayWork.toLowerCase().includes('completed')) {
      return 'Done';
    }

    if ((currentState === 'New' || currentState === 'To Do') && 
        updateData.yesterdayWork.toLowerCase().includes('started')) {
      return 'Active';
    }

    return null; // No state change needed
  }

  async createStandupSummaryWorkItem(project, meetingData, summary) {
    try {
      const workItemData = [
        {
          op: 'add',
          path: '/fields/System.WorkItemType',
          value: 'Task'
        },
        {
          op: 'add',
          path: '/fields/System.Title',
          value: `Daily Standup Summary - ${new Date(meetingData.date).toLocaleDateString()}`
        },
        {
          op: 'add',
          path: '/fields/System.Description',
          value: this.formatSummaryDescription(meetingData, summary)
        },
        {
          op: 'add',
          path: '/fields/System.Tags',
          value: 'Standup; Meeting Summary; AI Generated'
        },
        {
          op: 'add',
          path: '/fields/System.State',
          value: 'Done'
        },
        {
          op: 'add',
          path: '/fields/System.AreaPath',
          value: project
        },
        {
          op: 'add',
          path: '/fields/System.IterationPath',
          value: project
        }
      ];

      const summaryWorkItem = await this.workItemApi.createWorkItem(
        null, // customHeaders
        workItemData,
        project,
        'Task'
      );

      console.log(`Created standup summary work item: ${summaryWorkItem.id}`);
      return summaryWorkItem;

    } catch (error) {
      console.error('Error creating standup summary work item:', error);
    }
  }

  formatSummaryDescription(meetingData, summary) {
    let description = `
<h2>Daily Standup Meeting Summary</h2>
<p><strong>Date:</strong> ${new Date(meetingData.date).toLocaleDateString()}</p>
<p><strong>Duration:</strong> ${meetingData.duration || 'Not recorded'} minutes</p>
<p><strong>Participants:</strong> ${meetingData.participants.join(', ')}</p>

<h3>Meeting Summary</h3>
<div>${summary.summary.replace(/\n/g, '<br/>')}</div>
`;

    if (summary.blockers && summary.blockers.length > 0) {
      description += `
<h3>🚨 Blockers Identified</h3>
<ul>
${summary.blockers.map(blocker => 
  `<li><strong>${blocker.participant}:</strong> ${blocker.blocker}</li>`
).join('')}
</ul>`;
    }

    description += `
<h3>📊 Team Updates</h3>
`;

    meetingData.responses.forEach((responses, index) => {
      if (responses && responses.length > 0) {
        const participant = meetingData.participants[index] || `Participant ${index + 1}`;
        description += `
<h4>${participant}</h4>
<ul>
  <li><strong>Yesterday:</strong> ${responses[0]?.answer || 'No response'}</li>
  <li><strong>Today:</strong> ${responses[1]?.answer || 'No response'}</li>
  <li><strong>Blockers:</strong> ${responses[2]?.answer || 'No response'}</li>
</ul>
`;
      }
    });

    description += `
<hr/>
<p><em>This summary was automatically generated by the AI Scrum Master system.</em></p>
`;

    return description;
  }

  async getWorkItemsByAssignee(project, assignee) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      if (!this.initialized) {
        throw new Error('Azure DevOps service not initialized');
      }

      const wiql = {
        query: `SELECT [System.Id], [System.Title], [System.State], [System.WorkItemType], [System.AssignedTo]
                FROM WorkItems 
                WHERE [System.AssignedTo] CONTAINS '${assignee}' 
                AND [System.State] NOT IN ('Closed', 'Removed')
                ORDER BY [System.ChangedDate] DESC`
      };

      const queryResult = await this.workItemApi.queryByWiql(wiql, project);
      
      if (!queryResult.workItems || queryResult.workItems.length === 0) {
        return [];
      }

      const workItemIds = queryResult.workItems.map(wi => wi.id);
      const workItems = await this.workItemApi.getWorkItems(workItemIds, project);

      return workItems.map(wi => ({
        id: wi.id,
        title: wi.fields['System.Title'],
        state: wi.fields['System.State'],
        type: wi.fields['System.WorkItemType'],
        assignedTo: wi.fields['System.AssignedTo'],
        url: `${azureDevOpsConfig.serverUrl}/${project}/_workitems/edit/${wi.id}`
      }));

    } catch (error) {
      console.error('Error getting work items by assignee:', error);
      throw new Error('Failed to get work items');
    }
  }

  async createTaskFromBlocker(project, blocker, assignee) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const workItemData = [
        {
          op: 'add',
          path: '/fields/System.WorkItemType',
          value: 'Task'
        },
        {
          op: 'add',
          path: '/fields/System.Title',
          value: `BLOCKER: ${blocker.blocker.substring(0, 100)}${blocker.blocker.length > 100 ? '...' : ''}`
        },
        {
          op: 'add',
          path: '/fields/System.Description',
          value: `
<h3>🚨 Blocker identified during Daily Standup</h3>
<p><strong>Reported by:</strong> ${blocker.participant}</p>
<p><strong>Date:</strong> ${new Date(blocker.timestamp).toLocaleDateString()}</p>
<p><strong>Description:</strong></p>
<div>${blocker.blocker}</div>
<p><em>This task was automatically created from a daily standup blocker.</em></p>
`
        },
        {
          op: 'add',
          path: '/fields/System.Tags',
          value: 'Blocker; High Priority; Standup'
        },
        {
          op: 'add',
          path: '/fields/System.Priority',
          value: 1 // High priority
        },
        {
          op: 'add',
          path: '/fields/System.AssignedTo',
          value: assignee
        }
      ];

      const blockerTask = await this.workItemApi.createWorkItem(
        null,
        workItemData,
        project,
        'Task'
      );

      console.log(`Created blocker task: ${blockerTask.id}`);
      return blockerTask;

    } catch (error) {
      console.error('Error creating blocker task:', error);
      throw new Error('Failed to create blocker task');
    }
  }
}

module.exports = new DevOpsService();
