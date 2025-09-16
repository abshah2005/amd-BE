import agenda from "./AgendaInstance.js";
import "./HourlyJob.js";
import "./MonthlyJob.js";
import "./MonhtlyMidnight.js";
import "./MinuteJob.js";
import "../../crons/AccountDeletionJob.js"

export const startAgenda = async () => {
  await agenda.start();
  // await agenda.every("1 hour", "hourly check");
  // await agenda.every("1 month", "monthly report");
  // await agenda.every("1 minute","minute check");
  // await agenda.every("0 0 1 * *", "monthly midnight task"); 
  await agenda.every("1 minute","account-deletion.process")
};