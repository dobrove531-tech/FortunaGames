const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static('.'));

// ========== КОНФИГИ ==========
const LOTTERY_INTERVAL = 3600000;
const DAILY_REWARDS = [100, 200, 500, 1000, 2000, 3500, 5000];

// ========== БАЗА ДАННЫХ ==========
let users = [
  { 
    id: "1", login: "Fortuna", password: "805", role: "admin", 
    nickname: "Admin", avatar: "👑", frame: "🟣", level: 50, 
    prestige: 0, prestigeBonus: 0, xp: 0, balance: 100000, crypto: 5000,
    businesses: [], businessLevels: {}, inventory: [], 
    lastDaily: 0, dailyStreak: 0, lastStreakDate: 0,
    clickPower: 0.05, clickUpgradeCost: 100, totalClicks: 0,
    bankDeposit: 0, bankDepositTime: 0, bankRate: 5,
    achievements: [], quests: {}, lastQuestReset: 0,
    lotteryTickets: 0,
    stats: { totalEarned: 0, totalSpent: 0, lotteryWins: 0, giftsSent: 0 }
  }
];

let onlineUsers = new Map();
let cryptoRate = 100;
let lotteryPot = 5000;
let lastLotteryTime = Date.now();
let lotteryHistory = [];

let limitedItems = {
  crown: { name: "👑 Корона", price: 50000, currency: "coins", total: 10, sold: 0 },
  dragon_sword: { name: "🐉 Меч", price: 25000, currency: "coins", total: 15, sold: 0 },
  vip_kazakh: { name: "👑 VIPKazakh", price: 75000, currency: "coins", total: 3, sold: 0 }
};

let avatars = [
  { id: "default", name: "😀 Обычный", price: 0 },
  { id: "cool", name: "😎 Крутой", price: 5000 },
  { id: "rich", name: "🤑 Богатый", price: 15000 },
  { id: "cyber", name: "🤖 Кибер", price: 30000 }
];

let frames = [
  { id: "none", name: "Без рамки", price: 0 },
  { id: "bronze", name: "🥉 Бронза", price: 10000 },
  { id: "silver", name: "🥈 Серебро", price: 25000 },
  { id: "gold", name: "🥇 Золото", price: 50000 }
];

let achievements = [
  { id: "click_100", name: "Кликер", target: 100, reward: 1000 },
  { id: "click_1000", name: "Профи", target: 1000, reward: 5000 },
  { id: "balance_100k", name: "Миллионер", target: 100000, reward: 10000 },
  { id: "business_5", name: "Бизнесмен", target: 5, reward: 5000 },
  { id: "level_10", name: "Новичок", target: 10, reward: 2000 }
];

function saveData() {
  fs.writeFileSync('users.json', JSON.stringify(users));
  fs.writeFileSync('limited.json', JSON.stringify(limitedItems));
  fs.writeFileSync('lottery.json', JSON.stringify({ pot: lotteryPot, history: lotteryHistory }));
}

function loadData() {
  try {
    if (fs.existsSync('users.json')) users = JSON.parse(fs.readFileSync('users.json'));
    if (fs.existsSync('limited.json')) limitedItems = JSON.parse(fs.readFileSync('limited.json'));
    if (fs.existsSync('lottery.json')) {
      const data = JSON.parse(fs.readFileSync('lottery.json'));
      lotteryPot = data.pot;
      lotteryHistory = data.history;
    }
  } catch(e) {}
}
loadData();

function updateCryptoRate() {
  let change = (Math.random() - 0.48) * 15;
  cryptoRate = Math.max(25, Math.min(400, cryptoRate + change));
  cryptoRate = Math.round(cryptoRate);
}
setInterval(updateCryptoRate, 30000);

function runLottery() {
  let buyers = users.filter(u => u.lotteryTickets > 0);
  if (buyers.length === 0) return;
  let winner = buyers[Math.floor(Math.random() * buyers.length)];
  let winAmount = lotteryPot;
  winner.balance += winAmount;
  winner.stats.lotteryWins++;
  lotteryHistory.unshift({ winner: winner.nickname, amount: winAmount, time: new Date().toLocaleString() });
  lotteryPot = 2000;
  lastLotteryTime = Date.now();
  io.emit('lottery_result', { winner: winner.nickname, amount: winAmount });
  saveData();
}
setInterval(() => { if (Date.now() - lastLotteryTime >= LOTTERY_INTERVAL) runLottery(); }, 60000);

