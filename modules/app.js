const tg = window.Telegram.WebApp;
tg.expand();

const API_URL = 'https://script.google.com/macros/s/AKfycbx5YrsGubuG2vnp30NjSn1TchvtKaeP1vKvXw5yiCx28L2-FWSbYtumNewmsBt20HhWSw/exec';
const DEFAULT_IMAGE = 'https://e7.pngegg.com/pngimages/695/535/png-clipart-car-no-hitting-s-angle-driving.png';

let userId = null;

let cache = {
  cars: {},
  history: {},
  stats: {}
};

function setCache(key, server, data, ttl = 5 * 60 * 1000) { // 5 минут по умолчанию
  if (!cache[key]) cache[key] = {};
  cache[key][server] = {
    data: data,
    timestamp: Date.now(),
    ttl: ttl
  };
}

function getCache(key, server) {
  if (!cache[key] || !cache[key][server]) return null;
  
  const cached = cache[key][server];
  if (Date.now() - cached.timestamp > cached.ttl) {
    delete cache[key][server];
    return null;
  }
  
  return cached.data;
}

function clearCache(key, server) {
  if (cache[key] && cache[key][server]) {
    delete cache[key][server];
  }
}

let server = null;
let lastScreens = [];

export function init() {
  const tg = window.Telegram.WebApp;
  tg.expand();

  const initData = tg.initDataUnsafe;
  userId = initData?.user?.id;

  if (!userId) {
    document.getElementById('main').innerText = 'Ошибка авторизации';
    return;
  }

  // ✅ Регистрируем пользователя в Google Таблице
  fetch(API_URL, {
    method: 'POST',
    body: new URLSearchParams({
      action: 'registerUser',
      user_id: userId,
      username: initData?.user?.username || '',
      first_name: initData?.user?.first_name || ''
    })
  });

  // Показываем выбор сервера
  chooseServer();
}


function pushScreen(fn) {
  lastScreens.push(fn);
}

window.goBack = function () {
  if (lastScreens.length > 1) {
    lastScreens.pop();
    const prev = lastScreens.pop();
    prev();
  }
};

function chooseServer() {
  lastScreens = [];
  document.getElementById('main').innerHTML = `
    <button onclick="selectServer('La Mesa')">🌵 La Mesa</button>
    <button onclick="selectServer('Murrieta')">🏙 Murrieta</button>
	<button onclick="toggleNotifications()">🔔 Уведомления</button>
  `;
}

window.selectServer = function (srv) {
  server = srv;
  showMainMenu();
};

window.showMainMenu = function () {
  pushScreen(showMainMenu);
  document.getElementById('main').innerHTML = `
    <button onclick="showCars()">🚗 Мои машины</button>
    <button onclick="showHistory()">📜 История аренд</button>
    <button onclick="showStatistics()">📊 Статистика</button>
    <button onclick="chooseServer()">🔁 Сменить сервер</button>
  `;
};

window.showCars = async function () {
  pushScreen(showCars);
  
  // Проверка кэша
  const cachedCars = getCache('cars', server);
  if (cachedCars) {
    console.log('Loading cars from cache');
    displayCars(cachedCars);
    return;
  }
  
  showLoader();
  
  try {
    const res = await fetch(`${API_URL}?action=getCars&server=${server}&user_id=${userId}`);
    if (!res.ok) throw new Error('Network response was not ok');
    
    const cars = await res.json();
    
    if (cars.error) {
      showError(cars.error);
      return;
    }
    
    // Сохранение в кэш
    setCache('cars', server, cars);
    displayCars(cars);
  } catch (error) {
    console.error('Error loading cars:', error);
    showError('Не удалось загрузить список машин. Проверьте подключение к интернету.');
  }
};

