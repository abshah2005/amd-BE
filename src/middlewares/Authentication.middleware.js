import { Apierror } from "../utils/Apierror.js";
import { asynchandler } from "../utils/Asynchandler.js";
import jwt from "jsonwebtoken";
import { Users } from "../models/Users.model.js";


const verifyJWT = asynchandler(async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.accessToken;
    const headerToken = req.header("Authorization")?.replace("Bearer ", "");
    const token = cookieToken || headerToken;
    if (!token) {
      throw new Apierror(401, "Unauthorized request");
    }

    const decodedtoken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await Users.findById(decodedtoken._id).select(
      "-password -refreshToken"
    );

    if (!user) {
      throw new Apierror(401, "Invalid Access Token");
    }
    if(user.activeRole === "professional") {
      await user.populate("professional")
    }
    

    req.user = user;
    
    next();
  } catch (error) {
    throw new Apierror(401, error?.message || "Invalid accessToken");
  }
});

export const trackActive = async (req, res, next) => {
  try {
    if (req.user && req.user._id) {
      await Users.findByIdAndUpdate(req.user._id, { lastActiveAt: new Date(), isActive: true }, { new: false });
    }
  } catch (err) {
    console.error("activeTracker error:", err.message);
  }
  next();
};

const optionalVerifyJWT = asynchandler(async (req, res, next) => {
  try {
    const cookieToken = req.cookies?.accessToken;
    const headerToken = req.header("Authorization")?.replace("Bearer ", "");
    const token = cookieToken || headerToken;
    if (!token) {
      // No token — proceed as anonymous
      req.user = undefined;
      return next();
    }

    // Validate token; if invalid, treat as anonymous (do not throw)
    let decodedtoken;
    try {
      decodedtoken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (err) {
      // invalid token -> ignore and continue as anonymous
      req.user = undefined;
      return next();
    }

    const user = await Users.findById(decodedtoken._id).select(
      "-password -refreshToken"
    );
    if (!user) {
      req.user = undefined;
      return next();
    }
    if (user.activeRole === "professional") {
      await user.populate("professional");
    }
    req.user = user;
    next();
  } catch (err) {
    console.warn("optionalVerifyJWT error:", err.message || err);
    req.user = undefined;
    next();
  }
});

const verifyAdmin=asynchandler(async(req,res,next)=>{
  if(req.user && req.user.role==="admin"){
    next();
  }
  else{
    throw new Apierror(401,"You are not logged in login first")
  }
})

export {verifyJWT,verifyAdmin,optionalVerifyJWT}