function checkAchievements(user) {
  let newAchs = [];
  for (let ach of achievements) {
    if (user.achievements.includes(ach.id)) continue;
    let done = false;
    if (ach.id === "click_100" && user.totalClicks >= 100) done = true;
    if (ach.id === "click_1000" && user.totalClicks >= 1000) done = true;
    if (ach.id === "balance_100k" && user.balance >= 100000) done = true;
    if (ach.id === "business_5" && user.businesses.length >= 5) done = true;
    if (ach.id === "level_10" && user.level >= 10) done = true;
    if (done) {
      user.achievements.push(ach.id);
      user.balance += ach.reward;
      newAchs.push(ach);
    }
  }
  return newAchs;
}

const businessesIncome = {
  kiosk: 15, car_wash: 40, barbershop: 60, it_company: 120,
  night_club: 200, crypto_farm: 350, taxi_park: 180,
  tech_factory: 600, media_hub: 1000, oil_rig: 1600,
  space_port: 2500, bank: 4000
};

setInterval(() => {
  for (let user of users) {
    let totalIncome = 0, totalCrypto = 0;
    let hasVip = user.inventory?.some(i => i.id === "vip_kazakh");
    let bonus = (hasVip ? 1.2 : 1) * (1 + user.prestigeBonus / 100);
    for (let biz of user.businesses) {
      let level = user.businessLevels?.[biz] || 1;
      totalIncome += (businessesIncome[biz] || 0) * level * bonus;
      if (biz === "crypto_farm" || biz === "space_port") totalCrypto += Math.floor(totalIncome / 25);
    }
    if (totalIncome > 0) {
      user.balance += Math.floor(totalIncome);
      user.crypto += totalCrypto;
      user.stats.totalEarned += totalIncome;
    }
    if (user.bankDeposit > 0 && user.bankDepositTime && Date.now() >= user.bankDepositTime) {
      let profit = Math.floor(user.bankDeposit * user.bankRate / 100);
      user.balance += profit;
      user.bankDeposit = 0;
      user.bankDepositTime = 0;
    }
  }
  saveData();
}, 60000);

// ========== API ==========
app.get('/api/crypto-rate', (req, res) => res.json({ rate: cryptoRate }));
app.get('/api/limited-stats', (req, res) => res.json(limitedItems));
app.get('/api/avatars', (req, res) => res.json({ avatars, frames }));

app.get('/api/top-players', (req, res) => {
  let byLevel = [...users].sort((a,b) => b.level - a.level).slice(0,10);
  let byBalance = [...users].sort((a,b) => b.balance - a.balance).slice(0,10);
  let byCrypto = [...users].sort((a,b) => b.crypto - a.crypto).slice(0,10);
  let byClicks = [...users].sort((a,b) => b.totalClicks - a.totalClicks).slice(0,10);
  res.json({ byLevel, byBalance, byCrypto, byClicks });
});

app.get('/api/lottery-info', (req, res) => {
  res.json({ pot: lotteryPot, history: lotteryHistory, nextIn: LOTTERY_INTERVAL - (Date.now() - lastLotteryTime) });
});

app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  const user = users.find(u => u.login === login && u.password === password);
  if (user) {
    res.json({ success: true, user: { 
      id: user.id, nickname: user.nickname, avatar: user.avatar, frame: user.frame,
      role: user.role, level: user.level, balance: user.balance, crypto: user.crypto,
      xp: user.xp, businesses: user.businesses, businessLevels: user.businessLevels,
      inventory: user.inventory, clickPower: user.clickPower, clickUpgradeCost: user.clickUpgradeCost,
      totalClicks: user.totalClicks, bankDeposit: user.bankDeposit, bankDepositTime: user.bankDepositTime,
      achievements: user.achievements, stats: user.stats,
      prestige: user.prestige, prestigeBonus: user.prestigeBonus
    } });
  } else res.json({ success: false });
});

app.get('/api/user/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (user) res.json({ ...user, onlineCount: onlineUsers.size });
  else res.status(404).json({ error: "Not found" });
});

