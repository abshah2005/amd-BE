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
app.use("/api/users", userRoute);


app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
});

export { app };
