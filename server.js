const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let users = [{ id: "1", login: "Fortuna", password: "805", role: "admin", nickname: "Admin", level: 50, balance: 100000, crypto: 5000 }];

app.use(express.json());
app.use(express.static('.'));

app.post('/api/login', (req, res) => {
  const user = users.find(u => u.login === req.body.login && u.password === req.body.password);
  res.json(user ? { success: true, user: { id: user.id, nickname: user.nickname, balance: user.balance, crypto: user.crypto } } : { success: false });
});

app.post('/api/register', (req, res) => {
  if (users.find(u => u.login === req.body.login)) return res.json({ success: false });
  users.push({ id: String(users.length+1), ...req.body, role: "user", level: 1, balance: 500, crypto: 0 });
  res.json({ success: true });
});

io.on('connection', (s) => s.on('chat_message', (d) => io.emit('chat_message', d)));

server.listen(3000, () => console.log('✅ Сервер запущен'));
