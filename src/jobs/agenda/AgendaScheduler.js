import cron from "node-cron";
import { autoCloseExpiredQuestions, autoCloseExpiredThreads } from "../../crons/Threads.job.js";
import { processAccountDeletions } from "../../crons/AccountDeletionJob.js";
import { processPendingPayouts } from "./ProcessingPayout.js";

export const startAgenda = () => {
  cron.schedule("* * * * *", async () => {
    await autoCloseExpiredQuestions();
    await autoCloseExpiredThreads();
  });

  cron.schedule("* * * * *", async () => {
    await processAccountDeletions();
  });

  cron.schedule("* * * * *", async () => {
    await processPendingPayouts();
  });

  console.log("Cron jobs started.");
};
