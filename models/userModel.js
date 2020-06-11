// const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please tell us your name'],
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  image: {
    type: String,
    // required: [true, 'Please provide your phone number'],
    // unique: true,
  },
  chats: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'Chat',
    },
  ],
  online: {
    isOnline: {
      type: Boolean,
      default: true,
    },
    lastOnline: {
      type: Number,
      default: new Date().getTime(),
    },
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false,
  },
  friends: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],
  // passwordConfirm: {
  //   type: String,
  //   required: true,
  //   validate: {
  //     // This only works on .save
  //     validator: function(el) {
  //       return el === this.password;
  //     },
  //     message: 'Paswords are not the same'
  //   }
  // },
  // passwordCHangedAt: Date,
  // passwordResetToken: String,
  // passwordResetExpires: Date,
  // active: {
  //   type: Boolean,
  //   default: true,
  //   select: false
  // }
});

userSchema.pre(/find/, function (next) {
  this.populate({
    path: 'chats',
    // select: 'name',
    model: 'Chat',
  });
  this.populate({
    path: 'friends',
    select: '-chats -friends',
    model: 'User',
  });
  next();
});

// userSchema.method('toClient', function() {
//   var obj = this.toObject();

//   //Rename fields
//   obj.id = obj._id;
//   // delete obj._id;

//   return obj;
// });

// Duplicate the ID field.
userSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Ensure virtual fields are serialised.
userSchema.set('toObject', { virtuals: true });
userSchema.set('toJSON', { virtuals: true });

// userSchema.pre('save', async function(next) {
//   // Only ran this function if password was actually modiffied
//   if (!this.isModified('password')) return next();

//   // Hash the password with ost of 12
//   this.password = await bcrypt.hash(this.password, 12);

//   // Delete passwordConfirm
//   this.passwordConfirm = undefined;
//   next();
// });

userSchema.pre('save', async function (next) {
  const user = this;

  if (user.isModified('password'))
    user.password = await bcrypt.hash(user.password, 8);

  user.id = user._id;

  next();
});

// userSchema.pre('save', function(next) {
//   if (!this.isModified('password') || this.isNew) return next();

//   this.passwordChangedAt = Date.now() - 1000;
//   next();
// });

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// userSchema.methods.changedPasswordAfter = function(JWTTimestampt) {
//   if (this.passwordChangedAt) {
//     const changedTimestamp = parseInt(
//       this.passwordChangedAt.getTime() / 1000,
//       10
//     );

//     return JWTTimestampt < changedTimestamp;
//   }

//   return false;
// };

// userSchema.methods.createPasswordResetToken = function() {
//   const resetToken = crypto.randomBytes(32).toString('hex');

//   this.passwordResetToken = crypto
//     .createHash('sha256')
//     .update(resetToken)
//     .digest('hex');

//   this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

//   return resetToken;
// };

// userSchema.pre(/^find/, function(next) {
//   // this points to the current query
//   this.find({ active: true });
//   next();
// });

const User = mongoose.model('User', userSchema);

module.exports = User;
