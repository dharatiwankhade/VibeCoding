const { emailClient } = require('../../config/azure');
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@aiScrumMaster.com';
    this.useAzureCommunication = !!process.env.AZURE_COMMUNICATION_EMAIL_CONNECTION_STRING;
    
    // Fallback to SMTP if Azure Communication Services is not configured
    if (!this.useAzureCommunication) {
      this.smtpTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'localhost',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }
  }

  async sendEmail(recipients, subject, htmlContent, textContent = null) {
    try {
      if (this.useAzureCommunication) {
        return await this.sendWithAzureCommunication(recipients, subject, htmlContent, textContent);
      } else {
        return await this.sendWithSMTP(recipients, subject, htmlContent, textContent);
      }
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendWithAzureCommunication(recipients, subject, htmlContent, textContent) {
    const emailMessage = {
      senderAddress: this.fromEmail,
      content: {
        subject: subject,
        html: htmlContent,
        plainText: textContent || this.stripHtml(htmlContent)
      },
      recipients: {
        to: recipients.map(email => ({ address: email }))
      }
    };

    const poller = await emailClient.beginSend(emailMessage);
    const result = await poller.pollUntilDone();
    
    console.log(`Email sent via Azure Communication Services: ${result.id}`);
    return result;
  }

  async sendWithSMTP(recipients, subject, htmlContent, textContent) {
    const mailOptions = {
      from: this.fromEmail,
      to: recipients.join(', '),
      subject: subject,
      html: htmlContent,
      text: textContent || this.stripHtml(htmlContent)
    };

    const result = await this.smtpTransporter.sendMail(mailOptions);
    console.log(`Email sent via SMTP: ${result.messageId}`);
    return result;
  }

  async sendMeetingSummary(participants, summary, meetingTitle) {
    try {
      const subject = `📋 Daily Standup Summary - ${meetingTitle}`;
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Daily Standup Summary</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0078d4; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .section { margin-bottom: 25px; padding: 15px; border-left: 4px solid #0078d4; background-color: #f8f9fa; }
            .section h2 { color: #0078d4; margin-top: 0; font-size: 18px; }
            .participant { margin-bottom: 15px; padding: 10px; background-color: white; border-radius: 3px; }
            .participant-name { font-weight: bold; color: #0078d4; margin-bottom: 5px; }
            .response { margin: 5px 0; }
            .response-label { font-weight: bold; color: #666; }
            .blockers { background-color: #fff3cd; border-left-color: #ffc107; }
            .blocker-item { background-color: #fff; padding: 10px; margin: 5px 0; border-left: 3px solid #dc3545; }
            .footer { margin-top: 30px; padding: 15px; background-color: #f1f1f1; border-radius: 3px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📋 Daily Standup Summary</h1>
            <p><strong>${meetingTitle}</strong> | ${new Date(summary.meetingDate).toLocaleDateString()}</p>
          </div>

          <div class="section">
            <h2>📊 Meeting Overview</h2>
            <p><strong>Participants:</strong> ${summary.participants.join(', ')}</p>
            <p><strong>Duration:</strong> ${summary.duration} minutes</p>
            <p><strong>Date:</strong> ${new Date(summary.meetingDate).toLocaleString()}</p>
          </div>

          <div class="section">
            <h2>📝 Meeting Summary</h2>
            <div>${summary.summary.replace(/\n/g, '<br>')}</div>
          </div>

          ${summary.blockers && summary.blockers.length > 0 ? `
          <div class="section blockers">
            <h2>🚨 Blockers & Impediments</h2>
            ${summary.blockers.map(blocker => `
              <div class="blocker-item">
                <strong>${blocker.participant}:</strong> ${blocker.blocker}
              </div>
            `).join('')}
          </div>
          ` : ''}

          <div class="footer">
            <p>This summary was automatically generated by your AI Scrum Master.</p>
            <p>Generated at: ${new Date().toLocaleString()}</p>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(participants, subject, htmlContent);
      console.log(`Meeting summary sent to ${participants.length} participants`);
    } catch (error) {
      console.error('Error sending meeting summary:', error);
      throw new Error('Failed to send meeting summary');
    }
  }

  async sendBlockerAlert(recipients, alertData) {
    try {
      const subject = alertData.subject;
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Urgent Blocker Alert</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { background-color: #dc3545; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; }
            .alert-section { margin-bottom: 25px; padding: 15px; border-left: 4px solid #dc3545; background-color: #f8d7da; }
            .blocker-item { background-color: #fff; padding: 15px; margin: 10px 0; border-left: 3px solid #dc3545; border-radius: 3px; }
            .analysis { background-color: #d1ecf1; padding: 15px; border-left: 4px solid #17a2b8; margin: 15px 0; }
            .footer { margin-top: 30px; padding: 15px; background-color: #f1f1f1; border-radius: 3px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🚨 Urgent Blocker Alert</h1>
            <p><strong>${alertData.meetingTitle}</strong></p>
          </div>

          <div class="alert-section">
            <h2>Critical blockers require immediate attention</h2>
            <p><strong>Meeting:</strong> ${alertData.meetingTitle}</p>
            <p><strong>Time:</strong> ${new Date(alertData.timestamp).toLocaleString()}</p>
          </div>

          <h2>🚧 Identified Blockers:</h2>
          ${alertData.blockers.map(blocker => `
            <div class="blocker-item">
              <strong>${blocker.participant}:</strong>
              <p>${blocker.blocker}</p>
              <small>Reported at: ${new Date(blocker.timestamp).toLocaleString()}</small>
            </div>
          `).join('')}

          <div class="analysis">
            <h3>📊 AI Analysis & Recommendations:</h3>
            <div>${alertData.analysis.replace(/\n/g, '<br>')}</div>
          </div>

          <div class="footer">
            <p><strong>Action Required:</strong> Please review these blockers and take appropriate action to help your team members.</p>
            <p>Alert generated by AI Scrum Master at: ${new Date().toLocaleString()}</p>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(recipients, subject, htmlContent);
      console.log(`Blocker alert sent to team lead(s)`);
    } catch (error) {
      console.error('Error sending blocker alert:', error);
      throw new Error('Failed to send blocker alert');
    }
  }

  async sendMeetingNotification(participants, emailData) {
    try {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Meeting Notification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #0078d4; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
            .content { padding: 20px; background-color: #f8f9fa; border-radius: 5px; }
            .meeting-info { background-color: white; padding: 15px; border-left: 4px solid #0078d4; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📅 Meeting Notification</h1>
          </div>
          
          <div class="content">
            <p>${emailData.message}</p>
            
            <div class="meeting-info">
              <h3>Meeting Details:</h3>
              <p><strong>Title:</strong> ${emailData.meetingInfo.title}</p>
              <p><strong>Time:</strong> ${new Date(emailData.meetingInfo.scheduledTime).toLocaleString()}</p>
              <p><strong>Duration:</strong> ${emailData.meetingInfo.duration} minutes</p>
              <p><strong>Timezone:</strong> ${emailData.meetingInfo.timezone}</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await this.sendEmail(participants, emailData.subject, htmlContent);
      console.log(`Meeting notification sent to ${participants.length} participants`);
    } catch (error) {
      console.error('Error sending meeting notification:', error);
      throw new Error('Failed to send meeting notification');
    }
  }

  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }
}

module.exports = new EmailService();
