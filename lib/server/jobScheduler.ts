import { DataProviders } from './dataProvider/dataProviders';
import { CronJob } from 'cron';
import { sendMailIfPendingProposals } from './emailService';

/**
 * Background cron jobs for the site. Handles kept module-level (and exported)
 * so other modules can inspect job state (e.g. next run date) and so they can
 * be cleanly stopped on shutdown via stopJobs().
 */

// Recomputes the transitive closure of "equivalent" idiom relationships so that
// e.g. A<->B and B<->C also surfaces the inferred A<->C link.
export let EquivalentClosureJob: CronJob = null;
// Emails admins a reminder when there are change proposals awaiting review.
export let ProposalsToReviewJob: CronJob = null;

export async function initializeJobs(dataProviders: DataProviders, adminEmails: string[]) {

  // Run every 12 hours (at minute 0 of hours 0 and 12).
  EquivalentClosureJob = new CronJob('0 */12 * * *', async () => {
    await dataProviders.idiom.computeEquivalentClosure();
  });

  // Run once every 24 hours (at midnight).
  ProposalsToReviewJob = new CronJob('0 0 */1 * *', async () => {
    await sendMailIfPendingProposals(dataProviders, adminEmails);
  });

  ProposalsToReviewJob.start();
  EquivalentClosureJob.start();
}


// Stops both jobs if they were started. Called on SIGTERM/SIGINT.
export function stopJobs() {
  if (EquivalentClosureJob) {
    EquivalentClosureJob.stop();
  }

  if (ProposalsToReviewJob) {
    ProposalsToReviewJob.stop();
  }
}
