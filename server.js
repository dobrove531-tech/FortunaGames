const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static('.'));

// ========== БАЗА ДАННЫХ ==========
let users = [
  { 
    id: "1", login: "Fortuna", password: "805", role: "admin", 
    nickname: "Admin", level: 50, xp: 0, balance: 100000, crypto: 5000,
    businesses: [], businessLevels: {}, inventory: [], 
    lastDaily: 0, lastWheel: 0
  }
];

let onlineUsers = new Map();
let cryptoRate = 100;

// Лимитированные предметы
let limitedItems = {
  crown: { name: "👑 Корона фортуны", price: 50000, currency: "coins", total: 10, sold: 0 },
  dragon_sword: { name: "🐉 Драконий меч", price: 25000, currency: "coins", total: 15, sold: 0 },
  crypto_card: { name: "💎 Крипто-карта", price: 500, currency: "crypto", total: 20, sold: 0 },
  vip_kazakh: { name: "👑 VIPKazakh", price: 75000, currency: "coins", total: 3, sold: 0 }
};

// Загрузка сохранённых лимиток
try {
  if (fs.existsSync('limited.json')) {
    const saved = JSON.parse(fs.readFileSync('limited.json'));
    limitedItems = saved;
  }
} catch(e) {}

function saveLimited() {
  fs.writeFileSync('limited.json', JSON.stringify(limitedItems));
}

// Обновление курса крипты
function updateCryptoRate() {
  let change = (Math.random() - 0.48) * 12;
  cryptoRate = Math.max(30, Math.min(300, cryptoRate + change));
  cryptoRate = Math.round(cryptoRate);
}
setInterval(updateCryptoRate, 30000);

// ========== API ==========

// Получить курс крипты
app.get('/api/crypto-rate', (req, res) => {
  res.json({ rate: cryptoRate });
});

// Получить статистику лимиток
app.get('/api/limited-stats', (req, res) => {
  res.json(limitedItems);
});

// Логин
app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  const user = users.find(u => u.login === login && u.password === password);
  if (user) {
    res.json({ 
      success: true, 
      user: { 
        id: user.id, nickname: user.nickname, role: user.role, 
        level: user.level, balance: user.balance, crypto: user.crypto,
        xp: user.xp, businesses: user.businesses, businessLevels: user.businessLevels,
        inventory: user.inventory, lastDaily: user.lastDaily, lastWheel: user.lastWheel
      } 
    });
  } else {
    res.json({ success: false });
  }
});

// Получить данные пользователя
app.get('/api/user/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (user) {
    res.json({ 
      ...user, 
      onlineCount: onlineUsers.size
    });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

// Регистрация
app.post('/api/register', (req, res) => {
  const { login, password, nickname } = req.body;
  if (users.find(u => u.login === login)) {
    res.json({ success: false, message: "Логин занят" });
    return;
  }
  const newUser = {
    id: String(users.length + 1), login, password, nickname,
    role: "user", level: 1, xp: 0, balance: 500, crypto: 0,
    businesses: [], businessLevels: {}, inventory: [],
    lastDaily: 0, lastWheel: 0
  };
  users.push(newUser);
  res.json({ success: true });
});

// Колесо Фортуны
app.post('/api/wheel', (req, res) => {
  const { userId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ success: false, message: "Пользователь не найден" });
  
  const now = Date.now();
  if (user.lastWheel && now - user.lastWheel < 86400000) {
    return res.json({ success: false, message: "Колесо доступно раз в день!" });
  }
  
  const rewards = [
    { name: "50 монет", coins: 50, weight: 30 },
    { name: "100 монет", coins: 100, weight: 25 },
    { name: "200 монет", coins: 200, weight: 20 },
    { name: "500 монет", coins: 500, weight: 10 },
    { name: "5 крипты", crypto: 5, weight: 8 },
    { name: "10 крипты", crypto: 10, weight: 5 },
    { name: "1000 монет", coins: 1000, weight: 2 }
  ];
  
  let totalWeight = rewards.reduce((s, r) => s + r.weight, 0);
  let random = Math.random() * totalWeight;
  let accum = 0;
  let selected = rewards[0];
  for (let r of rewards) {
    accum += r.weight;
    if (random <= accum) { selected = r; break; }
  }
  
  user.lastWheel = now;
  user.balance += selected.coins || 0;
  user.crypto += selected.crypto || 0;
  
  res.json({ success: true, reward: selected.name });
});

