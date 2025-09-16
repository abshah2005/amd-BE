import cron from 'node-cron';
import { accountDeletionService } from '../services/DeletionService.js';
import agenda from '../jobs/agenda/AgendaInstance.js';

agenda.define("account-deletion.process", async (job, done) => {
  try {
    console.log("[agenda] running job: account-deletion.process");
    const result = await accountDeletionService.processScheduledDeletions();
    console.log(`[agenda] account-deletion.process processed ${result.processed} users`);
    done();
  } catch (err) {
    console.error("[agenda] account-deletion.process error:", err);
    done(err);
  }
});