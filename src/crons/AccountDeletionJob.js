import { accountDeletionService } from '../services/DeletionService.js';

export const processAccountDeletions = async () => {
  try {
    console.log("[cron] running job: account-deletion.process");
    const result = await accountDeletionService.processScheduledDeletions();
    console.log(`[cron] account-deletion.process processed ${result.processed} users`);
  } catch (err) {
    console.error("[cron] account-deletion.process error:", err);
  }
};