function displayCars(cars) {
  let html = '';
  cars.forEach(car => {
    const status = car.inRent ? 'status-rented' : 'status-free';
    const img = car.image_url?.trim() ? car.image_url : DEFAULT_IMAGE;
    html += `
      <div class="car-card" onclick="showCarStats('${car.name}')">
        <div class="car-info">
          <div class="status-indicator ${status}"></div>
          <div class="car-name">${car.name}</div>
        </div>
        <img class="car-image" src="${img}" onerror="this.src='${DEFAULT_IMAGE}'" />
      </div>
    `;
  });
  
  html += `
    <button onclick="addCar()">➕ Добавить машину</button>
    <button onclick="goBack()">⬅️ Назад</button>
    <button onclick="showMainMenu()">🏠 В главное меню</button>
  `;
  
  document.getElementById('main').innerHTML = html;
}

window.addCar = function () {
  const name = prompt("Введите название машины:");
  if (!name) return;
  
  if (name.length < 1 || name.length > 50) {
    alert('Название машины должно быть от 1 до 50 символов');
    return;
  }
  
  showLoader();
  
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ 
      action: 'addCar', 
      server: server, 
      car: name, 
      user_id: userId 
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Очистка кэша
      clearCache('cars', server);
      alert('Машина успешно добавлена!');
      showCars();
    } else {
      alert('Ошибка: ' + data.error);
    }
  })
  .catch(error => {
    console.error('Error adding car:', error);
    alert('Произошла ошибка при добавлении машины');
  });
};

window.showCarStats = async function (car) {
  pushScreen(() => showCarStats(car));
  const [statsRes, carsRes] = await Promise.all([
    fetch(`${API_URL}?action=getCarStats&server=${server}&car=${car}&user_id=${userId}`),
    fetch(`${API_URL}?action=getCars&server=${server}&user_id=${userId}`)
  ]);
  const stats = await statsRes.json();
  const cars = await carsRes.json();
  const carObj = cars.find(c => c.name === car);
  const img = carObj?.image_url?.trim() ? carObj.image_url : DEFAULT_IMAGE;

  let status = stats.active
    ? `⏱ В аренде до: ${new Date(stats.active.end).toLocaleString()}`
    : '✅ Свободна';

  let rentButton = !stats.active
    ? `<button onclick="addToRent('${car}')">➕ Добавить в аренду</button>`
    : '';

  document.getElementById('main').innerHTML = `
    <div class="car-stats-container">
      <img src="${img}" />
      <div class="car-name">${car}</div>
      <div class="car-stats-text">
        💵 Сумма: ${stats.totalSum}$<br>
        ⏳ Часы: ${stats.totalHours}<br>
        ${status}
      </div>
      <div class="car-stats-buttons">
        ${rentButton}
        <button onclick="editCarImagePrompt('${car}')">✏️ Изменить фото</button>
        <button onclick="deleteCarConfirm('${car}')">🗑 Удалить</button>
        <button onclick="goBack()">⬅️ Назад</button>
        <button onclick="showMainMenu()">🏠 Главное меню</button>
      </div>
    </div>
  `;
};

window.editCarImagePrompt = function (car) {
  const url = prompt("URL картинки:");
  if (!url) return;
  
  const cleanUrl = url.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    alert('Неверный формат URL. URL должен начинаться с http:// или https://');
    return;
  }
  
  showLoader();
  
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ 
      action: 'editCarImage', 
      server: server, 
      car: car, 
      image_url: cleanUrl, 
      user_id: userId 
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      // Очистка кэша
      clearCache('cars', server);
      clearCache('stats', server + '_' + car);
      alert('Изображение успешно обновлено!');
      showCarStats(car);
    } else {
      alert('Ошибка: ' + data.error);
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('Произошла ошибка при обновлении изображения');
  });
};

window.deleteCarConfirm = function (car) {
  if (!confirm(`Удалить "${car}"?`)) return;
  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action: 'deleteCar', server, car, user_id: userId })
  }).then(() => showCars());
};

window.addToRent = async function (car) {
  const priceStr = prompt(`Введите сумму аренды для "${car}" (в $):`);
  if (!priceStr || isNaN(priceStr) || +priceStr <= 0) return alert('Введите корректное число больше 0');
  const hoursStr = prompt(`Введите количество часов аренды для "${car}":`);
  if (!hoursStr || isNaN(hoursStr) || +hoursStr <= 0) return alert('Введите корректное число часов больше 0');
  const price = +priceStr;
  const hours = +hoursStr;

  fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'addRent',
      server,
      car,
      price,
      hours,
      user_id: userId
    })
  }).then(() => {
    alert(`Машина "${car}" успешно добавлена в аренду.`);
    showCarStats(car);
  });
};

