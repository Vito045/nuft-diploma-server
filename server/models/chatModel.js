const mongoose = require('mongoose');

const chatSchema = mongoose.Schema({
  name: {
    type: String,
    require: [true, 'Chat mush have a name'],
  },
  description: String,
  image: String,
  users: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],
  admin: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Admin must belong to the chat'],
  },
  messages: [
    {
      author: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: [true, 'Admin must belong to the chat'],
      },
      message: String,
      date: {
        type: Number,
        default: new Date().getTime(),
      },
    },
  ],
  privat: {
    type: Boolean,
    default: false,
  },
});

chatSchema.pre(/find/, function (next) {
  this.populate({
    path: 'users',
    select: '-chats -friends',
    model: 'User',
  })
    .populate({
      path: 'admin',
      select: '-chats -friends',
      model: 'User',
    })
    .populate({
      path: 'messages.author',
      select: '-chats -friends',
      model: 'User',
    });
  next();
});

// Duplicate the ID field.
chatSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// Ensure virtual fields are serialised.
chatSchema.set('toObject', { virtuals: true });
chatSchema.set('toJSON', { virtuals: true });

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;
