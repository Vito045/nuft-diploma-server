const mongoose = require('mongoose');

mongoose.connect(
  // 'mongodb://user:qwerty123@ds247430.mlab.com:47430/heroku_vhqk33lj',
  'mongodb+srv://username:qwerty123@cluster0-2qphc.mongodb.net/taskapp?retryWrites=true&w=majority',
  {
    useNewUrlParser: true,
    useCreateIndex: true,
    useFindAndModify: false,
    useUnifiedTopology: true,
  }
);