// Ежедневное задание
app.post('/api/daily', (req, res) => {
  const { userId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ success: false });
  
  const now = Date.now();
  if (user.lastDaily && now - user.lastDaily < 86400000) {
    return res.json({ success: false, message: "Уже выполнено сегодня!" });
  }
  
  user.lastDaily = now;
  user.xp += 50;
  user.balance += 200;
  
  while (user.xp >= user.level * 100) {
    user.xp -= user.level * 100;
    user.level++;
    user.balance += 500;
  }
  
  res.json({ success: true });
});

// Купить бизнес
app.post('/api/buy-business', (req, res) => {
  const { userId, businessId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ success: false, message: "Пользователь не найден" });
  
  const bizCosts = {
    kiosk: 300, car_wash: 800, barbershop: 1500, it_company: 3000,
    night_club: 6000, crypto_farm: 12000, taxi_park: 5000,
    tech_factory: 28000, media_hub: 50000, oil_rig: 90000,
    space_port: 180000, bank: 400000
  };
  
  const bizLevels = {
    kiosk: 1, car_wash: 2, barbershop: 3, it_company: 4,
    night_club: 5, crypto_farm: 6, taxi_park: 5,
    tech_factory: 8, media_hub: 10, oil_rig: 12,
    space_port: 15, bank: 20
  };
  
  const cost = bizCosts[businessId];
  const requiredLevel = bizLevels[businessId];
  
  if (!cost) return res.json({ success: false, message: "Бизнес не найден" });
  if (user.businesses.includes(businessId)) {
    return res.json({ success: false, message: "Бизнес уже куплен" });
  }
  if (user.level < requiredLevel) {
    return res.json({ success: false, message: `Нужен ${requiredLevel} уровень!` });
  }
  if (user.balance >= cost) {
    user.balance -= cost;
    user.businesses.push(businessId);
    if (!user.businessLevels) user.businessLevels = {};
    user.businessLevels[businessId] = 1;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: `Недостаточно монет! Нужно ${cost}` });
  }
});

// Апгрейд бизнеса
app.post('/api/upgrade-business', (req, res) => {
  const { userId, businessId } = req.body;
  const user = users.find(u => u.id === userId);
  if (!user) return res.json({ success: false, message: "Пользователь не найден" });
  
  if (!user.businesses.includes(businessId)) {
    return res.json({ success: false, message: "Бизнес не куплен" });
  }
  
  const bizCosts = {
    kiosk: 300, car_wash: 800, barbershop: 1500, it_company: 3000,
    night_club: 6000, crypto_farm: 12000, taxi_park: 5000,
    tech_factory: 28000, media_hub: 50000, oil_rig: 90000,
    space_port: 180000, bank: 400000
  };
  
  const currentLevel = user.businessLevels?.[businessId] || 1;
  const upgradeCost = Math.floor(bizCosts[businessId] * currentLevel * 0.4);
  
  if (user.balance >= upgradeCost) {
    user.balance -= upgradeCost;
    if (!user.businessLevels) user.businessLevels = {};
    user.businessLevels[businessId] = currentLevel + 1;
    res.json({ success: true, level: currentLevel + 1 });
  } else {
    res.json({ success: false, message: `Недостаточно монет! Нужно ${upgradeCost}` });
  }
});

