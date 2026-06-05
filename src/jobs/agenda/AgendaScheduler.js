import cron from "node-cron";
import { autoCloseExpiredQuestions, autoCloseExpiredThreads } from "../../crons/Threads.job.js";
import { processAccountDeletions } from "../../crons/AccountDeletionJob.js";

export const startAgenda = () => {
  cron.schedule("* * * * *", async () => {
    await autoCloseExpiredQuestions();
    await autoCloseExpiredThreads();
  });

  cron.schedule("* * * * *", async () => {
    await processAccountDeletions();
  });

  console.log("Cron jobs started.");
};
