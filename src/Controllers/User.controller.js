import { uploadonCloudinary } from "../utils/Fileupload.js";
import { asynchandler } from "../utils/Asynchandler.js";
import { Apiresponse } from "../utils/Apiresponse.js";
import { Apierror } from "../utils/Apierror.js";
import axios from "axios"
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { Users } from "../models/Users.model.js";

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

  if (!email || (!password && authProvider === 'email')) {
    throw new Apierror(400, "Email is required and password is required for email signup");
  }


  const existingUser = await Users.findOne({ email });
  
  if (existingUser && existingUser.isRegistrationComplete) {
    throw new Apierror(400, "User with this email already exists");
  }

  if (authProvider === 'linkedin') {
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    
    const user = existingUser 
      ? await Users.findOneAndUpdate(
          { email },
          { 
            authProvider: 'linkedin',
            password: hashedPassword,
            $setOnInsert: { registrationStep: 1 } 
          },
          { new: true, upsert: true }
        )
      : await Users.create({
          email,
          password: hashedPassword,
          authProvider: 'linkedin',
          registrationStep: 1
        });

    return res.status(200).json(new Apiresponse(
      200, 
      { 
        email: user.email,
        currentStep: user.registrationStep,
        authProvider: 'linkedin',
        isRegistrationComplete: user.isRegistrationComplete
      }, 
      "Authentication successful"
    ));
  }

  // For email signup
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Update existing user or create new one
  const user = existingUser
    ? await Users.findOneAndUpdate(
        { email },
        { 
          password: hashedPassword,
          authProvider: 'email',
          $setOnInsert: { registrationStep: 1 }
        },
        { new: true, upsert: true }
      )
    : await Users.create({
        email,
        password: hashedPassword,
        authProvider: 'email',
        registrationStep: 1
      });

  return res.status(200).json(new Apiresponse(
    200, 
    { 
      email: user.email,
      currentStep: user.registrationStep,
      authProvider: 'email',
      isRegistrationComplete: user.isRegistrationComplete
    }, 
    "Step 1 completed"
  ));
});

