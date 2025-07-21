import { uploadOnS3 } from "../utils/Fileupload.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import axios from "axios";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { Users } from "../models/Users.model.js";
import { sendEmail } from "../utils/Nodemailer.js";

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await Users.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new Apierror(500, "Error generating access and refresh tokens");
  }
};

const registerStep1 = asynchandler(async (req, res) => {
  const { email, password, authProvider } = req.body;

  if (!email || (!password && authProvider === "email")) {
    throw new Apierror(
      400,
      "Email is required and password is required for email signup"
    );
  }

  const existingUser = await Users.findOne({ email });

  if (existingUser && existingUser.isRegistrationComplete) {
    throw new Apierror(400, "User with this email already exists");
  }

  if (authProvider === "linkedin") {
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = existingUser
      ? await Users.findOneAndUpdate(
          { email },
          {
            authProvider: "linkedin",
            password: hashedPassword,
            $setOnInsert: { registrationStep: 1 },
          },
          { new: true, upsert: true }
        )
      : await Users.create({
          email,
          password: hashedPassword,
          authProvider: "linkedin",
          registrationStep: 1,
        });

    return res.status(200).json(
      new Apiresponse(
        200,
        {
          email: user.email,
          currentStep: user.registrationStep,
          authProvider: "linkedin",
          isRegistrationComplete: user.isRegistrationComplete,
        },
        "Authentication successful"
      )
    );
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = existingUser
    ? await Users.findOneAndUpdate(
        { email },
        {
          password: hashedPassword,
          authProvider: "email",
          $setOnInsert: { registrationStep: 1 },
        },
        { new: true, upsert: true }
      )
    : await Users.create({
        email,
        password: hashedPassword,
        authProvider: "email",
        registrationStep: 1,
      });

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        email: user.email,
        currentStep: user.registrationStep,
        authProvider: "email",
        isRegistrationComplete: user.isRegistrationComplete,
      },
      "Step 1 completed"
    )
  );
});

const registerStep2 = asynchandler(async (req, res) => {
  const { email, role } = req.body;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email });

  if (!user) {
    throw new Apierror(404, "User not found - please complete step 1 first");
  }

  let updateFields = {
    role,
    registrationStep: 2,
  };

  if (user.authProvider === "linkedin") {
    updateFields.isRegistrationComplete = true;
    updateFields.registrationStep = 3;
  }

  const updatedUser = await Users.findOneAndUpdate({ email }, updateFields, {
    new: true,
  });

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        email: updatedUser.email,
        authProvider: updatedUser.authProvider, 
        role: updatedUser.role,
        currentStep: updatedUser.registrationStep,
        isRegistrationComplete: updatedUser.isRegistrationComplete,
      },
      "Role updated successfully"
    )
  );
});

