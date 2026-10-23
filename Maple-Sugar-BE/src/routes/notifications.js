import { Router } from 'express';
import { ApiError, unavailable } from '../lib/ApiError.js';
import { Capability } from '../business/permissions.js';
import { requireCapability } from '../middleware/authenticate.js';
import { testEmail } from '../services/emailTemplates.js';
import { isMailEnabled, sendEmail } from '../services/mailService.js';

/** Email preferences live on /profile; this is only the delivery check. */
export const notificationsRouter = Router();

/** Admin-only check that the configured mail transport actually delivers. */
notificationsRouter.post('/test', requireCapability(Capability.MANAGE_USERS), async (req, res) => {
  if (!isMailEnabled()) {
    throw unavailable('Email is off. Set MAIL_FROM and GMAIL_REFRESH_TOKEN or BREVO_API_KEY on the server.', 'MAIL_DISABLED');
  }
  try {
    await sendEmail({ to: req.user, ...testEmail(), tags: ['test'] });
  } catch (error) {
    throw new ApiError('The mail service did not accept the test email. Check the mail settings and sender.', {
      status: 502,
      code: 'MAIL_FAILED',
      cause: error,
    });
  }
  res.json({ sent: true, to: req.user.Email });
});
