import cron from "node-cron";

cron.schedule("*/5 * * * * *", async () => {
//   await autoCloseExpiredThreads();
  console.log("Auto-close expired threads job ran.");
});