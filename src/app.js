import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import userRoute from "./routes/User.routes.js";


const app = express();

app.use(cors({
  origin: ["http://localhost:8081", "http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));



app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Routes
app.use("/api/users", userRoute);


export { app };