// Купить лимитированный предмет
app.post('/api/purchase-limited', (req, res) => {
  const { userId, itemId } = req.body;
  const user = users.find(u => u.id === userId);
  const item = limitedItems[itemId];
  
  if (!user) return res.json({ success: false, message: "Пользователь не найден" });
  if (!item) return res.json({ success: false, message: "Предмет не найден" });
  if (item.sold >= item.total) return res.json({ success: false, message: "Предмет закончился!" });
  
  const balance = item.currency === "coins" ? user.balance : user.crypto;
  if (balance >= item.price) {
    if (item.currency === "coins") user.balance -= item.price;
    else user.crypto -= item.price;
    
    item.sold++;
    saveLimited();
    
    if (!user.inventory) user.inventory = [];
    user.inventory.push({ id: itemId, name: item.name, type: "limited" });
    
    res.json({ success: true, remaining: item.total - item.sold, total: item.total, itemName: item.name });
  } else {
    res.json({ success: false, message: "Недостаточно средств!" });
  }
});

// Админ: выдать уровень
app.post('/api/admin/set-level', (req, res) => {
  const { adminId, userId, level } = req.body;
  const admin = users.find(u => u.id === adminId);
  const user = users.find(u => u.id === userId);
  
  if (!admin || admin.role !== "admin") {
    return res.json({ success: false, message: "Нет прав" });
  }
  if (!user) return res.json({ success: false, message: "Пользователь не найден" });
  
  user.level = parseInt(level);
  user.xp = 0;
  res.json({ success: true, message: `Уровень изменен на ${level}` });
});

// Админ: выдать монеты
app.post('/api/admin/give-coins', (req, res) => {
  const { adminId, userId, amount } = req.body;
  const admin = users.find(u => u.id === adminId);
  const user = users.find(u => u.id === userId);
  
  if (!admin || admin.role !== "admin") {
    return res.json({ success: false, message: "Нет прав" });
  }
  if (!user) return res.json({ success: false, message: "Пользователь не найден" });
  
  user.balance += parseInt(amount);
  res.json({ success: true, message: `Выдано ${amount} монет` });
});

// ========== ПАССИВНЫЙ ДОХОД ==========
const businessesIncome = {
  kiosk: 15, car_wash: 40, barbershop: 60, it_company: 120,
  night_club: 200, crypto_farm: 350, taxi_park: 180,
  tech_factory: 600, media_hub: 1000, oil_rig: 1600,
  space_port: 2500, bank: 4000
};

setInterval(() => {
  for (let user of users) {
    let totalIncome = 0;
    let totalCrypto = 0;
    
    // Проверка на VIPKazakh
    const hasVip = user.inventory?.some(i => i.id === "vip_kazakh") || false;
    const bonus = hasVip ? 1.2 : 1;
    
    for (let biz of user.businesses) {
      const level = user.businessLevels?.[biz] || 1;
      const income = (businessesIncome[biz] || 0) * level * bonus;
      totalIncome += income;
      if (biz === "crypto_farm" || biz === "space_port") {
        totalCrypto += Math.floor(income / 25);
      }
    }
    
    if (totalIncome > 0) {
      user.balance += Math.floor(totalIncome);
      if (totalCrypto > 0) user.crypto += totalCrypto;
      console.log(`💰 ${user.nickname}: +${Math.floor(totalIncome)} монет, +${totalCrypto} крипты`);
    }
  }
}, 60000);

// ========== SOCKET.IO ==========
io.on('connection', (socket) => {
  console.log('👤 Игрок подключился');
  
  socket.on('user_online', (userId) => {
    onlineUsers.set(socket.id, userId);
    const nicknames = Array.from(onlineUsers.values()).map(id => {
      const u = users.find(u => u.id === id);
      return u ? u.nickname : id;
    });
    io.emit('online_list', nicknames);
  });
  
  socket.on('chat_message', (data) => {
    io.emit('chat_message', data);
  });
  
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    const nicknames = Array.from(onlineUsers.values()).map(id => {
      const u = users.find(u => u.id === id);
      return u ? u.nickname : id;
    });
    io.emit('online_list', nicknames);
  });
});

// ========== ЗАПУСК ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Сервер Fortuna Game запущен!`);
  console.log(`🔗 Порт: ${PORT}`);
  console.log(`👑 Админ: Fortuna / 805`);
  console.log(`💎 Курс крипты: ${cryptoRate} монет за 1 FCR\n`);
});
