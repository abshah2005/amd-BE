import dotenv from "dotenv"
import connectDB from "../src/db/db.js"
import { app } from "./app.js"

dotenv.config({path:"./env"});

connectDB().then(
    app.listen(process.env.PORT||8080,()=>{
        console.log(`Server running on port : ${process.env.PORT}`)
    })
).catch((err)=>{
    console.log("MongoDB connection failed !!!",err)
})