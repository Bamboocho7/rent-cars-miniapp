const tg = window.Telegram.WebApp;
    tg.expand();

    const API_URL = 'https://script.google.com/macros/s/AKfycbx5YrsGubuG2vnp30NjSn1TchvtKaeP1vKvXw5yiCx28L2-FWSbYtumNewmsBt20HhWSw/exec';
    const DEFAULT_IMAGE = 'https://e7.pngegg.com/pngimages/695/535/png-clipart-car-no-hitting-s-angle-driving.png';

    let userId = null;
    let server = null;
    let lastScreens = [];

    function pushScreen(fn) {
      lastScreens.push(fn);
    }
    function goBack() {
      if (lastScreens.length > 1) {
        lastScreens.pop();
        const prev = lastScreens.pop();
        prev();
      }
    }

    async function init() {
      const initData = tg.initDataUnsafe;
      userId = initData?.user?.id;
      if (!userId) return document.getElementById('main').innerText = 'Ошибка авторизации';
      chooseServer();
    }

    function chooseServer() {
      lastScreens = [];
      document.getElementById('main').innerHTML = `
        <button onclick="selectServer('La Mesa')">🌵 La Mesa</button>
        <button onclick="selectServer('Murrieta')">🏙 Murrieta</button>
      `;
    }

    function selectServer(srv) {
      server = srv;
      showMainMenu();
    }

    function showMainMenu() {
      pushScreen(showMainMenu);
      document.getElementById('main').innerHTML = `
        <button onclick="showCars()">🚗 Мои машины</button>
        <button onclick="showHistory()">📜 История аренд</button>
        <button onclick="chooseServer()">🔁 Сменить сервер</button>
      `;
    }

    async function showCars() {
      pushScreen(showCars);
      const res = await fetch(`${API_URL}?action=getCars&server=${server}&user_id=${userId}`);
      const cars = await res.json();

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
            <img class="car-image" src="${img}" />
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

    function addCar() {
      const name = prompt("Введите название машины:");
      if (!name) return;
      fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'addCar', server, car: name, user_id: userId })
      }).then(() => showCars());
    }

    async function showCarStats(car) {
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
    }

    function editCarImagePrompt(car) {
      const url = prompt("URL картинки:");
      if (!url) return;
      fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'editCarImage', server, car, image_url: url, user_id: userId })
      }).then(() => showCarStats(car));
    }

    function deleteCarConfirm(car) {
      if (!confirm(`Удалить "${car}"?`)) return;
      fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'deleteCar', server, car, user_id: userId })
      }).then(() => showCars());
    }

    async function addToRent(car) {
      const priceStr = prompt(`Введите сумму аренды для "${car}" (в $):`);
      if (!priceStr || isNaN(priceStr) || +priceStr <= 0) {
        alert('Введите корректное число больше 0');
        return;
      }
      const hoursStr = prompt(`Введите количество часов аренды для "${car}":`);
      if (!hoursStr || isNaN(hoursStr) || +hoursStr <= 0) {
        alert('Введите корректное число часов больше 0');
        return;
      }
      const price = +priceStr;
      const hours = +hoursStr;

      // Отправляем запрос аренды на backend
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
    }

    async function showHistory() {
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
    }
init();