window.showHistory = async function () {
  pushScreen(showHistory);
  const [res, carsRes] = await Promise.all([
    fetch(`${API_URL}?action=getHistory&server=${server}&user_id=${userId}`),
    fetch(`${API_URL}?action=getCars&server=${server}&user_id=${userId}`)
  ]);
  const history = await res.json();
  const cars = await carsRes.json();

  if (!history.length) {
    document.getElementById('main').innerHTML = `
      <div class="card">История пуста</div>
      <button onclick="goBack()">⬅️ Назад</button>
      <button onclick="showMainMenu()">🏠 В главное меню</button>
    `;
    return;
  }

  let html = '<h3>История аренд</h3>';
  history.forEach(rent => {
    const car = cars.find(c => c.name === rent.car);
    const img = car?.image_url?.trim() ? car.image_url : DEFAULT_IMAGE;
    html += `
      <div class="card-history">
        <img src="${img}" />
        <div class="text">
          🚗 <b>${rent.car}</b><br>
          💵 ${rent.price}$, ⏳ ${rent.hours} ч<br>
          С ${new Date(rent.start).toLocaleString()}<br>
          До ${new Date(rent.end).toLocaleString()}<br>
          Статус: <b style="color:${rent.active ? 'lime' : 'tomato'}">${rent.active ? 'Активна' : 'Завершена'}</b>
        </div>
      </div>
    `;
  });

  html += `
    <button onclick="goBack()">⬅️ Назад</button>
    <button onclick="showMainMenu()">🏠 В главное меню</button>
  `;
  document.getElementById('main').innerHTML = html;
};

window.toggleNotifications = function () {
  alert('🔔 В этой версии уведомления включены по умолчанию.\nВы получите сообщение в Telegram, когда аренда завершится.');
};

function showLoader() {
  document.getElementById('main').innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div style="border: 4px solid rgba(255,255,255,0.3); border-radius: 50%; border-top: 4px solid #fff; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
      <p style="margin-top: 16px; color: #ccc;">Загрузка...</p>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
}

function showError(message) {
  document.getElementById('main').innerHTML = `
    <div style="text-align: center; padding: 40px; color: #ff6b6b;">
      <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
      <h3>Ошибка</h3>
      <p>${message}</p>
      <button onclick="showMainMenu()" style="margin-top: 20px;">В главное меню</button>
    </div>
  `;
}

