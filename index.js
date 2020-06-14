const express = require('express');
const http = require('http');
const app = require('./app');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const soketio = require('socket.io');
require('./db/mongoose');
const mongodb = require('mongodb');
const cookieparser = require('cookieparser');
const fs = require('fs');
const path = require('path');
const rimraf = require('rimraf');

// const INDEX = '/index.html';

const { ObjectID } = mongodb;

const User = require('./models/userModel');
const Chat = require('./models/chatModel');

// const port = process.env.PORT || 3001;
const PORT = process.env.PORT || 3001;
// const PORT = 3001;
// const PORT = 3001;
const INDEX = 'index.html';

// const server = http.createServer(app);
const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));
const io = soketio(server);

const sockets = {};

io.use(async (socket, next) => {
  if (!socket.handshake.query) return next();
  // var cookies = cookieparser.parse(socket.handshake.query);
  var cookies = socket.handshake.query;
  if (cookies.token) {
    const { token } = cookies;
    const verify = jwt.decode(token);
    if (!verify) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded._id);
    // .then((res) => console.log(res))
    // .catch((ar) => console.log(ar));
    // .then((user) => {
    //   if (!user) return false;
    //   user.chats.forEach((chat) => socket.join(chat.id));
    //   socket.userId = user;
    // });
    if (!user) return next();
    user.chats.forEach((chat) => socket.join(chat.id));
    socket.userId = user.id;
    // console.log(socket.userId);
    sockets[socket.userId] = socket.id;
  }
  next();
});

// io.ori
// io.set('origins', 'http://yourdomain.com:80');
// io.origins('http://127.0.0.1:3000');

// app.use(
//   cors({
//     origin: [
//       'http://127.0.0.1:3000',
//       'http://127.0.0.1:3001',
//       'http://127.0.0.1:3002',
//       'http://localhost:3000',
//       'http://localhost:3001',
//       'http://localhost:3002',
//     ],
//     credentials: true,
//   })
// );

// app.options('*', cors());