app.post('/api/register', (req, res) => {
  const { login, password, nickname } = req.body;
  if (users.find(u => u.login === login)) return res.json({ success: false, message: "Логин занят" });
  users.push({
    id: String(users.length + 1), login, password, nickname,
    avatar: "😀", frame: "none", role: "user", level: 1, prestige: 0, prestigeBonus: 0,
    xp: 0, balance: 500, crypto: 0, businesses: [], businessLevels: {}, inventory: [],
    lastDaily: 0, dailyStreak: 0, lastStreakDate: 0, clickPower: 0.05, clickUpgradeCost: 100,
    totalClicks: 0, bankDeposit: 0, bankDepositTime: 0, bankRate: 5,
    achievements: [], quests: {}, lastQuestReset: Date.now(), lotteryTickets: 0,
    stats: { totalEarned: 0, totalSpent: 0, lotteryWins: 0, giftsSent: 0 }
  });
  saveData();
  res.json({ success: true });
});

app.post('/api/click', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  if (!user) return res.json({ success: false });
  let earnings = user.clickPower;
  user.balance += earnings;
  user.totalClicks++;
  user.stats.totalEarned += earnings;
  let newAchs = checkAchievements(user);
  saveData();
  res.json({ success: true, earnings, balance: user.balance, newAchievements: newAchs });
});

app.post('/api/upgrade-click', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  if (!user) return res.json({ success: false });
  if (user.balance >= user.clickUpgradeCost) {
    user.balance -= user.clickUpgradeCost;
    user.clickPower += 0.05;
    user.clickUpgradeCost = Math.floor(user.clickUpgradeCost * 1.5);
    saveData();
    res.json({ success: true, newPower: user.clickPower, newCost: user.clickUpgradeCost });
  } else res.json({ success: false, message: "Не хватает монет!" });
});

app.post('/api/daily', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  if (!user) return res.json({ success: false });
  let now = Date.now();
  let lastDate = new Date(user.lastDaily).toDateString();
  let today = new Date(now).toDateString();
  if (lastDate === today) return res.json({ success: false, message: "Уже сегодня!" });
  let streak = (new Date(user.lastStreakDate).toDateString() === new Date(now - 86400000).toDateString()) ? user.dailyStreak + 1 : 1;
  if (streak > 7) streak = 7;
  let reward = DAILY_REWARDS[streak - 1];
  user.balance += reward;
  user.xp += 50;
  user.dailyStreak = streak;
  user.lastDaily = now;
  user.lastStreakDate = now;
  while (user.xp >= user.level * 100) { user.xp -= user.level * 100; user.level++; user.balance += 500; }
  saveData();
  res.json({ success: true, reward, streak, newLevel: user.level });
});

app.post('/api/wheel', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  if (!user) return res.json({ success: false });
  let now = Date.now();
  if (user.lastWheel && now - user.lastWheel < 86400000) return res.json({ success: false, message: "Раз в день!" });
  let rewards = [
    { name: "50 монет", coins: 50, weight: 30 },
    { name: "100 монет", coins: 100, weight: 25 },
    { name: "200 монет", coins: 200, weight: 20 },
    { name: "500 монет", coins: 500, weight: 10 },
    { name: "5 крипты", crypto: 5, weight: 10 },
    { name: "10 крипты", crypto: 10, weight: 5 }
  ];
  let total = rewards.reduce((s,r)=>s+r.weight,0);
  let rand = Math.random() * total;
  let accum = 0, selected = rewards[0];
  for (let r of rewards) { accum += r.weight; if (rand <= accum) { selected = r; break; } }
  user.lastWheel = now;
  user.balance += selected.coins || 0;
  user.crypto += selected.crypto || 0;
  saveData();
  res.json({ success: true, reward: selected.name });
});

app.post('/api/buy-business', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  const bizId = req.body.businessId;
  const costs = { kiosk:300, car_wash:800, barbershop:1500, it_company:3000, night_club:6000, crypto_farm:12000, taxi_park:5000, tech_factory:28000, media_hub:50000, oil_rig:90000, space_port:180000, bank:400000 };
  const levels = { kiosk:1, car_wash:2, barbershop:3, it_company:4, night_club:5, crypto_farm:6, taxi_park:5, tech_factory:8, media_hub:10, oil_rig:12, space_port:15, bank:20 };
  if (!user) return res.json({ success: false });
  if (user.businesses.includes(bizId)) return res.json({ success: false, message: "Уже куплен" });
  if (user.level < levels[bizId]) return res.json({ success: false, message: "Низкий уровень" });
  if (user.balance >= costs[bizId]) {
    user.balance -= costs[bizId];
    user.businesses.push(bizId);
    user.businessLevels[bizId] = 1;
    user.stats.totalSpent += costs[bizId];
    checkAchievements(user);
    saveData();
    res.json({ success: true });
  } else res.json({ success: false, message: "Не хватает монет!" });
});

