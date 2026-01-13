// lib/notifications/index.ts
// Real-time notification system with multiple channels

import { adminDb } from '@/lib/firebase-admin';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

interface NotificationPayload {
  userId: string;
  type: 'job_match' | 'application_update' | 'interview_scheduled' | 'message';
  title: string;
  body: string;
  data?: Record<string, any>;
  channels?: ('email' | 'sms' | 'push' | 'in_app')[];
}

export class NotificationService {
  private emailTransporter: nodemailer.Transporter;
  private twilioClient: twilio.Twilio;

  constructor() {
    // Email setup (using Gmail SMTP as example)
    this.emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // SMS setup (Twilio)
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  async send(notification: NotificationPayload): Promise<void> {
    // Get user preferences
    const userDoc = await adminDb.collection('users').doc(notification.userId).get();
    const user = userDoc.data();

    if (!user) {
      console.error(`User ${notification.userId} not found`);
      return;
    }

    const channels = notification.channels || this.getDefaultChannels(notification.type);

    // Send to each enabled channel
    const promises = channels.map(channel => {
      if (!user.notifications?.[channel]) return Promise.resolve();

      switch (channel) {
        case 'email':
          return this.sendEmail(user.email, notification);
        case 'sms':
          return user.phone ? this.sendSMS(user.phone, notification) : Promise.resolve();
        case 'push':
          return this.sendPushNotification(user, notification);
        case 'in_app':
          return this.saveInAppNotification(notification);
        default:
          return Promise.resolve();
      }
    });

    await Promise.allSettled(promises);
  }

  private async sendEmail(to: string, notification: NotificationPayload): Promise<void> {
    const template = this.getEmailTemplate(notification);

    await this.emailTransporter.sendMail({
      from: '"JobHunt AI" <notifications@jobhunt.ai>',
      to,
      subject: notification.title,
      html: template,
    });
  }

  private async sendSMS(to: string, notification: NotificationPayload): Promise<void> {
    await this.twilioClient.messages.create({
      body: `${notification.title}: ${notification.body}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
  }

  private async sendPushNotification(user: any, notification: NotificationPayload): Promise<void> {
    // Implement web push notifications using Firebase Cloud Messaging
    // or OneSignal, Pusher, etc.
    console.log(`Sending push notification to ${user.email}`);
  }

  private async saveInAppNotification(notification: NotificationPayload): Promise<void> {
    await adminDb.collection('notifications').add({
      ...notification,
      read: false,
      createdAt: new Date(),
    });
  }

  private getEmailTemplate(notification: NotificationPayload): string {
    const templates = {
      job_match: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .job-card { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .match-score { font-size: 48px; font-weight: bold; color: #667eea; text-align: center; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎯 New Job Match!</h1>
            </div>
            <div class="content">
              <div class="job-card">
                <h2>${notification.data?.job?.title || 'Job Title'}</h2>
                <p><strong>${notification.data?.job?.company || 'Company'}</strong></p>
                <p>📍 ${notification.data?.job?.location || 'Location'}</p>
                <div class="match-score">${notification.data?.matchScore || 0}%</div>
                <p style="text-align: center; color: #666;">Match Score</p>
                <p><strong>Why you're a great fit:</strong></p>
                <ul>
                  ${(notification.data?.reasons || []).map((r: string) => `<li>${r}</li>`).join('')}
                </ul>
                <div style="text-align: center;">
                  <a href="${notification.data?.job?.url || '#'}" class="button">View Job Details</a>
                </div>
              </div>
            </div>
            <div class="footer">
              <p>You're receiving this because you have email notifications enabled.</p>
              <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">Update notification preferences</a></p>
            </div>
          </div>
        </body>
        </html>
      `,
      application_update: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>📬 ${notification.title}</h2>
            <p>${notification.body}</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/applications" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 10px 0;">View Application</a>
          </div>
        </body>
        </html>
      `,
      interview_scheduled: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2>🎉 ${notification.title}</h2>
            <p>${notification.body}</p>
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3>Interview Details:</h3>
              <p><strong>Date:</strong> ${notification.data?.date || 'TBD'}</p>
              <p><strong>Time:</strong> ${notification.data?.time || 'TBD'}</p>
              <p><strong>Format:</strong> ${notification.data?.format || 'TBD'}</p>
            </div>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/interviews/${notification.data?.interviewId}" style="display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px;">Prepare for Interview</a>
          </div>
        </body>
        </html>
      `,
    };
    return templates[notification.type as keyof typeof templates] || templates.application_update;
  }

  private getDefaultChannels(type: NotificationPayload['type']): ('email' | 'sms' | 'push' | 'in_app')[] {
    const channelMap: Record<NotificationPayload['type'], ('email' | 'sms' | 'push' | 'in_app')[]> = {
      job_match: ['email', 'in_app', 'push'],
      application_update: ['email', 'in_app'],
      interview_scheduled: ['email', 'sms', 'in_app', 'push'],
      message: ['in_app', 'push'],
    };

    return channelMap[type] || ['in_app'];
  }
}  // ← ADDED THE MISSING CLOSING BRACE HERE

// Notification templates for common events
export const NotificationTemplates = {
  newJobMatch: (job: any, matchScore: number, reasons: string[]) => ({
    type: 'job_match' as const,
    title: `New ${matchScore}% Match: ${job.title}`,
    body: `${job.company} is hiring for a role that matches your profile!`,
    data: { job, matchScore, reasons },
  }),

  applicationStatusChanged: (application: any) => ({
    type: 'application_update' as const,
    title: `Application Update: ${application.job.title}`,
    body: `Your application status changed to: ${application.status}`,
    data: { application },
  }),

  interviewScheduled: (interview: any) => ({
    type: 'interview_scheduled' as const,
    title: `Interview Scheduled with ${interview.company}!`,
    body: `You have an interview scheduled for ${interview.date}`,
    data: interview,
  }),
};

// Bulk notification sender
export async function sendBulkNotifications(
  userIds: string[],
  notification: Omit<NotificationPayload, 'userId'>
): Promise<void> {
  const service = new NotificationService();
  const promises = userIds.map(userId =>
    service.send({ ...notification, userId })
  );

  await Promise.allSettled(promises);
}

// API Route: /api/notifications/send
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, type, title, body: message, data } = body;

    const service = new NotificationService();
    await service.send({
      userId,
      type,
      title,
      body: message,
      data,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to send notification:', error);
    return Response.json({ error: 'Failed to send notification' }, { status: 500 });
  }
}