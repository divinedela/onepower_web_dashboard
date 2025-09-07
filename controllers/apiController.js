const otpGenerator = require("otp-generator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const moment = require("moment");
const { verifyAccess } = require("../config/verification");

// Importing models
const userModel = require("../model/userModel");
const otpModel = require("../model/otpModel");
const forgotPasswordOtpModel = require("../model/forgotPasswordOtpModel");
const introModel = require("../model/introModel");
const categoryModel = require("../model/categoryModel");
const campaignModel = require("../model/campaignModel");
const bannerModel = require("../model/bannerModel");
const newsModel = require("../model/newsModel"); // <-- for clarity (populate newsId)
const donationModel = require("../model/donationModel");
const favouriteCampaignModel = require("../model/favouriteCampaignModel");
const paymentGatewayModel = require("../model/paymentGatewayModel");
const pageModel = require("../model/pageModel");
const userNotificationModel = require("../model/userNotificationModel");
const notificationModel = require("../model/notificationModel");
const currencyTimezoneModel = require("../model/currencyTimezoneModel");

// Importing the service function to send otp mail
const sendOtpMail = require("../services/sendOtpMail");

// Importing the service function to delete image
const deleteImages = require("../services/deleteImage");

// Importing the service function to get campaigns with donation info
const combineCampaignAndDonation = require("../services/combineCampaignAndDonation");

// Importing the service function to send notification
const { sendAdminNotification } = require("../services/sendNotification");

// Importing the function to get the configstore instance
//const { getConfigData } = require("../services/getConfigstoreInstance");

// Check Register User
const checkRegisterUser = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Removed 'next' as it is not defined

      // Extract data from the request
      const email = req.body.email;

      // Validate email
      if (!email) {
        return res.json({
          data: { success: 0, message: "Email is required", error: 1 },
        });
      }

      // Check if user already exists
      const isExisting = await userModel.findOne({ email });

      if (!isExisting) {
        return res.json({
          data: {
            success: 1,
            message: "User does not exist, please sign up",
            error: 0,
          },
        });
      } else {
        return res.json({
          data: { success: 0, message: "User already exists", error: 1 },
        });
      }
    });
  } catch (error) {
    console.log("Error during check register user", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// sign up
const signUp = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const {
        firstname,
        lastname,
        email,
        country_code,
        phone_number,
        password,
      } = req.body;

      // Check if user already exists
      const existingUser = await userModel.findOne({ email });

      if (existingUser) {
        return res.status(400).json({
          data: { success: 0, message: "User already exists", error: 1 },
        });
      }

      // generate otp
      const otp = otpGenerator.generate(4, {
        upperCaseAlphabets: false,
        specialChars: false,
        lowerCaseAlphabets: false,
      });

      // Save OTP
      await otpModel.findOneAndUpdate(
        { email },
        { $set: { email, otp } },
        { upsert: true, new: true }
      );

      // Send OTP email
      try {
        await sendOtpMail(otp, email, firstname, lastname);
      } catch (_) {
        return res.json({
          data: {
            success: 0,
            message: "Something went wrong. Please try again...",
            error: 1,
          },
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Save user
      const newUser = new userModel({
        firstname,
        lastname,
        email,
        country_code,
        phone_number,
        password: hashedPassword,
      });
      const savedUser = await newUser.save();

      if (!savedUser) {
        return res.status(500).json({
          data: {
            success: 0,
            message: "Something went wrong. Please try again...",
            error: 1,
          },
        });
      }

      return res.json({
        data: {
          success: 1,
          message:
            "Successfully signed up! Please check your email to verify OTP.",
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during sign up", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

const testOTP = async (req, res) => {
  console.log("test otp");

  const otp = otpGenerator.generate(4, {
    upperCaseAlphabets: false,
    specialChars: false,
    lowerCaseAlphabets: false,
  });

  console.log("test otp : otp", otp);

  try {
    await sendOtpMail(otp, "divinedela.dev@gmail.com", "divine", "dela");

    return res.json({
      data: {
        success: 1,
        message:
          "Successfully signed up! Please check your email to verify OTP.",
        error: 0,
      },
    });
  } catch (error) {
    console.log("Error during otp test", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

//  verify otp
const verifyOTP = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const email = req.body.email;
      const otp = req.body.otp;

      // Validate email and otp
      if (!email || !otp) {
        return res.json({
          data: { success: 0, message: "Email and OTP is required", error: 1 },
        });
      }

      // Check if there is an OTP record for the given email
      const user = await otpModel.findOne({ email });

      if (!user) {
        return res.json({
          data: {
            success: 0,
            message: "Email not found. Please try again...",
            error: 1,
          },
        });
      }

      if (otp !== user.otp) {
        return res.json({
          data: {
            success: 0,
            message: "Incorrect OTP. Please try again...",
            error: 1,
          },
        });
      }

      // Update the otp verify status
      const updatedUser = await userModel.findOneAndUpdate(
        { email },
        { $set: { isVerified: true, status: "Active" } }
      );

      // Generate token
      const token = jwt.sign(
        { id: updatedUser._id, email },
        process.env.JWT_SECRET_KEY
      );

      // Exclude sensitive fields from the user object
      const filteredUser = {
        _id: updatedUser._id,
        firstname: updatedUser.firstname,
        lastname: updatedUser.lastname,
        email: updatedUser.email,
        country_code: updatedUser.country_code,
        phone_number: updatedUser.phone_number,
        is_active: updatedUser.is_active,
      };

      // Delete otp
      await otpModel.deleteOne({ email });

      // Update user notification data
      const { registrationToken, deviceId } = req.body;

      await userNotificationModel.updateOne(
        { userId: updatedUser._id, deviceId },
        { $set: { registrationToken } },
        { upsert: true }
      );

      return res.json({
        data: {
          success: 1,
          message: "OTP verified successfully",
          token,
          user: filteredUser,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during verify otp", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// sign in
const signIn = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const { email, password } = req.body;

      // Validate email and password
      if (!email || !password) {
        return res.json({
          data: {
            success: 0,
            message: "Email and password is required",
            error: 1,
          },
        });
      }

      // fetch particular user
      const user = await userModel.findOne({ email });

      if (!user) {
        return res.json({
          data: {
            success: 0,
            message:
              "We're sorry, something went wrong when attempting to sign in.",
            error: 1,
          },
        });
      }

      // compare password
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (!passwordMatch) {
        return res.json({
          data: {
            success: 0,
            message:
              "We're sorry, something went wrong when attempting to sign in.",
            error: 1,
          },
        });
      }

      if (user.is_active === false) {
        return res.json({
          data: {
            success: 0,
            message:
              "Your account has been banned. Please contact support for more details.",
            error: 1,
          },
        });
      }

      // generate token
      const token = jwt.sign(
        { id: user._id, email: user.email },
        process.env.JWT_SECRET_KEY
      );

      // Exclude sensitive fields from the user object
      const filteredUser = {
        _id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        country_code: user.country_code,
        phone_number: user.phone_number,
        is_active: user.is_active,
      };

      // Update user notification data
      const { registrationToken, deviceId } = req.body;

      await userNotificationModel.updateOne(
        { userId: user._id, deviceId },
        { $set: { registrationToken } },
        { upsert: true }
      );

      // response based on user verification status
      if (!user.isVerified) {
        return res.json({
          data: {
            success: 1,
            message:
              "Login successful ..., but your account is pending verification. Please check your email to complete the verification process.",
            token,
            user: filteredUser,
            error: 0,
          },
        });
      } else {
        return res.json({
          data: {
            success: 1,
            message: "Logged in successfully.",
            token,
            user: filteredUser,
            error: 0,
          },
        });
      }
    });
  } catch (error) {
    console.log("Error during sign in", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// is verify account
const isVerifyAccount = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const email = req.body.email;

      // Validate email
      if (!email) {
        return res.json({
          data: { success: 0, message: "Email is required", error: 1 },
        });
      }

      // fetch user
      const existingUser = await userModel.findOne({ email });

      if (!existingUser) {
        return res.json({
          data: { success: 0, message: "User not found", error: 1 },
        });
      }

      if (!existingUser.isVerified) {
        return res.json({
          data: {
            success: 0,
            message:
              "Your account is not verified. Please verify your account...",
            error: 1,
          },
        });
      } else {
        return res.json({
          data: {
            success: 1,
            message: "Your account has been successfully verified.",
            error: 0,
          },
        });
      }
    });
  } catch (error) {
    console.log("Error during is verify account", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// resend otp
const resendOtp = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const email = req.body.email;

      // Validate email
      if (!email) {
        return res.json({
          data: { success: 0, message: "Email is required", error: 1 },
        });
      }

      // Check if user already exists
      const existingUser = await userModel.findOne({ email });

      if (!existingUser) {
        return res.json({
          data: { success: 0, message: "User not found", error: 1 },
        });
      }

      if (existingUser.isVerified === true) {
        return res.json({
          data: {
            success: 0,
            message: "Your account is already verified.",
            error: 1,
          },
        });
      }

      // generate otp
      const otp = otpGenerator.generate(4, {
        upperCaseAlphabets: false,
        specialChars: false,
        lowerCaseAlphabets: false,
      });

      // Save OTP
      await otpModel.findOneAndUpdate(
        { email },
        { $set: { email, otp } },
        { new: true, upsert: true }
      );

      // Send OTP email
      try {
        await sendOtpMail(
          otp,
          email,
          existingUser.firstname,
          existingUser.lastname
        );
      } catch (_) {
        return res.json({
          data: {
            success: 0,
            message: "Something went wrong. Please try again...",
            error: 1,
          },
        });
      }

      return res.json({
        data: {
          success: 1,
          message:
            "We've sent an OTP to your email. Please check your inbox to verify your account.",
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during verify Account", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// forgot password
const forgotPassword = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const email = req.body.email;

      // Validate email
      if (!email) {
        return res.json({
          data: { success: 0, message: "Email is required", error: 1 },
        });
      }

      // Check if email exists
      const user = await userModel.findOne({ email });

      if (!user) {
        return res.json({
          data: {
            success: 0,
            message: "Incorrect Email, please try again...",
            error: 1,
          },
        });
      }

      // Generate OTP
      const otp = otpGenerator.generate(4, {
        upperCaseAlphabets: false,
        specialChars: false,
        lowerCaseAlphabets: false,
      });

      // save OTP
      await forgotPasswordOtpModel.findOneAndUpdate(
        { email },
        { otp },
        { upsert: true, new: true }
      );

      // Send OTP email
      try {
        await sendOtpMail(otp, email, user.firstname, user.lastname);
      } catch (_) {
        return res.json({
          data: {
            success: 0,
            message: "Something went wrong. Please try again...",
            error: 1,
          },
        });
      }

      return res.json({
        data: {
          success: 1,
          message:
            "We've sent an OTP to your email. Please check your inbox to reset your password.",
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during forgot password", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

const forgotPasswordOtpVerification = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res.json({
          data: { success: 0, message: "Email and OTP is required", error: 1 },
        });
      }

      const otpRecord = await forgotPasswordOtpModel.findOne({ email });
      if (!otpRecord) {
        return res.json({
          data: {
            success: 0,
            message: "Incorrect Email. Please try again...",
            error: 1,
          },
        });
      }

      if (otp !== otpRecord.otp) {
        return res.json({
          data: {
            success: 0,
            message: "Incorrect OTP. Please try again...",
            error: 1,
          },
        });
      }

      otpRecord.isVerified = true;
      await otpRecord.save();

      // kept shape consistent with others
      return res.json({
        data: { success: 1, message: "OTP verified successfully", error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during forgot password otp verification", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      const { email, new_password } = req.body;
      if (!email || !new_password) {
        return res.json({
          data: {
            success: 0,
            message: "Email and password is required",
            error: 1,
          },
        });
      }

      const otpRecord = await forgotPasswordOtpModel.findOne({ email });
      if (!otpRecord) {
        return res.status(400).json({
          data: {
            success: 0,
            message: "Invalid email. Please try again",
            error: 1,
          },
        });
      }

      // Check if the user's OTP is not verified
      if (!otpRecord.isVerified) {
        return res.status(400).json({
          data: { success: 0, message: "Please verify your OTP", error: 1 },
        });
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);
      await userModel.findOneAndUpdate(
        { email },
        { $set: { password: hashedPassword } },
        { new: true }
      );

      await forgotPasswordOtpModel.deleteOne({ email });

      return res.json({
        data: { success: 1, message: "Successfully reset password", error: 0 },
      });
    });
  } catch (error) {
    console.error("Error during reset password", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get user details
const getUserDetails = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const userId = req.user;

      // fetch user details using id
      const user = await userModel.findOne(
        { _id: userId },
        { password: 0, isVerified: 0, registeredBy: 0 }
      );

      // Check if the user is not found
      if (!user) {
        return res.json({
          data: { success: 0, message: "User Not Found", user, error: 1 },
        });
      } else {
        return res.json({
          data: { success: 1, message: "User Found", user, error: 0 },
        });
      }
    });
  } catch (error) {
    console.error("Error during  get user details", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// Upload Image
const uploadImage = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request
      const avatar = req.file?.filename;

      // Checking if the image file exists
      if (avatar) {
        return res.json({
          data: {
            success: 1,
            message: "Image Uploaded Successfully",
            image: avatar,
            error: 0,
          },
        });
      } else {
        return res.json({
          data: { success: 0, message: "Image Not uploaded", error: 1 },
        });
      }
    });
  } catch (error) {
    console.log("Error during upload image:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// Edit User Profile
const editUserProfile = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request
      const userId = req.user;
      const { firstname, lastname, country_code, phone_number } = req.body;
      const newImage = req.body ? req.body.image : null;

      // Find the user by ID
      const user = await userModel.findById(userId);

      if (!user) {
        return res.json({
          data: { success: 0, message: "User not found", error: 1 },
        });
      }

      // Handle image updates
      let image = user.image;
      if (newImage && newImage !== user.image) {
        if (user.image) {
          // Delete the old image if it exists
          deleteImages(user.image);
        }
        image = newImage;
      }

      // update user details
      const updatedUser = await userModel.findOneAndUpdate(
        { _id: userId },
        { $set: { firstname, lastname, country_code, phone_number, image } },
        { new: true }
      );

      if (!updatedUser) {
        return res.json({
          data: { success: 0, message: "Profile update failed", error: 1 },
        });
      }

      return res.json({
        data: { success: 1, message: "Profile updated successfully", error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during user edit:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// Change password for user
const changePassword = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request
      const userId = req.user;
      const currentPassword = req.body.currentPassword;
      const newPassword = req.body.newPassword;
      const confirmPassword = req.body.confirmPassword;

      // compare
      if (newPassword !== confirmPassword)
        return res.json({
          data: {
            success: 0,
            message: "Confirm password does not match",
            error: 1,
          },
        });

      // fetch user password
      const userData = await userModel.findById(userId);

      // compare password
      const passwordMatch = await bcrypt.compare(
        currentPassword,
        userData.password
      );

      if (!passwordMatch) {
        return res.json({
          data: {
            success: 0,
            message:
              "Incorrect current password. Please enter the correct password and try again...",
            error: 1,
          },
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // update password
      await userModel.findByIdAndUpdate(
        { _id: userId },
        { $set: { password: hashedPassword } },
        { new: true }
      );

      return res.json({
        data: {
          success: 1,
          message: "Password changed successfully",
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during change password:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// delete account for user
const deleteAccountUser = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request
      const userId = req.user;

      // fetch user
      const user = await userModel.findOne({ _id: userId });

      if (!user)
        return res.json({
          data: { success: 0, message: "User Not Found", error: 1 },
        });

      if (user.image) {
        // delete user image
        deleteImages(user.image);
      }

      // delete favourite campaign
      await favouriteCampaignModel.deleteMany({ userId });

      // delete donation
      await donationModel.updateMany({ userId }, { $set: { userId: null } });

      // delete campaign
      await campaignModel.updateMany({ userId }, { $set: { userId: null } });

      // delete user notification
      await userNotificationModel.deleteMany({ userId });

      //  delete user
      await userModel.deleteOne({ _id: userId });

      return res.json({
        data: { success: 1, message: "Successfully deleted user", error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during delete account", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all intro
const getAllIntro = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch intro
      const intro = await introModel.find({ status: "Publish" }, { status: 0 });

      if (!intro.length)
        return res.json({
          data: { success: 0, message: "Intro Not Found", intro, error: 1 },
        });
      return res.json({
        data: { success: 1, message: "Intro Found", intro, error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during get all intro", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all banner
const getAllBanner = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch banner
      const banners = await bannerModel
        .find({ status: "Publish" }, { status: 0 })
        .populate({
          path: "newsId",
          select: "_id image title description publishedAt status",
        })
        .sort({ createdAt: -1 })
        .lean();

      if (!banners.length) {
        return res.json({
          data: {
            success: 0,
            message: "Banner Not Found",
            banner: [],
            error: 1,
          },
        });
      }

      // // Update banner data
      const filtered = banners.filter(
        (b) => b.newsId && b.newsId.status === "Publish"
      );

      // trim very long descriptions (optional)
      const trimmed = filtered.map((b) => ({
        ...b,
        newsId: b.newsId
          ? {
              ...b.newsId,
              description:
                typeof b.newsId.description === "string"
                  ? b.newsId.description.slice(0, 1000)
                  : b.newsId.description,
            }
          : null,
      }));

      return res.json({
        data: {
          success: 1,
          message: "Banner Found",
          banner: filtered,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all banner", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all Category
const getAllCategory = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch category
      const category = await categoryModel.find(
        { status: "Publish" },
        { status: 0 }
      );

      if (!category.length)
        return res.json({
          data: {
            success: 0,
            message: "Category Not Found",
            category,
            error: 1,
          },
        });

      return res.json({
        data: { success: 1, message: "Category Found", category, error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during get all Category", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// most polulated campaigns
const mostPopulatedCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch campaign
      const campaignData = await campaignModel
        .find(
          { status: "Publish", campaign_status: { $in: ["Running"] } },
          { status: 0, isApproved: 0, userId: 0, isUser: 0 }
        )
        .populate("categoryId", "_id image name");

      if (!campaignData.length)
        return res.json({
          data: {
            success: 0,
            message: "no running project found",
            campaigns: [],
            error: 1,
          },
        });

      // combine campaign and donation
      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      // Sort updatedCampaignData in descending order based on  totalDonationAmount
      updatedCampaignData.sort(
        (a, b) => b.totalDonationAmount - a.totalDonationAmount
      );

      return res.json({
        data: {
          success: 1,
          message: "Most popular campaigns found",
          campaigns: updatedCampaignData,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during most populate campaign:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// Calculate remaining days for running campaigns
const comingToEndCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch campaign
      const campaignData = await campaignModel
        .find(
          { status: "Publish", campaign_status: { $in: ["Running"] } },
          { status: 0, isApproved: 0, userId: 0, isUser: 0 }
        )
        .populate("categoryId", "_id image name");

      if (!campaignData.length)
        return res.json({
          data: {
            success: 0,
            message: "no running project found",
            campaigns: [],
            error: 1,
          },
        });

      // combine campaign and donation
      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      // Custom sort for remainingTime
      updatedCampaignData.sort((a, b) => {
        const getSortValue = (remainingTime) => {
          if (remainingTime.includes("hours left")) return 0;
          if (remainingTime.includes("days left")) return 1;
          if (remainingTime.includes("Upcoming in")) return 2;
          return 3; // Default if none match
        };

        const sortValueA = getSortValue(a.remainingTime);
        const sortValueB = getSortValue(b.remainingTime);

        // First, sort by priority (hours > days > upcoming)
        if (sortValueA !== sortValueB) return sortValueA - sortValueB;

        // If same priority, sort numerically within category
        const numA = parseInt(a.remainingTime.match(/\d+/)) || 0;
        const numB = parseInt(b.remainingTime.match(/\d+/)) || 0;
        return numA - numB;
      });

      return res.json({
        data: {
          success: 1,
          message: "coming to end campaign Found",
          campaigns: updatedCampaignData,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during coming to end campaign:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

//get all campaign
const getAllCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request
      const campaignId = req.body.campaignId;
      const categoryId = req.body.categoryId;

      const filter = {};

      if (campaignId) filter._id = campaignId;

      if (categoryId) filter.categoryId = categoryId;

      filter.status = "Publish";

      filter.campaign_status = { $in: ["Running", "Upcoming"] };

      // fetch campaign
      const campaignData = await campaignModel
        .find(filter, { status: 0, isApproved: 0, userId: 0, isUser: 0 })
        .populate("categoryId", "_id image name");

      if (!campaignData.length)
        return res.json({
          data: {
            success: 0,
            message: "Campaign Not Found",
            campaigns: [],
            error: 1,
          },
        });

      // combine campaign and donation
      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      return res.json({
        data: {
          success: 1,
          message: "Campaign Found",
          campaigns: updatedCampaignData,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all campaign:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all upcoming campaign
const getAllUpcomingCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch campaign
      const campaignData = await campaignModel
        .find(
          { status: "Publish", campaign_status: "Upcoming" },
          { status: 0, isApproved: 0, userId: 0, isUser: 0 }
        )
        .populate("categoryId", "_id image name");

      if (!campaignData.length)
        return res.json({
          data: {
            success: 0,
            message: "no upcoming project found",
            campaigns: [],
            error: 1,
          },
        });

      // combine campaign and donation
      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      return res.json({
        data: {
          success: 1,
          message: "upcoming project found",
          campaigns: updatedCampaignData,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all upcoming projects:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all ended campaign
const getAllEndedCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch campaign
      const campaignData = await campaignModel
        .find(
          { status: "Publish", campaign_status: "Ended" },
          { status: 0, isApproved: 0, userId: 0, isUser: 0 }
        )
        .populate("categoryId", "_id image name");

      if (!campaignData.length)
        return res.json({
          data: {
            success: 0,
            message: "no ended projects Found",
            campaigns: [],
            error: 1,
          },
        });

      // combine campaign and donation
      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      return res.json({
        data: {
          success: 1,
          message: "ended projects Found",
          campaigns: updatedCampaignData,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during getting all ended projects:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// add campaign
const addCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request
      const userId = req.user;
      const image = req.body.image;
      const name = req.body.name;
      const categoryId = req.body.categoryId;
      const starting_date = req.body.starting_date;
      const ending_date = req.body.ending_date;
      const campaign_amount = req.body.campaign_amount;
      const organizer_image = req.body.organizer_image;
      const organizer_name = req.body.organizer_name;
      const description = req.body.description.replace(/"/g, "&quot;");
      const gallery = req.body.gallery;

      const fields = {
        image,
        name,
        categoryId,
        starting_date,
        ending_date,
        campaign_amount,
        organizer_image,
        organizer_name,
        description,
      };
      const missingFields = [];

      // Check each field and add the field name to the missingFields array if it is not provided
      for (const [key, value] of Object.entries(fields)) {
        if (!value || value === null || value === undefined) {
          missingFields.push(key);
        }
      }

      // Return a response with the missing fields if there are any
      if (missingFields.length > 0) {
        return res.json({
          data: {
            success: 0,
            message: `Missing required fields: ${missingFields.join(", ")}`,
            error: 1,
          },
        });
      }

      const category = await categoryModel.findOne({ _id: categoryId });

      if (!category)
        return res.json({
          data: { success: 0, message: "Category Not Found", error: 1 },
        });

      // Parse the date from the request with strict format validation
      const startingDateString = moment(starting_date, "YYYY-MM-DD", true);
      const endingDateString = moment(ending_date, "YYYY-MM-DD", true);

      // Check if the parsed date is valid
      if (!startingDateString.isValid() || !endingDateString.isValid())
        return res.json({
          data: {
            success: 0,
            message: "Invalid Date, please enter a valid date",
            error: 1,
          },
        });

      // Getting the current date
      const currentDate = new Date().toISOString().split("T")[0];

      // Convert the provided date to a Date object
      const startingDate = new Date(starting_date).toISOString().split("T")[0];
      const endingDate = new Date(ending_date).toISOString().split("T")[0];

      // Check if the provided date is earlier than the current date
      if (startingDate < currentDate || endingDate < currentDate)
        return res.json({
          data: {
            success: 0,
            message:
              "Please choose a date that is today or in the future. Past dates cannot be selected for campaign.",
            error: 1,
          },
        });

      if (startingDate > endingDate)
        return res.json({
          data: {
            success: 0,
            message:
              "Please ensure that the starting date is before the ending date.",
            error: 1,
          },
        });

      // Save the campaign
      const savedCampaign = await new campaignModel({
        image,
        name,
        categoryId,
        starting_date,
        ending_date,
        campaign_amount,
        organizer_image,
        organizer_name,
        description,
        gallery,
        userId,
        isUser: true,
        status: "UnPublish",
      }).save();

      if (!savedCampaign)
        return res.json({
          data: { success: 0, message: "Failed to save campaign", error: 1 },
        });

      // Fetch user
      const findUser = await userModel.findOne({ _id: userId });

      // Send notification to admin
      await sendAdminNotification(
        "New Campaign Added",
        `A new campaign ${name} has been added by ${findUser.firstname} ${findUser.lastname}`
      );

      return res.json({
        data: { success: 1, message: "Campaign added successfully", error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during add campaign", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all user campaign
const getAllUserCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      const userId = req.user;

      const campaignData = await campaignModel
        .find({ userId, isUser: true }, { status: 0, userId: 0, isUser: 0 })
        .populate("categoryId", "_id image name")
        .sort({ createdAt: -1 });

      if (!campaignData.length)
        return res.json({
          data: {
            success: 0,
            message: "Campaign Not Found",
            campaigns: campaignData,
            error: 1,
          },
        });

      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      return res.json({
        data: {
          success: 1,
          message: "Campaign Found",
          campaigns: updatedCampaignData,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all user campaign", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// delete campaign
const deleteCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request query
      const userId = req.user;
      const campaignId = req.body.campaignId;

      const campaignData = await campaignModel.findOne({
        _id: campaignId,
        userId,
        isUser: true,
      });

      if (!campaignData)
        return res.json({
          data: {
            success: 0,
            message: "This campaign is not belong to you",
            error: 1,
          },
        });

      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      if (["Running", "Ended"].includes(updatedCampaignData.campaign_status)) {
        return res.json({
          data: {
            success: 0,
            message: `You can't delete the ${updatedCampaignData.name} campaign because it's already ${updatedCampaignData.campaign_status}`,
            error: 1,
          },
        });
      }

      const deletedCampaign = await campaignModel.deleteOne({
        _id: campaignId,
        userId,
        isUser: true,
      });

      if (deletedCampaign.deletedCount === 0) {
        return res.json({
          data: { success: 0, message: "Failed to delete campaign", error: 1 },
        });
      }

      return res.json({
        data: {
          success: 1,
          message: "Campaign deleted successfully",
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during delete campaign", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// donate amount
const donateAmount = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request
      const userId = req.user._id;
      const campaignId = req.body.campaignId;
      const amount = req.body.amount;
      const payment_method = req.body.payment_method;
      const transaction_id = req.body.transaction_id;
      const payment_status = req.body.payment_status;

      if (payment_status === "Failed") {
        return res.json({
          data: {
            success: 0,
            message: "Payment Failed so donation not added",
            error: 1,
          },
        });
      }

      // Validate the donation amount
      if (!amount || isNaN(amount) || amount <= 0) {
        return res.json({
          data: { success: 0, message: "Invalid donation amount", error: 0 },
        });
      }

      const currentDate = new Date().toISOString().split("T")[0];

      const campaignData = await campaignModel.findOne({ _id: campaignId });

      if (!campaignData) {
        return res.json({
          data: { success: 0, message: "Campaign Not Found", error: 1 },
        });
      }

      // Save the donation
      const savedDonation = await new donationModel({
        userId,
        campaignId,
        amount,
        date: currentDate,
        payment_method,
        transaction_id,
        payment_status,
      }).save();

      if (!savedDonation)
        return res.json({
          data: {
            success: 0,
            message: "Failed to donate amount. Please try again later.",
            error: 1,
          },
        });

      return res.json({
        data: { success: 1, message: "Donation added successfully", error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during add donation:", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all donate history
const getAllDonateHistory = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      const userId = req.user;

      const donateHistory = await donationModel
        .find({ userId })
        .populate("campaignId userId", "_id name image firstname lastname");

      if (!donateHistory.length) {
        return res.json({
          data: {
            success: 0,
            message: "No donate history found",
            donateHistory,
            error: 1,
          },
        });
      }

      return res.json({
        data: {
          success: 1,
          message: "Donate history found",
          donateHistory,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all donate history", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// add favourite campaign
const addFavouriteCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const userId = req.user;
      const campaignId = req.body.campaignId;

      // Validate input
      if (!campaignId)
        return res.status(400).json({
          data: { success: 0, message: "Campaign is required.", error: 1 },
        });

      // Check if the campaign is already a favourite for the user
      const existingFavourite = await favouriteCampaignModel.findOne({
        userId,
        campaignId,
      });
      if (existingFavourite) {
        return res.status(409).json({
          data: {
            success: 0,
            message: "This campaign is already in your favourites.",
            error: 1,
          },
        });
      }

      // Save the favourite campaign
      const savedFavouriteCampaign = await new favouriteCampaignModel({
        userId,
        campaignId,
      }).save();

      if (!savedFavouriteCampaign) {
        return res.json({
          data: {
            success: 0,
            message: "Campaign not added to favourites successfully",
            error: 1,
          },
        });
      }

      // Respond with success
      return res.status(201).json({
        data: {
          success: 1,
          message: "Campaign added to favourites successfully.",
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during add favourite campaign", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all favourite campaigns
const getAllFavouriteCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const userId = req.user;

      // Fetch all favourite campaigns
      const favouriteCampaigns = await favouriteCampaignModel.find({ userId });

      // Check if any favorite campaign items are found
      if (!favouriteCampaigns.length) {
        return res.status(404).json({
          data: {
            success: 0,
            message: "No favourite campaigns found for this user",
            campaigns: favouriteCampaigns,
            error: 1,
          },
        });
      }

      const favouriteCampaignIds = favouriteCampaigns.map(
        (fc) => fc.campaignId
      );

      // fetch campaign
      const campaignData = await campaignModel
        .find(
          { _id: { $in: favouriteCampaignIds }, status: "Publish" },
          { status: 0, isApproved: 0, userId: 0, isUser: 0 }
        )
        .populate("categoryId", "_id image name");

      // combine campaign and donation
      const updatedCampaignData = await combineCampaignAndDonation(
        campaignData
      );

      return res.status(200).json({
        data: {
          success: 1,
          message: "Favourite campaigns retrieved successfully",
          campaigns: updatedCampaignData,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all favourite campaigns", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// delete favourite campaign
const deleteFavouriteCampaign = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const userId = req.user;
      const campaignId = req.body.campaignId;

      // Delete favourite campaign for the user
      const deletedFavouriteCampaign = await favouriteCampaignModel.deleteOne({
        userId,
        campaignId,
      });

      // Check if favourite campaign was deleted
      if (deletedFavouriteCampaign.deletedCount === 0) {
        return res.status(404).json({
          data: {
            success: 0,
            message: "Favourite campaign not found",
            error: 1,
          },
        });
      }

      return res.status(200).json({
        data: {
          success: 1,
          message: "Favourite campaign deleted successfully",
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during delete favourite campaign", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all notification
const getAllNotification = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      const userId = req.user;

      const user = await userModel.findOne({ _id: userId });

      const userLoginDate = user.createdAt;

      const notification = await notificationModel
        .find(
          { recipient: "User", createdAt: { $gte: userLoginDate } },
          { recipient: 0, recipient_user: 0, is_read: 0 }
        )
        .sort({ createdAt: -1 });

      if (!notification.length) {
        return res.json({
          data: {
            success: 0,
            message: "No notification found",
            notification,
            error: 1,
          },
        });
      }

      return res.json({
        data: {
          success: 1,
          message: "Notification found",
          notification,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all notification", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get all payment gateway
const getAllPaymentGateway = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch all payment gateway
      const paymentGatewayConfig = await paymentGatewayModel.findOne();

      if (!paymentGatewayConfig) {
        return res.json({
          data: {
            success: 0,
            message: "Payment Gateway Not Found",
            paymentGateway: {},
            error: 1,
          },
        });
      } else {
        // Payment gateway configuration found
        const paymentData = {
          stripe: {
            stripe_is_enable: paymentGatewayConfig.stripe_is_enable,
            stripe_mode: paymentGatewayConfig.stripe_mode,
            stripe_publishable_key:
              paymentGatewayConfig.stripe_mode === "testMode"
                ? paymentGatewayConfig.stripe_test_mode_publishable_key
                : paymentGatewayConfig.stripe_live_mode_publishable_key,
            stripe_secret_key:
              paymentGatewayConfig.stripe_mode === "testMode"
                ? paymentGatewayConfig.stripe_test_mode_secret_key
                : paymentGatewayConfig.stripe_live_mode_publishable_key,
          },
          razorpay: {
            razorpay_is_enable: paymentGatewayConfig.razorpay_is_enable,
            razorpay_mode: paymentGatewayConfig.razorpay_mode,
            razorpay_key_id:
              paymentGatewayConfig.razorpay_mode === "testMode"
                ? paymentGatewayConfig.razorpay_test_mode_key_id
                : paymentGatewayConfig.razorpay_live_mode_key_id,
            razorpay_key_secret:
              paymentGatewayConfig.razorpay_mode === "testMode"
                ? paymentGatewayConfig.razorpay_test_mode_key_secret
                : paymentGatewayConfig.razorpay_live_mode_key_secret,
          },
          paypal: {
            paypal_is_enable: paymentGatewayConfig.paypal_is_enable,
            paypal_mode: paymentGatewayConfig.paypal_mode,
            paypal_merchant_id:
              paymentGatewayConfig.paypal_mode === "testMode"
                ? paymentGatewayConfig.paypal_test_mode_merchant_id
                : paymentGatewayConfig.paypal_live_mode_merchant_id,
            paypal_tokenization_key:
              paymentGatewayConfig.paypal_mode === "testMode"
                ? paymentGatewayConfig.paypal_test_mode_tokenization_key
                : paymentGatewayConfig.paypal_live_mode_tokenization_key,
            paypal_public_key:
              paymentGatewayConfig.paypal_mode === "testMode"
                ? paymentGatewayConfig.paypal_test_mode_public_key
                : paymentGatewayConfig.paypal_live_mode_public_key,
            paypal_private_key:
              paymentGatewayConfig.paypal_mode === "testMode"
                ? paymentGatewayConfig.paypal_test_mode_private_key
                : paymentGatewayConfig.paypal_live_mode_private_key,
          },
        };

        return res.json({
          data: {
            success: 1,
            message: "Payment Gateway Found",
            paymentGateway: paymentData,
            error: 0,
          },
        });
      }
    });
  } catch (error) {
    console.log("Error during get all payment gateway", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occured", error: 1 },
    });
  }
};

// get private policy && terms and codsitions
const getPage = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // fetch page
      const page = await pageModel.findOne();

      if (!page) {
        return res.json({
          data: { success: 0, message: "Page Not Found", page, error: 1 },
        });
      } else {
        return res.json({
          data: { success: 1, message: "Page Found", page, error: 0 },
        });
      }
    });
  } catch (error) {
    console.log("Error during get page", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get currency
const getCurrency = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      const currencyTimezone = await currencyTimezoneModel.findOne();

      if (!currencyTimezone)
        return res.json({
          data: {
            success: 0,
            message: "Currency Not Found",
            currency: currencyTimezone,
            error: 1,
          },
        });

      return res.json({
        data: {
          success: 1,
          message: "Currency Found",
          currency: currencyTimezone,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get currency", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get otp
const getOtp = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const { email } = req.body;

      // Fetch OTP
      const otp = await otpModel.findOne({ email });

      if (!otp) {
        return res.json({
          data: { success: 0, message: "OTP not found", otp, error: 1 },
        });
      }

      return res.json({
        data: { success: 1, message: "OTP found", otp, error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during get otp", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// get forgot password otp
const getForgotPasswordOtp = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Extract data from the request body
      const { email } = req.body;

      // Fetch OTP
      const otp = await forgotPasswordOtpModel.findOne({ email });

      if (!otp) {
        return res.json({
          data: { success: 0, message: "OTP not found", otp, error: 1 },
        });
      }

      return res.json({
        data: { success: 1, message: "OTP found", otp, error: 0 },
      });
    });
  } catch (error) {
    console.log("Error during get forgot password otp", error.message);
    return res.json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};


const getAllNews = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      // Optional: simple pagination (defaults)
      const page = Math.max(parseInt(req.body.page ?? 1, 10), 1);
      const limit = Math.min(
        Math.max(parseInt(req.body.limit ?? 50, 10), 1),
        100
      );
      const skip = (page - 1) * limit;

      // Fetch only Published news, newest first
      const [items, total] = await Promise.all([
        newsModel
          .find(
            { status: "Publish" },
            { image: 1, title: 1, description: 1, publishedAt: 1, status: 1 }
          )
          .sort({ publishedAt: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        newsModel.countDocuments({ status: "Publish" }),
      ]);

      if (!items.length) {
        return res.json({
          data: {
            success: 0,
            message: "News Not Found",
            news: [],
            page,
            limit,
            total,
            error: 1,
          },
        });
      }

      // (Optional) trim overly long HTML to avoid huge payloads
      const trimmed = items.map((n) => ({
        ...n,
        description:
          typeof n.description === "string"
            ? n.description.slice(0, 20000) // keep rich HTML; just prevent absurdly large docs
            : n.description,
      }));

      return res.json({
        data: {
          success: 1,
          message: "News Found",
          news: trimmed,
          page,
          limit,
          total,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get all news", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

// GET NEWS BY ID (Published only)
const getNewsById = async (req, res) => {
  try {
    await verifyAccess(req, res, async () => {
      const { newsId } = req.body;

      if (!newsId) {
        return res.json({
          data: { success: 0, message: "newsId is required", error: 1 },
        });
      }

      const item = await newsModel
        .findOne(
          { _id: newsId, status: "Publish" },
          { image: 1, title: 1, description: 1, publishedAt: 1, status: 1 }
        )
        .lean();

      if (!item) {
        return res.json({
          data: {
            success: 0,
            message: "News Not Found",
            news: null,
            error: 1,
          },
        });
      }

      return res.json({
        data: {
          success: 1,
          message: "News Found",
          news: item,
          error: 0,
        },
      });
    });
  } catch (error) {
    console.log("Error during get news by id", error.message);
    return res.status(500).json({
      data: { success: 0, message: "An error occurred", error: 1 },
    });
  }
};

module.exports = {
  checkRegisterUser,
  signUp,
  verifyOTP,
  signIn,
  isVerifyAccount,
  resendOtp,
  forgotPassword,
  forgotPasswordOtpVerification,
  resetPassword,
  getUserDetails,
  uploadImage,
  editUserProfile,
  changePassword,
  deleteAccountUser,
  getAllIntro,
  getAllBanner,
  getAllCategory,
  mostPopulatedCampaign,
  comingToEndCampaign,
  getAllCampaign,
  getAllUpcomingCampaign,
  getAllEndedCampaign,
  addCampaign,
  getAllUserCampaign,
  deleteCampaign,
  donateAmount,
  getAllDonateHistory,
  addFavouriteCampaign,
  getAllFavouriteCampaign,
  deleteFavouriteCampaign,
  getAllNotification,
  getAllPaymentGateway,
  getPage,
  getCurrency,
  getOtp,
  getForgotPasswordOtp,
  testOTP,
  getAllNews,
  getNewsById,
};