const registerStep3 = asynchandler(async (req, res) => {
  const { email, firstName, lastName } = req.body;
  const profilePicPath = req.files?.profilePic?.[0]?.path;

  if (!email || !firstName || !lastName) {
    throw new Apierror(400, "Email, first name and last name are required");
  }

  let profilePicUrl = null;

  if (profilePicPath) {
    const uploadedPic = await uploadonCloudinary(profilePicPath);
    profilePicUrl = uploadedPic?.url || " ";
  }
  console.log(profilePicUrl);
  const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`;
  let username = baseUsername;
  let counter = 1;

  while (true) {
    const existingUser = await Users.findOne({
      username,
      email: { $ne: email },
    });
    if (!existingUser) break;
    username = `${baseUsername}${counter}`;
    counter++;
  }

  const updateFields = {
    firstName,
    lastName,
    profilePic: profilePicUrl,
    registrationStep: 3,
    isRegistrationComplete: true,
  };

  const updatedUser = await Users.findOneAndUpdate({ email }, updateFields, {
    new: true,
  }).select("-password -refreshToken");

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    updatedUser._id
  );

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        user: updatedUser,
        accessToken,
        refreshToken,
        currentStep: updatedUser.registrationStep,
        isRegistrationComplete: updatedUser.isRegistrationComplete,
      },
      "Profile updated successfully"
    )
  );
});

const getRegistrationState = asynchandler(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email }).select(
    "email registrationStep isRegistrationComplete role authProvider firstName lastName profilePic"
  );

  if (!user) {
    return res.status(200).json(
      new Apiresponse(
        200,
        {
          exists: false,
          currentStep: 0,
        },
        "No registration started with this email"
      )
    );
  }

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        exists: true,
        ...user.toObject(),
        currentStep: user.registrationStep,
      },
      "Registration state retrieved"
    )
  );
});

const linkedinCallback = asynchandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    throw new Apierror(400, "Authorization code is required");
  }

  try {
    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log(`Access Token here ${accessToken}`);

    const userInfoResponse = await axios.get(
      "https://api.linkedin.com/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    console.log("functioon reaches here");
    const userInfo = userInfoResponse.data;

    const email = userInfo.email;
    const firstName = userInfo.given_name || userInfo.firstName || "Unknown";
    const lastName = userInfo.family_name || userInfo.lastName || "Unknown";
    const profilePicUrl = userInfo.picture || "";

    let user = await Users.findOne({ email });

    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    if (!user) {
      user = await Users.create({
        email,
        firstName,
        lastName,
        password: hashedPassword,
        profilePic: profilePicUrl,
        authProvider: "linkedin",
        registrationStep: 1,
      });
    } else {
      user = await Users.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            profilePic: profilePicUrl || user.profilePic,
            authProvider: "linkedin",
            password: hashedPassword,
          },
        },
        { new: true }
      );
    }

    if (user.isRegistrationComplete) {
      const { accessToken, refreshToken } =
        await generateAccessAndRefreshTokens(user._id);
      return res
        .status(200)
        .json(
          new Apiresponse(
            200,
            { user, accessToken, refreshToken },
            "LinkedIn login successful"
          )
        );
    }

    return res.status(200).json(
      new Apiresponse(
        200,
        {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePic: user.profilePic,
          currentStep: user.registrationStep,
          authProvider: "linkedin",
          isRegistrationComplete: user.isRegistrationComplete,
        },
        "LinkedIn authentication successful"
      )
    );
  } catch (error) {
    console.error(
      "LinkedIn OAuth error:",
      error.response?.data || error.message
    );
    throw new Apierror(500, "LinkedIn authentication failed");
  }
});

const getLinkedInProfile = asynchandler(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email, authProvider: "linkedin" }).select(
    "firstName lastName profilePic linkedinProfileUrl"
  );

  if (!user) {
    throw new Apierror(404, "No LinkedIn account found with this email");
  }

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        firstName: user.firstName,
        lastName: user.lastName,
        profilePic: user.profilePic,
        linkedinProfileUrl: user.linkedinProfileUrl,
      },
      "LinkedIn profile data retrieved"
    )
  );
});

const Loginuser = asynchandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!email && !username) {
    throw new Apierror(400, "Email or username is required");
  }
  if (!password) {
    throw new Apierror(400, "Password is required");
  }

  const user = await Users.findOne({ $or: [{ email }, { username }] });
  if (!user) {
    throw new Apierror(400, "User not found, please sign up first");
  }

  const isMatch = bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Apierror(401, "Invalid credentials");
  }

  if (!user.isRegistrationComplete) {
    return res.status(200).json(
      new Apiresponse(
        200,
        {
          email: user.email,
          currentStep: user.registrationStep,
          isRegistrationComplete: false,
        },
        "Complete registration process"
      )
    );
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  return res.status(200).json(
    new Apiresponse(
      200,
      {
        user: {
          _id: user._id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          profilePic: user.profilePic,
        },
        accessToken,
        refreshToken,
      },
      "Logged in successfully"
    )
  );
});

const LogoutUser = asynchandler(async (req, res) => {
  const user = await Users.findByIdAndUpdate(
    req.user?._id,
    { $unset: { refreshToken: 1 } },
    { new: true }
  );
  if (!user) {
    throw new Apierror(400, "User not found");
  }
  res
    .status(200)
    .clearCookie("accessToken")
    .clearCookie("refreshToken")
    .json({ message: "Logged out successfully" });
});

const getCurrentUser = asynchandler(async (req, res) => {
  res.status(200).json(req.user);
});

const forgotPassword = asynchandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email });
  if (!user) {
    throw new Apierror(404, "User not found");
  }

  const resetToken = jwt.sign(
    { userId: user._id },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "1h" }
  );

  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000;
  await user.save();

  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Password Reset Request",
    html: `<p>Click <a href="${resetLink}">here</a> to reset your password. This link will expire in 1 hour.</p>`,
  };

  await transporter.sendMail(mailOptions);

  res
    .status(200)
    .json(new Apiresponse(200, null, "Password reset link sent to email"));
});

const resetPassword = asynchandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    throw new Apierror(400, "Token and new password are required");
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await Users.findById(decoded.userId);
    if (!user || user.resetPasswordExpires < Date.now()) {
      throw new Apierror(400, "Invalid or expired token");
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res
      .status(200)
      .json(new Apiresponse(200, null, "Password reset successfully"));
  } catch (error) {
    throw new Apierror(400, "Invalid or expired token");
  }
});

const updateInfo = asynchandler(async (req, res) => {
  const { name, username } = req.body;

  if (!name || !username) {
    throw new Apierror(400, "Both name and username are required");
  }

  const existingUser = await Users.findOne({
    username,
    _id: { $ne: req.user._id },
  });

  if (existingUser) {
    throw new Apierror(400, "Username already taken");
  }

  const updatedUser = await Users.findByIdAndUpdate(
    req.user._id,
    { name, username },
    { new: true, runValidators: true }
  ).select("-password -refreshToken");

  if (!updatedUser) {
    throw new Apierror(404, "User not found");
  }

  res
    .status(200)
    .json(new Apiresponse(200, updatedUser, "Profile updated successfully"));
});

export {
  updateInfo,
  Loginuser,
  LogoutUser,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  registerStep1,
  registerStep2,
  registerStep3,
  getRegistrationState,
  linkedinCallback,
  getLinkedInProfile,
};
