import agenda from "./AgendaInstance.js";

agenda.define("hourly check", async (job) => {
  console.log("Hourly check running");
});