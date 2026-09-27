    const stateKey = 'tasbih_app_state';
    const todayStr = new Date().toLocaleDateString();

    function createDefaultState() {
      return {
        sound: true,
        vibro: true,
        today: 0,
        totalAllTime: 0,
        lastDate: todayStr,
        historyDays: {},
        currentIndex: 0,
        items: [
          { title: 'Свободный счет', count: 0, target: 0, isMulti: false }
        ]
      };
    }

    function isNonNegativeInteger(value) {
      return Number.isSafeInteger(value) && value >= 0;
    }

    function normalizeItem(item) {
      if (!item || typeof item !== 'object' ||
          typeof item.title !== 'string' || !item.title.trim() ||
          !isNonNegativeInteger(item.count) || typeof item.isMulti !== 'boolean') {
        return null;
      }

      if (!item.isMulti) {
        return isNonNegativeInteger(item.target)
          ? { title: item.title, count: item.count, target: item.target, isMulti: false }
          : null;
      }

      if (!Array.isArray(item.steps) || item.steps.length === 0) return null;
      const steps = item.steps.map((step) => {
        if (!step || typeof step.name !== 'string' || !step.name.trim() ||
            !Number.isSafeInteger(step.target) || step.target < 1) {
          return null;
        }
        return { name: step.name, target: step.target };
      });
      const currentStepIndex = item.currentStepIndex === undefined ? 0 : item.currentStepIndex;
      if (steps.includes(null) || !Number.isInteger(currentStepIndex) ||
          currentStepIndex < 0 || currentStepIndex >= steps.length ||
          item.count >= steps[currentStepIndex].target) {
        return null;
      }

      return {
        title: item.title,
        count: item.count,
        isMulti: true,
        currentStepIndex,
        steps
      };
    }

    function normalizeState(candidate) {
      if (!candidate || typeof candidate !== 'object' ||
          typeof candidate.sound !== 'boolean' || typeof candidate.vibro !== 'boolean' ||
          !isNonNegativeInteger(candidate.today) ||
          !isNonNegativeInteger(candidate.totalAllTime) ||
          typeof candidate.lastDate !== 'string' ||
          !candidate.lastDate ||
          !candidate.historyDays || typeof candidate.historyDays !== 'object' ||
          Array.isArray(candidate.historyDays) ||
          !Array.isArray(candidate.items) || candidate.items.length === 0) {
        return null;
      }

      const items = candidate.items.map(normalizeItem);
      if (items.includes(null) ||
          !Number.isInteger(candidate.currentIndex) ||
          candidate.currentIndex < 0 || candidate.currentIndex >= items.length) {
        return null;
      }

      const historyDays = {};
      for (const [date, count] of Object.entries(candidate.historyDays)) {
        if (!date || !isNonNegativeInteger(count)) return null;
        historyDays[date] = count;
      }

      return {
        sound: candidate.sound,
        vibro: candidate.vibro,
        today: candidate.today,
        totalAllTime: candidate.totalAllTime,
        lastDate: candidate.lastDate,
        historyDays,
        currentIndex: candidate.currentIndex,
        items
      };
    }

    let state;
    let stateRecovered = false;
    let storageUnavailable = false;
    let storedState = null;
    try {
      storedState = localStorage.getItem(stateKey);
    } catch (error) {
      storageUnavailable = true;
      console.error('Не удалось прочитать данные из localStorage.', error);
    }

    if (storedState === null) {
      state = createDefaultState();
    } else {
      try {
        state = normalizeState(JSON.parse(storedState));
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        state = null;
      }
      if (!state) {
        state = createDefaultState();
        stateRecovered = true;
      }
    }

    // Сброс дневной статистики при новом дне
    if (state.lastDate !== todayStr) {
      state.today = 0;
      state.lastDate = todayStr;
    }

    let resetMode = 'current';

    function save() {
      state.historyDays[todayStr] = state.today;
      try {
        localStorage.setItem(stateKey, JSON.stringify(state));
      } catch (error) {
        console.error('Не удалось сохранить данные в localStorage.', error);
        alert('Не удалось сохранить изменения в браузере. Проверьте доступное место и настройки хранения данных.');
      }
    }

    // Элементы UI
    const countVal = document.getElementById('countVal');
    const targetVal = document.getElementById('targetVal');
    const currentTitle = document.getElementById('currentTitle');
    const todayCount = document.getElementById('todayCount');
    const circle = document.getElementById('circle');
    const btnSound = document.getElementById('btnSound');
    const btnVibro = document.getElementById('btnVibro');
    const multiStepInfo = document.getElementById('multiStepInfo');

    document.querySelectorAll('.info-bar, .bottom-controls').forEach((element) => {
      element.addEventListener('click', (event) => event.stopPropagation());
    });

    function updateUI() {
      const cur = state.items[state.currentIndex] || state.items[0];

      if (cur.isMulti) {
        const step = cur.steps[cur.currentStepIndex || 0];
        countVal.textContent = cur.count;
        currentTitle.textContent = `${cur.title} (${step.name})`;
        targetVal.textContent = `Цель шага: ${step.target}`;
        multiStepInfo.style.display = 'block';
        multiStepInfo.textContent = `Шаг ${ (cur.currentStepIndex || 0) + 1 } из ${cur.steps.length}`;
      } else {
        countVal.textContent = cur.count;
        currentTitle.textContent = cur.title;
        targetVal.textContent = cur.target > 0 ? `Цель: ${cur.target}` : 'Цель: Безлимит';
        multiStepInfo.style.display = 'none';
      }

      todayCount.textContent = `⚡ Сегодня: ${state.today}`;
      btnSound.style.opacity = state.sound ? '1' : '0.4';
      btnVibro.style.opacity = state.vibro ? '1' : '0.4';
    }

    // Звук клика (Web Audio API)
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = AudioContextClass ? new AudioContextClass() : null;
    function playClickSound() {
      if (!state.sound || !audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.03);
    }

    function doVibrate(ms = 30) {
      if (state.vibro && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    }

    // Инкремент
    function handleIncrement() {
      const cur = state.items[state.currentIndex];
      cur.count++;
      state.today++;
      state.totalAllTime++;
      
      playClickSound();
      doVibrate(25);

      circle.classList.add('active');
      countVal.classList.add('pop');
      setTimeout(() => {
        circle.classList.remove('active');
        countVal.classList.remove('pop');
      }, 120);

      // Проверка мульти-тасбиха
      if (cur.isMulti) {
        if (!cur.currentStepIndex) cur.currentStepIndex = 0;
        const currentStep = cur.steps[cur.currentStepIndex];

        if (cur.count >= currentStep.target) {
          // Шаг пройден
          cur.count = 0; // Сбрасываем для следующего шага
          if (cur.currentStepIndex + 1 < cur.steps.length) {
            cur.currentStepIndex++;
            doVibrate([100, 50, 100, 50, 200]);
          } else {
            // Вся цепочка завершена
            cur.currentStepIndex = 0;
            doVibrate([100, 50, 100, 50, 100, 50, 300]);
            alert(`🎉 Цепочка "${cur.title}" полностью завершена!`);
          }
        }
      } else if (cur.target > 0 && cur.count === cur.target) {
        doVibrate([100, 50, 100, 50, 150]);
      }

      save();
      updateUI();
    }

    // Клик по экрану
    document.getElementById('mainClickArea').addEventListener('click', () => {
      handleIncrement();
    });

    // Клавиатура
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, button')) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleIncrement();
      }
    });

    // Звук / Вибро / Fullscreen
    btnSound.addEventListener('click', (e) => {
      e.stopPropagation(); state.sound = !state.sound; save(); updateUI();
    });

    btnVibro.addEventListener('click', (e) => {
      e.stopPropagation(); state.vibro = !state.vibro; save(); updateUI();
    });

    document.getElementById('btnFullscreen').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Модалка сброса
    const modalReset = document.getElementById('modalReset');
    document.getElementById('btnResetCurrent').addEventListener('click', (e) => {
      e.stopPropagation();
      resetMode = 'current';
      document.getElementById('resetTitle').textContent = 'Сбросить круг?';
      document.getElementById('resetText').textContent = 'Это сбросит счет текущего тасбиха, но сохранит дневную статистику.';
      modalReset.classList.add('active');
    });

    document.getElementById('btnResetFull').addEventListener('click', (e) => {
      e.stopPropagation();
      resetMode = 'full';
      document.getElementById('resetTitle').textContent = 'Сбросить ВСЁ?';
      document.getElementById('resetText').textContent = 'Сбросится текущий счет И общая дневная статистика за сегодня.';
      modalReset.classList.add('active');
    });

    document.getElementById('btnResetCancel').addEventListener('click', (e) => {
      e.stopPropagation(); modalReset.classList.remove('active');
    });

    document.getElementById('btnResetConfirm').addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = state.items[state.currentIndex];
      cur.count = 0;
      if (cur.isMulti) cur.currentStepIndex = 0;

      if (resetMode === 'full') {
        state.today = 0;
      }
      save(); updateUI();
      modalReset.classList.remove('active');
    });

    // Изменение цели
    document.getElementById('btnChangeTarget').addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = state.items[state.currentIndex];
      if (cur.isMulti) {
        alert('Для мульти-тасбиха цели настроены внутри цепочки!');
        return;
      }
      const val = prompt('Введите новую цель (0 для безлимита):', cur.target);
      if (val !== null) {
        cur.target = Math.max(0, parseInt(val) || 0);
        save(); updateUI();
      }
    });

    // Модалка списка
    const modalList = document.getElementById('modalList');
    document.getElementById('btnMyTasbihs').addEventListener('click', (e) => {
      e.stopPropagation();
      renderList();
      modalList.classList.add('active');
    });

    document.getElementById('btnCloseList').addEventListener('click', (e) => {
      e.stopPropagation(); modalList.classList.remove('active');
    });

    const singlePage = document.getElementById('singlePage');
    const singleZikrForm = document.getElementById('singleZikrForm');

    // Открыть отдельную страницу создания одиночного зикра
    document.getElementById('btnCreateSingleOpen').addEventListener('click', (e) => {
      e.stopPropagation();
      singlePage.classList.add('active');
      singlePage.setAttribute('aria-hidden', 'false');
      document.getElementById('singleZikrText').focus();
    });

    function closeSinglePage() {
      singlePage.classList.remove('active');
      singlePage.setAttribute('aria-hidden', 'true');
    }

    document.getElementById('btnCloseSinglePage').addEventListener('click', closeSinglePage);
    document.getElementById('btnCancelSinglePage').addEventListener('click', closeSinglePage);
    singleZikrForm.addEventListener('submit', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const text = document.getElementById('singleZikrText').value.trim();
      const targetVal = document.getElementById('singleZikrTarget').value;
      const target = targetVal === '' ? 0 : Math.max(0, parseInt(targetVal, 10) || 0);
      if (!text) {
        document.getElementById('singleZikrText').focus();
        return;
      }
      state.items.push({ title: text, count: 0, target: Math.max(0, target), isMulti: false });
      state.currentIndex = state.items.length - 1;
      save();
      updateUI();
      singleZikrForm.reset();
      closeSinglePage();
    });

    function renderList() {
      const container = document.getElementById('tasbihList');
      container.innerHTML = '';
      state.items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const details = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `${item.title}${item.isMulti ? ' 🔗' : ''}`;
        const meta = document.createElement('div');
        meta.className = 'list-item-meta';
        meta.textContent = item.isMulti ? 'Мульти-цепь' : `${item.count} /${item.target || '∞'}`;
        details.append(title, meta);

        const button = document.createElement('button');
        button.className = `btn ${idx === state.currentIndex ? 'btn-gold' : ''}`;
        button.textContent = idx === state.currentIndex ? 'Выбран' : 'Открыть';
        button.addEventListener('click', () => selectTasbih(idx));
        div.append(details, button);
        container.appendChild(div);
      });
    }

    function selectTasbih(idx) {
      state.currentIndex = idx;
      save(); updateUI();
      modalList.classList.remove('active');
    }

    // Добавление шага в форму мульти-тасбиха
    document.getElementById('btnAddStep').addEventListener('click', (e) => {
      e.stopPropagation();
      const div = document.createElement('div');
      div.className = 'chain-step';
      div.innerHTML = `
        <input type="text" placeholder="Название зикра" class="step-name">
        <input type="number" placeholder="Кол-во" class="step-target" min="1" step="1">
        <button class="btn btn-danger remove-chain-step" type="button">✖</button>
      `;
      document.getElementById('chainContainer').appendChild(div);
    });

    document.getElementById('chainContainer').addEventListener('click', (event) => {
      const removeButton = event.target.closest('.remove-chain-step');
      if (removeButton) removeButton.closest('.chain-step').remove();
    });

    // Создание Мульти-тасбиха
    document.getElementById('btnCreateMulti').addEventListener('click', (e) => {
      e.stopPropagation();
      const title = document.getElementById('multiTitle').value.trim() || 'Мой Мульти-Тасбих';
      const names = document.querySelectorAll('.step-name');
      const targets = document.querySelectorAll('.step-target');

      const steps = [];
      let invalidTarget = null;
      names.forEach((input, idx) => {
        const name = input.value.trim();
        if (name) {
          const targetValue = targets[idx].value;
          const target = targetValue === '' ? 33 : Number(targetValue);
          if (!Number.isSafeInteger(target) || target < 1) {
            invalidTarget = targets[idx];
            return;
          }
          steps.push({ name, target });
        }
      });

      if (invalidTarget) {
        alert('Укажите для каждого шага целое количество больше нуля.');
        invalidTarget.focus();
        return;
      }

      if (steps.length === 0) {
        alert('Заполните хотя бы один шаг зикра!');
        return;
      }

      state.items.push({
        title,
        isMulti: true,
        count: 0,
        currentStepIndex: 0,
        steps
      });

      state.currentIndex = state.items.length - 1;
      save(); updateUI();
      modalList.classList.remove('active');
    });

    // Модалка истории
    const modalHistory = document.getElementById('modalHistory');
    document.getElementById('btnHistory').addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('totalAllTime').textContent = state.totalAllTime;
      
      const histList = document.getElementById('historyList');
      histList.innerHTML = '';

      const keys = Object.keys(state.historyDays).reverse();
      if (keys.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'history-empty';
        emptyMessage.textContent = 'История пока пуста';
        histList.appendChild(emptyMessage);
      } else {
        keys.forEach(date => {
          const div = document.createElement('div');
          div.className = 'history-row';
          const dateLabel = document.createElement('span');
          dateLabel.textContent = date;
          const countLabel = document.createElement('strong');
          countLabel.textContent = `${state.historyDays[date]} кликов`;
          div.append(dateLabel, countLabel);
          histList.appendChild(div);
        });
      }

      modalHistory.classList.add('active');
    });

    document.getElementById('btnCloseHistory').addEventListener('click', (e) => {
      e.stopPropagation(); modalHistory.classList.remove('active');
    });

    if (stateRecovered) {
      alert('Сохраненные данные повреждены или имеют неподдерживаемый формат. Приложение запущено с начальными данными.');
    } else if (storageUnavailable) {
      alert('Браузер не разрешил доступ к сохраненным данным. Изменения могут не сохраниться после закрытия страницы.');
    }

    updateUI();