window.showStatistics = async function () {
  pushScreen(showStatistics);
  showLoader();
  
  try {
    const res = await fetch(`${API_URL}?action=getOverallStats&server=${server}&user_id=${userId}`);
    const stats = await res.json();
    
    if (stats.error) {
      showError(stats.error);
      return;
    }
    
    let html = `
      <div style="text-align: center; margin-bottom: 20px;">
        <h2>📊 Статистика сервера ${server}</h2>
        <p style="color: #ccc;">Последнее обновление: ${new Date().toLocaleString()}</p>
      </div>
      
      <!-- Переключатель периодов -->
      <div style="display: flex; background: rgba(255,255,255,0.1); border-radius: 12px; padding: 4px; margin-bottom: 20px;">
        <button onclick="showPeriodStats('overview')" class="period-btn active" style="flex: 1; padding: 8px; border: none; background: transparent; color: white; border-radius: 8px;">Обзор</button>
        <button onclick="showPeriodStats('daily')" class="period-btn" style="flex: 1; padding: 8px; border: none; background: transparent; color: white; border-radius: 8px;">Дни</button>
        <button onclick="showPeriodStats('weekly')" class="period-btn" style="flex: 1; padding: 8px; border: none; background: transparent; color: white; border-radius: 8px;">Недели</button>
        <button onclick="showPeriodStats('monthly')" class="period-btn" style="flex: 1; padding: 8px; border: none; background: transparent; color: white; border-radius: 8px;">Месяцы</button>
      </div>
      
      <!-- Контейнер для контента -->
      <div id="stats-content">
    `;
    
    // Общий обзор
    html += `
        <!-- Основные показатели -->
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 16px; border-radius: 12px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; margin-bottom: 4px;">${stats.totalCars}</div>
            <div style="font-size: 12px; opacity: 0.9;">Всего машин</div>
          </div>
          <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 16px; border-radius: 12px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; margin-bottom: 4px;">${stats.rentedCars}</div>
            <div style="font-size: 12px; opacity: 0.9;">В аренде</div>
          </div>
          <div style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); padding: 16px; border-radius: 12px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; margin-bottom: 4px;">${stats.freeCars}</div>
            <div style="font-size: 12px; opacity: 0.9;">Свободно</div>
          </div>
          <div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); padding: 16px; border-radius: 12px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; margin-bottom: 4px;">${stats.utilizationRate}%</div>
            <div style="font-size: 12px; opacity: 0.9;">Загрузка</div>
          </div>
        </div>
        
        <!-- Последние периоды -->
        <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 16px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #00bcd4;">📅 Последние периоды</h3>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
              <div style="font-size: 14px; color: #ccc; margin-bottom: 4px;">Последние 7 дней</div>
              <div style="font-size: 18px; font-weight: bold; color: #4CAF50;">${stats.recent.last7Days.earnings}$</div>
              <div style="font-size: 12px; color: #ccc;">${stats.recent.last7Days.rentals} аренд</div>
            </div>
            <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
              <div style="font-size: 14px; color: #ccc; margin-bottom: 4px;">Последние 30 дней</div>
              <div style="font-size: 18px; font-weight: bold; color: #4CAF50;">${stats.recent.last30Days.earnings}$</div>
              <div style="font-size: 12px; color: #ccc;">${stats.recent.last30Days.rentals} аренд</div>
            </div>
          </div>
        </div>
        
        <!-- Финансовая статистика -->
        <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 16px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #ffd700;">💰 Финансовая статистика</h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #4CAF50;">${stats.totalEarnings}$</div>
              <div style="font-size: 12px; color: #ccc;">Общий доход</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #2196F3;">${stats.totalHours}ч</div>
              <div style="font-size: 12px; color: #ccc;">Всего часов</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #FF9800;">${stats.avgPrice}$</div>
              <div style="font-size: 12px; color: #ccc;">Средняя цена</div>
            </div>
          </div>
        </div>
    `;
    
    // Топ машин
    if (stats.topCars && stats.topCars.length > 0) {
      html += `
        <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 16px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #ff5722;">🏆 Топ машин по доходу</h3>
          <div style="space-y: 8px;">
      `;
      
      stats.topCars.forEach((car, index) => {
        html += `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; align-items: center;">
              <span style="background: ${index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : index === 2 ? '#cd7f32' : 'rgba(255,255,255,0.2)'}; 
                           color: ${index < 3 ? '#000' : '#fff'}; 
                           width: 24px; height: 24px; border-radius: 50%; 
                           display: flex; align-items: center; justify-content: center; 
                           font-size: 12px; font-weight: bold; margin-right: 12px;">
                ${index + 1}
              </span>
              <span style="font-weight: 500;">${car.name}</span>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: bold; color: #4CAF50;">${car.earnings}$</div>
              <div style="font-size: 11px; color: #ccc;">${car.rentals} аренд</div>
            </div>
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    }
    
    // Скрытые контейнеры для других периодов
    html += `
      </div>
      
      <!-- Дневная статистика (скрыта по умолчанию) -->
      <div id="daily-stats" style="display: none;">
        <h3>📅 Статистика по дням (последние 30 дней)</h3>
        <div id="daily-chart" style="height: 300px; background: rgba(255,255,255,0.05); border-radius: 12px; margin: 20px 0; display: flex; align-items: center; justify-content: center;">
          <div style="color: #ccc;">График будет здесь</div>
        </div>
        <div id="daily-table"></div>
      </div>
      
      <!-- Недельная статистика (скрыта по умолчанию) -->
      <div id="weekly-stats" style="display: none;">
        <h3>📅 Статистика по неделям (последние 12 недель)</h3>
        <div id="weekly-chart" style="height: 300px; background: rgba(255,255,255,0.05); border-radius: 12px; margin: 20px 0; display: flex; align-items: center; justify-content: center;">
          <div style="color: #ccc;">График будет здесь</div>
        </div>
        <div id="weekly-table"></div>
      </div>
      
      <!-- Месячная статистика (скрыта по умолчанию) -->
      <div id="monthly-stats" style="display: none;">
        <h3>📅 Статистика по месяцам (последние 12 месяцев)</h3>
        <div id="monthly-chart" style="height: 300px; background: rgba(255,255,255,0.05); border-radius: 12px; margin: 20px 0; display: flex; align-items: center; justify-content: center;">
          <div style="color: #ccc;">График будет здесь</div>
        </div>
        <div id="monthly-table"></div>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px;">
        <button onclick="goBack()" style="background: rgba(255,255,255,0.1);">⬅️ Назад</button>
        <button onclick="showMainMenu()" style="background: rgba(255,255,255,0.1);">🏠 Главное меню</button>
      </div>
    `;
    
    document.getElementById('main').innerHTML = html;
    
    // Сохраняем данные для использования в других функциях
    window.currentStats = stats;
    
  } catch (error) {
    console.error('Error loading statistics:', error);
    showError('Не удалось загрузить статистику');
  }
};

// Автообновление статистики каждые 30 секунд
let statsUpdateInterval;

window.startStatsAutoUpdate = function() {
  // Очищаем предыдущий интервал
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
  }
  
  // Устанавливаем новый интервал
  statsUpdateInterval = setInterval(() => {
    // Проверяем, находимся ли мы на странице статистики
    const currentScreen = lastScreens[lastScreens.length - 1];
    if (currentScreen && currentScreen.name === 'showStatistics') {
      console.log('Auto-updating statistics...');
      showStatistics();
    }
  }, 30000); // 30 секунд
};

window.stopStatsAutoUpdate = function() {
  if (statsUpdateInterval) {
    clearInterval(statsUpdateInterval);
    statsUpdateInterval = null;
  }
};

// Запускаем автообновление при открытии статистики
const originalShowStatistics = window.showStatistics;
window.showStatistics = function() {
  startStatsAutoUpdate();
  return originalShowStatistics.apply(this, arguments);
};

// Останавливаем автообновление при выходе со страницы
const originalGoBack = window.goBack;
window.goBack = function() {
  stopStatsAutoUpdate();
  return originalGoBack.apply(this, arguments);
};

window.showPeriodStats = function(period) {
  // Скрываем все периоды
  document.getElementById('stats-content').style.display = 'block';
  document.getElementById('daily-stats').style.display = 'none';
  document.getElementById('weekly-stats').style.display = 'none';
  document.getElementById('monthly-stats').style.display = 'none';
  
  // Показываем выбранный период
  if (period === 'overview') {
    document.getElementById('stats-content').style.display = 'block';
  } else if (period === 'daily') {
    document.getElementById('daily-stats').style.display = 'block';
    renderDailyStats(window.currentStats);
  } else if (period === 'weekly') {
    document.getElementById('weekly-stats').style.display = 'block';
    renderWeeklyStats(window.currentStats);
  } else if (period === 'monthly') {
    document.getElementById('monthly-stats').style.display = 'block';
    renderMonthlyStats(window.currentStats);
  }
  
  // Обновляем активную кнопку
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.style.background = 'transparent';
  });
  event.target.classList.add('active');
  event.target.style.background = 'rgba(255,255,255,0.2)';
};

window.renderDailyStats = function(stats) {
  if (!stats.daily || stats.daily.length === 0) {
    document.getElementById('daily-table').innerHTML = '<div style="text-align: center; padding: 40px; color: #ccc;">Нет данных за последние 30 дней</div>';
    return;
  }
  
  let tableHtml = '<div style="overflow-x: auto;">';
  tableHtml += '<table style="width: 100%; border-collapse: collapse; color: white;">';
  tableHtml += '<thead><tr style="background: rgba(255,255,255,0.1);">';
  tableHtml += '<th style="padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.2);">Дата</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Доход</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Часы</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Аренды</th>';
  tableHtml += '</tr></thead><tbody>';
  
  stats.daily.forEach(day => {
    const date = new Date(day.date).toLocaleDateString('ru-RU');
    tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
      <td style="padding: 12px;">${date}</td>
      <td style="padding: 12px; text-align: right; color: #4CAF50; font-weight: bold;">${day.earnings.toFixed(2)}$</td>
      <td style="padding: 12px; text-align: right;">${day.hours.toFixed(1)}ч</td>
      <td style="padding: 12px; text-align: right;">${day.rentals}</td>
    </tr>`;
  });
  
  tableHtml += '</tbody></table></div>';
  document.getElementById('daily-table').innerHTML = tableHtml;
};

window.renderWeeklyStats = function(stats) {
  if (!stats.weekly || stats.weekly.length === 0) {
    document.getElementById('weekly-table').innerHTML = '<div style="text-align: center; padding: 40px; color: #ccc;">Нет данных за последние 12 недель</div>';
    return;
  }
  
  let tableHtml = '<div style="overflow-x: auto;">';
  tableHtml += '<table style="width: 100%; border-collapse: collapse; color: white;">';
  tableHtml += '<thead><tr style="background: rgba(255,255,255,0.1);">';
  tableHtml += '<th style="padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.2);">Неделя</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Доход</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Часы</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Аренды</th>';
  tableHtml += '</tr></thead><tbody>';
  
  stats.weekly.forEach(week => {
    const weekStart = new Date(week.date).toLocaleDateString('ru-RU');
    tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
      <td style="padding: 12px;">Неделя с ${weekStart}</td>
      <td style="padding: 12px; text-align: right; color: #4CAF50; font-weight: bold;">${week.earnings.toFixed(2)}$</td>
      <td style="padding: 12px; text-align: right;">${week.hours.toFixed(1)}ч</td>
      <td style="padding: 12px; text-align: right;">${week.rentals}</td>
    </tr>`;
  });
  
  tableHtml += '</tbody></table></div>';
  document.getElementById('weekly-table').innerHTML = tableHtml;
};

window.renderMonthlyStats = function(stats) {
  if (!stats.monthly || stats.monthly.length === 0) {
    document.getElementById('monthly-table').innerHTML = '<div style="text-align: center; padding: 40px; color: #ccc;">Нет данных за последние 12 месяцев</div>';
    return;
  }
  
  let tableHtml = '<div style="overflow-x: auto;">';
  tableHtml += '<table style="width: 100%; border-collapse: collapse; color: white;">';
  tableHtml += '<thead><tr style="background: rgba(255,255,255,0.1);">';
  tableHtml += '<th style="padding: 12px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.2);">Месяц</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Доход</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Часы</th>';
  tableHtml += '<th style="padding: 12px; text-align: right; border-bottom: 1px solid rgba(255,255,255,0.2);">Аренды</th>';
  tableHtml += '</tr></thead><tbody>';
  
  stats.monthly.forEach(month => {
    const monthDate = new Date(month.date + '-01').toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' });
    tableHtml += `<tr style="border-bottom: 1px solid rgba(255,255,255,0.1);">
      <td style="padding: 12px;">${monthDate}</td>
      <td style="padding: 12px; text-align: right; color: #4CAF50; font-weight: bold;">${month.earnings.toFixed(2)}$</td>
      <td style="padding: 12px; text-align: right;">${month.hours.toFixed(1)}ч</td>
      <td style="padding: 12px; text-align: right;">${month.rentals}</td>
    </tr>`;
  });
  
  tableHtml += '</tbody></table></div>';
  document.getElementById('monthly-table').innerHTML = tableHtml;
};