app.post('/api/upgrade-business', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  const bizId = req.body.businessId;
  const costs = { kiosk:300, car_wash:800, barbershop:1500, it_company:3000, night_club:6000, crypto_farm:12000, taxi_park:5000, tech_factory:28000, media_hub:50000, oil_rig:90000, space_port:180000, bank:400000 };
  if (!user || !user.businesses.includes(bizId)) return res.json({ success: false });
  let level = user.businessLevels[bizId] || 1;
  let cost = Math.floor(costs[bizId] * level * 0.4);
  if (user.balance >= cost) {
    user.balance -= cost;
    user.businessLevels[bizId] = level + 1;
    saveData();
    res.json({ success: true, newLevel: level + 1 });
  } else res.json({ success: false, message: "Не хватает монет!" });
});

app.post('/api/purchase-limited', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  const item = limitedItems[req.body.itemId];
  if (!user || !item || item.sold >= item.total) return res.json({ success: false });
  let balance = item.currency === "coins" ? user.balance : user.crypto;
  if (balance >= item.price) {
    if (item.currency === "coins") user.balance -= item.price;
    else user.crypto -= item.price;
    item.sold++;
    user.inventory.push({ id: req.body.itemId, name: item.name });
    saveData();
    res.json({ success: true, remaining: item.total - item.sold });
  } else res.json({ success: false });
});

app.post('/api/buy-avatar', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  const avatar = avatars.find(a => a.id === req.body.avatarId);
  if (!user || !avatar) return res.json({ success: false });
  if (user.balance >= avatar.price) {
    user.balance -= avatar.price;
    user.avatar = avatar.name;
    saveData();
    res.json({ success: true });
  } else res.json({ success: false });
});

app.post('/api/buy-frame', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  const frame = frames.find(f => f.id === req.body.frameId);
  if (!user || !frame) return res.json({ success: false });
  if (user.balance >= frame.price) {
    user.balance -= frame.price;
    user.frame = frame.name;
    saveData();
    res.json({ success: true });
  } else res.json({ success: false });
});

app.post('/api/deposit-bank', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  const amount = req.body.amount;
  if (!user || user.bankDeposit > 0) return res.json({ success: false, message: "Уже есть депозит" });
  if (user.balance >= amount && amount >= 1000) {
    user.balance -= amount;
    user.bankDeposit = amount;
    user.bankDepositTime = Date.now() + 86400000;
    saveData();
    res.json({ success: true, amount });
  } else res.json({ success: false });
});

app.post('/api/gift', (req, res) => {
  const from = users.find(u => u.id === req.body.fromId);
  const to = users.find(u => u.id === req.body.toId);
  const amount = req.body.amount;
  const type = req.body.type;
  if (!from || !to) return res.json({ success: false });
  let balance = type === "coins" ? from.balance : from.crypto;
  if (balance >= amount && amount >= 100) {
    if (type === "coins") { from.balance -= amount; to.balance += amount; }
    else { from.crypto -= amount; to.crypto += amount; }
    from.stats.giftsSent++;
    saveData();
    res.json({ success: true });
  } else res.json({ success: false });
});

app.post('/api/prestige', (req, res) => {
  const user = users.find(u => u.id === req.body.userId);
  if (!user || user.level < 100) return res.json({ success: false, message: "Нужен 100 уровень" });
  user.prestige++;
  user.prestigeBonus += 10;
  user.level = 1;
  user.xp = 0;
  user.businesses = [];
  user.businessLevels = {};
  user.clickPower = 0.05;
  user.clickUpgradeCost = 100;
  user.balance += 10000;
  user.crypto += 100;
  checkAchievements(user);
  saveData();
  res.json({ success: true, newPrestige: user.prestige, bonus: user.prestigeBonus });
});

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  socket.on('user_online', (userId) => {
    onlineUsers.set(socket.id, userId);
    io.emit('online_list', Array.from(onlineUsers.values()).map(id => users.find(u=>u.id===id)?.nickname));
  });
  socket.on('chat_message', (data) => io.emit('chat_message', data));
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    io.emit('online_list', Array.from(onlineUsers.values()).map(id => users.find(u=>u.id===id)?.nickname));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Сервер Fortuna Game запущен на порту ${PORT}`);
  console.log(`👑 Админ: Fortuna / 805`);
});