io.on('connection', async (socket) => {
  console.log('New WebSocket connection');

  socket.on('authorization', async (token, callback) => {
    try {
      // if (!token) return socket.emit('start');
      const verify = jwt.decode(token);
      if (!verify) return callback();
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findOne({
        _id: decoded._id,
        // 'tokens.token': token,
      });
      if (!user) return callback();
      // if (!user) {
      //   socket.emit('start');
      //   return console.log(e);
      // }
      const dateToSet = new Date();
      const UTCS = dateToSet.toUTCString();

      user.online = {
        isOnline: true,
        lastOnline: new Date(UTCS).getTime(),
      };
      // user.isOnline = true;
      await user.save();
      user.chats.forEach((chat) => socket.join(chat.id));
      // socket.id = user._id;
      callback(token, user);

      user.chats.forEach((chat) =>
        socket.to(chat._id).emit('updateUserInChat', { chatId: chat._id, user })
      );
      sockets[socket.userId] = socket.id;
    } catch (err) {
      console.log(err, 101);
      callback();
    }
  });

  socket.on('register', async (data, callback) => {
    // socket.emit('loading');
    try {
      const dateToSet = new Date();
      const UTCS = dateToSet.toUTCString();
      // { name, email, password }
      const user = await User.create({
        ...data,
        online: {
          isOnline: true,
          lastOnline: new Date(UTCS).getTime(),
        },
      });
      if (!user) return false;
      const token = jwt.sign(
        { _id: user._id.toString() },
        process.env.JWT_SECRET
      );
      delete user.password;
      // console.log(user, token);
      // user.tokens = user.tokens.concat({ token });
      // await user.save();
      // socket._id = user._id;
      callback({ user, token });
    } catch (err) {
      console.log(err, 101);
    }
    // socket.emit('loading');
  });
  // uoiweurowerueworiu@3uoeriurowrqw.coadmasdasd
  socket.on('login', async ({ email, password }, callback) => {
    // socket.emit('loading');
    try {
      const u = await User.findOne({ email }, 'password');
      if (!u) return false;
      // console.log(u);
      if (!u) return callback('Unable to login');
      const isMatch = await u.correctPassword(password, u.password);
      if (!isMatch) return callback('Password is invalid');
      const token = jwt.sign({ _id: u._id.toString() }, process.env.JWT_SECRET);
      const user = await User.findById(u.id);
      if (!user) return false;

      const dateToSet = new Date();
      const UTCS = dateToSet.toUTCString();

      user.online = {
        isOnline: true,
        lastOnline: new Date(UTCS).getTime(),
      };
      // user.tokens = user.tokens.concat({ token });
      // user.online = new Date().getTime();
      // user.isOnline = true;
      await user.save();
      socket._id = user._id;
      callback({ user, token });

      user.chats.forEach((chat) =>
        socket.to(chat._id).emit('updateUserInChat', { chatId: chat._id, user })
      );
    } catch (err) {
      console.log(err, 101);
    }
    // socket.emit('loading');
  });

  socket.on('logout', async (token, callback) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({
      _id: decoded._id,
      'tokens.token': token,
    });
    // if (!user) console.log(e);
    // user.tokens = user.tokens.filter((elem) => elem.token !== token);
    // await user.save();
  });

  socket.on('addNewChat', async ({ data, adminId }, callback) => {
    try {
      const chatData = { ...data };
      delete chatData.image;

      const chat = await Chat.create({
        ...chatData,
        admin: adminId,
        users: [adminId],
      });

      const image = data.image;
      if (image) {
        const base64dataImage = image.base64.replace(
          /^data:image\/png;base64,|^data:image\/jpg;base64,|^data:image\/jpeg;base64,/,
          ''
        );
        await fs.mkdir(
          path.join(__dirname, `/public/img/chats/${chat._id}`),
          (err, data) => {
            if (err) console.log(err);
            else
              fs.writeFile(
                path.join(
                  __dirname,
                  `/public/img/chats/${chat._id}/${image.name}`
                ),
                base64dataImage,
                // file.base64,
                'base64',
                function (err, data) {
                  if (err) return console.log(err);
                  if (data) return console.log(data);
                }
              );
          }
        );
        chat.image = image.name;
        await chat.save();
      }

      await User.findByIdAndUpdate(adminId, {
        $push: {
          chats: chat._id,
        },
      });
      socket.join(chat.id);
      // callback(chat);

      const c = await Chat.findById(chat._id);
      socket.emit('addChat', c);
    } catch (err) {
      console.log(err, 101);
    }
  });

  socket.on('newMessage', async ({ authorId, chatId, message }) => {
    try {
      const chat = await Chat.findByIdAndUpdate(
        chatId,
        {
          $push: {
            messages: {
              author: authorId,
              message,
            },
          },
        },
        { new: true }
      );
      // socket.disconnect();
      // io.connect();

      io.in(chat.id).emit('addMessage', {
        // io.in(chat.id).emit('addMessage', {
        // io.emit('addMessage', {
        chatId: chat._id,
        message: chat.messages[chat.messages.length - 1],
      });
      // callback({
      //   // io.emit('addMessage', {
      //   chatId: chat._id,
      //   message: chat.messages[chat.messages.length - 1],
      // });
    } catch (err) {
      console.log(err, 101);
    }
  });

  socket.on('clearHistory', async (chatId, callback) => {
    const chat = await Chat.findByIdAndUpdate(
      chatId,
      { messages: [] },
      { new: true }
    );

    io.to(chat.id).emit('addMessage', {
      // io.emit('addMessage', {
      chatId: chat._id,
      message: chat.messages[chat.messages.length - 1],
    });
  });

  socket.on('leaveChat', async (chatId) => {
    try {
      const user = await User.findById(socket.userId);
      user.chats = user.chats.filter((chat) => chat.id !== chatId);
      await user.save();
      const chat = await Chat.findById(chatId);
      chat.users = chat.users.filter((u) => u.id !== user.id);
      await chat.save();
      socket.emit('youLeftChat', chatId);
      socket.to(chat._id).emit('userLeftChat', { chatId: chat._id, user });
    } catch (err) {
      console.log(err, 101);
    }
  });

  socket.on('findChats', async (search, callback) => {
    try {
      const chats = await Chat.find({
        name: {
          $regex: search,
          $options: 'imxs',
        },
        users: {
          $ne: socket.userId,
        },
        privat: false,
      });
      // console.log(await Chat.find());
      callback(chats);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('joinChanel', async (chatId, callback) => {
    try {
      const chat = await Chat.findByIdAndUpdate(
        chatId,
        {
          $push: {
            users: socket.userId,
          },
        },
        { new: true }
      );
      const user = await User.findByIdAndUpdate(
        socket.userId,
        {
          $push: {
            chats: chat._id,
          },
        },
        { new: true }
      );
      // console.log(chat, user);
      socket.join(chat.id);
      callback(chat);
      socket.to(chat._id).emit('userJoinedChat', { chatId: chat._id, user });
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('kickUser', async ({ chatId, userId }) => {
    const chat = await Chat.findById(chatId);
    chat.users = chat.users.filter(
      (user) => user._id.toString() !== userId.toString()
    );
    await chat.save();
    const user = await User.findById(userId);
    user.chats = user.chats.filter(
      (c) => c._id.toString() !== chat._id.toString()
    );
    await user.save();

    io.to(chat._id).emit('userLeftChat', {
      chatId: chat._id,
      user,
    });
  });

  socket.on('updateChat', async ({ data, chatId }, callback) => {
    try {
      const chatData = { ...data };
      delete chatData.image;

      const chat = await Chat.findByIdAndUpdate(chatId, chatData, {
        new: true,
      });

      const image = data.image;
      if (image) {
        await rimraf(
          path.join(`/public/img/chats/${chat._id}`),
          async function () {
            console.log('done');

            const base64dataImage = image.base64.replace(
              /^data:image\/png;base64,|^data:image\/jpg;base64,|^data:image\/jpeg;base64,/,
              ''
            );
            await fs.mkdir(
              path.join(__dirname, `/public/img/chats/${chat._id}`),
              (err, data) => {
                if (err) console.log(err);
                else
                  fs.writeFile(
                    path.join(
                      __dirname,
                      `/public/img/chats/${chat._id}/${image.name}`
                    ),
                    base64dataImage,
                    // file.base64,
                    'base64',
                    function (err, data) {
                      if (err) return console.log(err);
                      if (data) return console.log(data);
                    }
                  );
              }
            );
            chat.image = image.name;
            await chat.save();
          }
        );
      }

      io.to(chat._id).emit('updateChat', chat);
      callback();
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('addFriend', async ({ friendId }) => {
    try {
      const user = await User.findByIdAndUpdate(
        socket.userId,
        {
          $push: {
            friends: friendId,
          },
        },
        { new: true }
      );

      socket.emit('updateFriends', user.friends);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('removeFriend', async ({ friendId }) => {
    try {
      const user = await User.findById(socket.userId);
      user.friends = user.friends.filter(
        (friend) => friend._id.toString() !== friendId.toString()
      );
      user.save();

      socket.emit('updateFriends', user.friends);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('addNewChatWithFriend', async ({ data, adminId, friendId }) => {
    try {
      const chatData = { ...data };
      delete chatData.image;

      const chat = await Chat.create({
        ...chatData,
        admin: adminId,
        users: [adminId, friendId],
      });

      const image = data.image;
      if (image) {
        const base64dataImage = image.base64.replace(
          /^data:image\/png;base64,|^data:image\/jpg;base64,|^data:image\/jpeg;base64,/,
          ''
        );
        await fs.mkdir(
          path.join(__dirname, `/public/img/chats/${chat._id}`),
          (err, data) => {
            if (err) console.log(err);
            else
              fs.writeFile(
                path.join(
                  __dirname,
                  `/public/img/chats/${chat._id}/${image.name}`
                ),
                base64dataImage,
                // file.base64,
                'base64',
                function (err, data) {
                  if (err) return console.log(err);
                  if (data) return console.log(data);
                }
              );
          }
        );
        chat.image = image.name;
        await chat.save();
      }

      await User.findByIdAndUpdate(adminId, {
        $push: {
          chats: chat._id,
        },
      });

      await User.findByIdAndUpdate(friendId, {
        $push: {
          chats: chat._id,
        },
      });

      socket.join(chat.id);

      const c = await Chat.findById(chat._id);
      io.to(chat._id).emit('addChat', c);
      if (sockets[friendId]) socket.to(sockets[friendId]).emit('addChat', c);
    } catch (err) {
      console.log(err, 101);
    }
  });

  socket.on('updateUser', async (data, callback) => {
    try {
      const userData = { ...data };
      delete userData.image;

      const user = await User.findByIdAndUpdate(socket.userId, userData, {
        new: true,
      });
      if (!user) return false;

      const image = data.image;
      if (image) {
        await rimraf(
          path.join(`/public/img/users/${user._id}`),
          async function () {
            console.log('done');

            const base64dataImage = image.base64.replace(
              /^data:image\/png;base64,|^data:image\/jpg;base64,|^data:image\/jpeg;base64,/,
              ''
            );
            await fs.mkdir(
              path.join(__dirname, `/public/img/users/${user._id}`),
              (err, data) => {
                if (err) console.log(err);
                else
                  fs.writeFile(
                    path.join(
                      __dirname,
                      `/public/img/users/${user._id}/${image.name}`
                    ),
                    base64dataImage,
                    // file.base64,
                    'base64',
                    function (err, data) {
                      if (err) return console.log(err);
                      if (data) return console.log(data);
                    }
                  );
              }
            );
            user.image = image.name;
            await user.save();
          }
        );
      }

      // user.chats.forEach(chat => socket.to(chat._id).emit('updateUserInChat', { chatId: chat._id, user });)
      callback(user);
    } catch (err) {
      console.log(err);
    }
  });

  socket.on('disconnect', async () => {
    const user = await User.findById(socket.userId);
    if (!user) return false;
    const dateToSet = new Date();
    const UTCS = dateToSet.toUTCString();
    user.online = {
      isOnline: false,
      lastOnline: new Date(UTCS).getTime(),
    };
    user.save();
    user.chats.forEach((chat) =>
      socket.to(chat._id).emit('updateUserInChat', { chatId: chat._id, user })
    );
  });
  delete sockets[socket.userId];
});

// server.listen(port, () => console.log('Server is up on port', port));
