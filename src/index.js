// import dotenv from "dotenv";
// import connectDB from "../src/db/db.js";
// import { app } from "./app.js";
// import path from "path";
// import { fileURLToPath } from "url";
// import http from "http";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// dotenv.config({ path: path.join(__dirname, "../../.env") });

// const server = http.createServer(app);


// connectDB()
//   .then(() => {
//     const PORT = process.env.PORT || 8080;
//     server.listen(PORT, () => {
//       console.log(`🚀 Server running on port: ${PORT}`);
//     });
//   })
//   .catch((err) => {
//     console.error("❌ MongoDB connection failed:", err);
//   });


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