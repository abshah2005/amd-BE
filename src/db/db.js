import mongoose from "mongoose";
import {DB_NAME} from "../constants.js"

const connectDB=async()=>{
    try {
        // const connectioninstance=await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}?retryWrites=true&w=majority&appName=AskMeDirect2`)
    const connectioninstance=await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`)
    console.log(`\n mongodb connected successfully`);
    } catch (error) {
        console.log("Error : ",error);
        process.exit(1);   
    }
}
export default connectDB;