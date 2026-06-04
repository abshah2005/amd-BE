import Agenda from "agenda";
import mongoose from "mongoose";

const agenda = new Agenda({
  mongo: mongoose.connection.db,
  collection: "agendaJobs",
  processEvery: "30 seconds",
});

export default agenda;