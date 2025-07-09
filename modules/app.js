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