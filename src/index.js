import dotenv from "dotenv"
import connectDB from "../src/db/db.js"
import { app } from "./app.js"
import {startAgenda} from "./jobs/agenda/AgendaScheduler.js"

dotenv.config({path:"./env"});

connectDB().then(async () => {
    app.listen(process.env.PORT || 8080, () => {
        console.log(`Server running on port : ${process.env.PORT}`)
    });
    startAgenda();
}).catch((err) => {
    console.log("MongoDB connection failed !!!", err)
})