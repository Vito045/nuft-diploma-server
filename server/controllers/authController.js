const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

// const url = `${req.protocol}://${req.get('host')}/me`;
// console.log(url);
// await new Email(user, url).sendWelcome();

const signToken = id => {
  return jwt.sign(
    {
      id
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN
    }
  );
};

const createSendToken = (user, statusCode, res, req) => {
  const token = signToken(user._id);

  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  });

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

exports.signup = catchAsync(async (req, res, next) => {
  const user = await User.create(req.body);
  createSendToken(user, 201, res, req);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // 2) Check if user && password is correct
  const user = await User.findOne({
    email
  }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  // 3) If everything is ok, send token to client
  createSendToken(user, 200, res, req);
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    status: 'success'
  });
};

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and of it's these

  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token)
    return next(
      new AppError('You are not logged in. Please log in to get access', 401)
    );
  // 2) Varification token
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser)
    return next(
      new AppError(
        'The user belonging to this token does no longer exist.',
        401
      )
    );

  // 4) Check if user changed password after the token was issued)
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password. Please login again', 401)
    );
  }

  // Grant access to protected route
  req.user = currentUser;
  res.locals.user = currentUser;
  next();
});

exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET
      );

      const currentUser = await User.findById(decoded.id);
      if (!currentUser) return next();

      if (currentUser.changedPasswordAfter(decoded.iat)) return next();

      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

// exports.isLoggedIn = catchAsync(async (req, res, next) => {
//   if (req.cookies.jst) {
//     const decoded = await promisify(jwt.verify)(
//       req.cookies.jst,
//       process.env.JWT_SECRET
//     );

//     const currentUser = await User.findById(decoded.id);
//     if (!currentUser) return next();

//     if (currentUser.changedPasswordAfter(decoded.iat)) return next();

//     res.locals.user = currentUser;
//     next();
//   }
//   next();
// });

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return next(
      new AppError('Your do not have permission to perform this action', 403)
    );
  next();
};

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTed email
  const user = await User.findOne({
    email: req.body.email
  });
  if (!user) next(new AppError('There is no user with email address', 404));

  // 2) Generate the random token
  const resetToken = user.createPasswordResetToken();
  await user.save({
    validateBeforeSave: false
  });

  // 3) Send it to user's email
  const resetURL = `${req.protocol}://${req.get(
    'host'
  )}/api/v1/users/resetPassword/${resetToken}`;

  try {
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token send to email'
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({
      validateBeforeSave: false
    });
    return next(
      new AppError('There was an error sending email. Try again later.', 500)
    );
  }

  res.status(200).json({
    status: 'success',
    message: 'Token send to email'
  });
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: {
      $gt: Date.now()
    }
  });
  // 2) If token has no expired, and there is user, set the new password
  if (!user) next(new AppError('Token is invalid or has expired', 400));

  user.password = req.body.password;
  user.passwordConfirm = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  // 3) Update changePasswordAt property for the user
  // 4) Log the user in, and JWT

  createSendToken(user, 200, res, req);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from the collection
  const user = await User.findById(req.user._id).select('+password');

  // 2) Check if POSTed password is correct
  if (!(await user.correctPassword(req.body.passwordCurrent, user.password)))
    next(new AppError('Your currect password is wrong', 401));

  // 3) If so, update password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  // 4) Log user in, send JWT
  createSendToken(user, 200, res, req);
});
