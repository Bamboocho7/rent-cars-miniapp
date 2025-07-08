
const tg = window.Telegram.WebApp;
tg.expand();

export function init() {
  const main = document.getElementById('main');
  main.innerHTML = '<h2>Добро пожаловать в Rent Cars Bot</h2><button onclick="showCars()">🚗 Мои машины</button>';
  window.showCars = showCars;
}

function showCars() {
  const main = document.getElementById('main');
  const cars = ['BMW', 'Audi', 'Tesla'];

  const html = `
    <div id="car-list" class="sortable">
      ${cars.map(name => `
        <div class="car-card" draggable="true" data-car="${name}">
          🚘 ${name}
        </div>`).join('')}
    </div>
    <button onclick="init()">⬅️ Назад</button>
  `;

  main.innerHTML = html;

  enableDragDrop();

  // Добавим клики
  document.querySelectorAll('.car-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!card.classList.contains('dragging')) {
        alert(`Открыта машина: ${card.dataset.car}`);
      }
    });
  });
}

function enableDragDrop() {
  const list = document.getElementById('car-list');
  let dragged = null;

  list.querySelectorAll('.car-card').forEach(card => {
    card.addEventListener('dragstart', () => {
      dragged = card;
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      dragged = null;
      card.classList.remove('dragging');
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = getDragAfterElement(list, e.clientY);
      if (after == null) {
        list.appendChild(dragged);
      } else {
        list.insertBefore(dragged, after);
      }
    });
  });
}

function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.car-card:not(.dragging)')];
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}