const registerStep2 = asynchandler(async (req, res) => {
  const { email, role } = req.body;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  // Allow role update even if registration is complete
  const updateFields = { 
    registrationStep: 2,
    role // This will be validated by the schema
  };

  const user = await Users.findOneAndUpdate(
    { email },
    updateFields,
    { new: true }
  );

  if (!user) {
    throw new Apierror(404, "User not found - please complete step 1 first");
  }

  return res.status(200).json(new Apiresponse(
    200, 
    { 
      email: user.email,
      role: user.role,
      currentStep: user.registrationStep,
      isRegistrationComplete: user.isRegistrationComplete
    }, 
    "Role updated successfully"
  ));
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
  console.log(profilePicUrl)
  // Generate username
  const baseUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`;
  let username = baseUsername;
  let counter = 1;

  // Ensure username is unique
  while (true) {
    const existingUser = await Users.findOne({ username, email: { $ne: email } });
    if (!existingUser) break;
    username = `${baseUsername}${counter}`;
    counter++;
  }

  const updateFields = {
    firstName,
    lastName,
    profilePic: profilePicUrl,
    registrationStep: 3,
    isRegistrationComplete: true
  };

  const updatedUser = await Users.findOneAndUpdate(
    { email },
    updateFields,
    { new: true }
  ).select("-password -refreshToken");

  // Generate tokens if registration is being completed
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(updatedUser._id);

  return res.status(200).json(new Apiresponse(
    200, 
    { 
      user: updatedUser,
      accessToken,
      refreshToken,
      currentStep: updatedUser.registrationStep,
      isRegistrationComplete: updatedUser.isRegistrationComplete
    }, 
    "Profile updated successfully"
  ));
});

// New endpoint to get current registration state
const getRegistrationState = asynchandler(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email })
    .select("email registrationStep isRegistrationComplete role authProvider firstName lastName profilePic");

  if (!user) {
    return res.status(200).json(new Apiresponse(
      200, 
      { 
        exists: false,
        currentStep: 0
      }, 
      "No registration started with this email"
    ));
  }

  return res.status(200).json(new Apiresponse(
    200, 
    { 
      exists: true,
      ...user.toObject(),
      currentStep: user.registrationStep
    }, 
    "Registration state retrieved"
  ));
})




const linkedinCallback = asynchandler(async (req, res) => {
  const { code } = req.body;

  if (!code) {
    throw new Apierror(400, "Authorization code is required");
  }

  try {
    const tokenResponse = await axios.post(
      'https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_CALLBACK_URL,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // 2. Fetch LinkedIn profile data
    const profileResponse = await axios.get(
      'https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    // 3. Fetch LinkedIn email
    const emailResponse = await axios.get(
      'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    // Extract data
    const profileData = profileResponse.data;
    const emailData = emailResponse.data;

    const email = emailData.elements[0]['handle~'].emailAddress;
    const firstName = profileData.firstName?.localized?.en_US || 'Unknown';
    const lastName = profileData.lastName?.localized?.en_US || 'Unknown';
    const profilePicUrl = profileData.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier || '';

    // 4. Check if user exists (by email or LinkedIn ID)
    let user = await Users.findOne({ $or: [{ email }, { linkedinId }] });

    // 5. Generate a temporary password (for users signing up via LinkedIn)
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    if (!user) {
      // Create new user with LinkedIn data
      user = await Users.create({
        email,
        firstName,
        lastName,
        password: hashedPassword,
        profilePic: profilePicUrl,
        authProvider: 'linkedin',
        registrationStep: 1, 
      });
    } else {
      // Update existing user with LinkedIn data
      user = await Users.findOneAndUpdate(
        { _id: user._id },
        {
          $set: {
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            profilePic: profilePicUrl || user.profilePic,
            authProvider: 'linkedin',
            password: hashedPassword, 
          },
        },
        { new: true }
      );
    }

    // 6. Check if registration is complete
    if (user.isRegistrationComplete) {
      // Log them in immediately
      const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
      return res.status(200).json(new Apiresponse(
        200,
        { user, accessToken, refreshToken },
        "LinkedIn login successful"
      ));
    }

    // 7. Return LinkedIn data to continue registration
    return res.status(200).json(new Apiresponse(
      200,
      {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePic: user.profilePic,
        currentStep: user.registrationStep,
        authProvider: 'linkedin',
        isRegistrationComplete: user.isRegistrationComplete,
      },
      "LinkedIn authentication successful"
    ));

  } catch (error) {
    console.error('LinkedIn OAuth error:', error.response?.data || error.message);
    throw new Apierror(500, "LinkedIn authentication failed");
  }
});



const getLinkedInProfile = asynchandler(async (req, res) => {
  const { email } = req.query;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email, authProvider: 'linkedin' })
    .select('firstName lastName profilePic linkedinProfileUrl');

  if (!user) {
    throw new Apierror(404, "No LinkedIn account found with this email");
  }

  return res.status(200).json(new Apiresponse(
    200,
    {
      firstName: user.firstName,
      lastName: user.lastName,
      profilePic: user.profilePic,
      linkedinProfileUrl: user.linkedinProfileUrl
    },
    "LinkedIn profile data retrieved"
  ));
});





const sendOtp = async (user) => {
  const otp = ("" + Math.random()).substring(2, 6);
  user.otp = otp;
  user.otpExpiry = Date.now() + 5 * 60 * 1000;
  await user.save();

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: "Your OTP for Sign-In",
    html: `<p>Your OTP is: <b>${otp}</b></p>`,
  };

  await transporter.sendMail(mailOptions);
};

const Loginuser = asynchandler(async (req, res) => {
  const { email, username, password } = req.body;
  if (!email && !username) {
    throw new Apierror(400, "Email or Username is required");
  }

  const user = await Users.findOne({ $or: [{ email }, { username }] });
  if (!user) {
    throw new Apierror(400, "User not found, please sign up first");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });
  await sendOtp(user);
  res.status(200).json({ message: "OTP sent to email" });
});

const verifyOtp = asynchandler(async (req, res) => {
  const { email, otp } = req.body;
  const user = await Users.findOne({ email });
  if (!user) {
    throw new Apierror(400, "User not found");
  }
  if (user.otp !== otp || Date.now() > user.otpExpiry) {
    throw new Apierror(400, "Invalid or expired OTP");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { accessToken, refreshToken },
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

const updatePassword = asynchandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new Apierror(400, "Both old and new passwords are required");
  }

  const user = await Users.findById(req.user._id);
  if (!user) {
    throw new Apierror(400, "User not found");
  }

  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new Apierror(400, "Incorrect old password");
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  res
    .status(200)
    .json(new Apiresponse(200, null, "Password updated successfully"));
});

const verifyEmailStep1 = asynchandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new Apierror(400, "Email is required");
  }

  const user = await Users.findOne({ email }).select("-password");

  if (!user) {
    throw new Apierror(404, "No account found with this email");
  }

  res
    .status(200)
    .json(new Apiresponse(200, { email: user.email }, "Email verified"));
});

const updatePasswordStep2 = asynchandler(async (req, res) => {
  const { email, oldPassword, newPassword } = req.body;

  // 1. Validate input (email already verified in step 1)
  if (!oldPassword || !newPassword) {
    throw new Apierror(400, "Both old and new passwords are required");
  }

  // 2. Find user (email exists because step 1 passed)
  const user = await Users.findOne({ email });
  if (!user) {
    throw new Apierror(404, "User account not found");
  }

  const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password);
  if (!isPasswordCorrect) {
    throw new Apierror(401, "Current password is incorrect");
  }

  if (oldPassword === newPassword) {
    throw new Apierror(
      400,
      "New password must be different from current password"
    );
  }

  if (newPassword.length < 8) {
    throw new Apierror(400, "Password must be at least 8 characters");
  }

  user.password = newPassword;
  await user.save();

  res
    .status(200)
    .json(
      new Apiresponse(
        200,
        { email: user.email },
        "Password updated successfully"
      )
    );
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
  verifyEmailStep1,
  updatePasswordStep2,
  updatePassword,
  updateInfo,
  Loginuser,
  verifyOtp,
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
