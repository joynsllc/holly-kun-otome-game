// === Novel Game Engine ===
class GameEngine {
  constructor() {
    this.scenarioIndex = 0;
    this.empathy = 50; // Start at 50/100
    this.isTyping = false;
    this.typeSpeed = 35;
    this.autoMode = false;
    this.skipMode = false;
    this.readLines = new Set();
    this.labelMap = {};
    this.currentText = '';
    this.typeTimer = null;
    this.playerName = 'さくら'; // デフォルト名
    this.hollyRevealed = false; // ホーリーくんが名乗ったかどうか

    // DOM elements
    this.bgLayer = document.getElementById('bg-layer');
    this.bgOverlay = document.getElementById('bg-overlay');
    this.hollySprite = document.getElementById('holly-sprite');
    this.speakerName = document.getElementById('speaker-name');
    this.textContent = document.getElementById('text-content');
    this.textIndicator = document.getElementById('text-indicator');
    this.choiceContainer = document.getElementById('choice-container');
    this.sceneLabel = document.getElementById('scene-label');
    this.empathyGauge = document.getElementById('empathy-gauge');
    this.empathyFill = document.getElementById('empathy-fill');
    this.textBox = document.getElementById('text-box');

    // Build label map
    this.buildLabelMap();

    // Load read lines from localStorage
    const saved = localStorage.getItem('aoi_readlines');
    if (saved) this.readLines = new Set(JSON.parse(saved));

    this.bindEvents();
  }

  buildLabelMap() {
    SCENARIO.forEach((cmd, i) => {
      if (cmd.type === 'label') {
        this.labelMap[cmd.label] = i;
      }
    });
  }

  bindEvents() {
    // Title buttons
    document.getElementById('btn-start').addEventListener('click', () => {
      audioManager.init();
      this.showNameInput();
    });

    // Name input
    document.getElementById('btn-name-ok').addEventListener('click', () => {
      this.confirmName();
    });
    document.getElementById('name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmName();
      }
    });

    document.getElementById('btn-load').addEventListener('click', () => {
      audioManager.init();
      this.showSaveScreen('load');
    });

    // Game screen click
    document.getElementById('game-screen').addEventListener('click', (e) => {
      if (e.target.closest('#game-ui') || e.target.closest('#choice-container') || e.target.closest('#empathy-gauge')) return;
      this.advance();
    });

    // UI buttons
    document.getElementById('btn-auto').addEventListener('click', (e) => {
      e.stopPropagation();
      this.autoMode = !this.autoMode;
      this.skipMode = false;
      clearTimeout(this._autoTimer);
      e.target.classList.toggle('active', this.autoMode);
      document.getElementById('btn-skip').classList.remove('active');
      // autoをONにした時、テキスト表示完了済みなら進行開始
      if (this.autoMode && !this.isTyping) {
        this._autoTimer = setTimeout(() => this.advance(), 1500);
      }
    });

    document.getElementById('btn-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      this.skipMode = !this.skipMode;
      this.autoMode = false;
      e.target.classList.toggle('active', this.skipMode);
      document.getElementById('btn-auto').classList.remove('active');
      if (this.skipMode) this.doSkip();
    });

    document.getElementById('btn-save').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showSaveScreen('save');
    });

    document.getElementById('btn-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showScreen('title-screen');
      audioManager.stopBGM();
    });

    document.getElementById('btn-sound').addEventListener('click', (e) => {
      e.stopPropagation();
      const on = audioManager.toggleBGM();
      e.target.textContent = on ? '♪' : '♪×';
      e.target.classList.toggle('active', !on);
    });

    document.getElementById('btn-back-save').addEventListener('click', () => {
      this.showScreen('game-screen');
    });

    document.getElementById('btn-title').addEventListener('click', () => {
      this.showScreen('title-screen');
      audioManager.stopBGM();
      this.initTitleScreen();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.advance();
      }
    });
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active', 'screen-transition');
  }

  // === Title Screen ===
  initTitleScreen() {
    this.showScreen('title-screen');
    audioManager.playBGM('title');
    this.drawTitleCanvas();
  }

  drawTitleCanvas() {
    const canvas = document.getElementById('title-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // メインビジュアル画像を表示
    const titleImg = new Image();
    titleImg.src = 'images/title_visual.png';
    titleImg.onload = () => {
      // 画面全体をカバーするように描画（cover方式）
      const imgRatio = titleImg.width / titleImg.height;
      const canvasRatio = canvas.width / canvas.height;
      let drawW, drawH, drawX, drawY;
      if (canvasRatio > imgRatio) {
        drawW = canvas.width;
        drawH = canvas.width / imgRatio;
        drawX = 0;
        drawY = (canvas.height - drawH) / 2;
      } else {
        drawH = canvas.height;
        drawW = canvas.height * imgRatio;
        drawX = (canvas.width - drawW) / 2;
        drawY = 0;
      }
      ctx.drawImage(titleImg, drawX, drawY, drawW, drawH);
    };
  }

  // === Name Input ===
  showNameInput() {
    this.showScreen('name-screen');
    const input = document.getElementById('name-input');
    input.value = 'さくら';
    setTimeout(() => {
      input.focus();
      input.select();
    }, 300);
  }

  confirmName() {
    const input = document.getElementById('name-input');
    const name = input.value.trim();
    this.playerName = name || 'さくら';
    this.startGame();
  }

  // プレイヤー名を置換
  replacePlayerName(text) {
    return text.replace(/さくら/g, this.playerName);
  }

  // === Game Start ===
  startGame() {
    this.scenarioIndex = 0;
    this.empathy = 50;
    this.hollyRevealed = false;
    this.showScreen('game-screen');
    this.empathyGauge.classList.remove('hidden');
    this.updateEmpathyGauge();
    this.processCommand();
  }

  loadGame(saveData) {
    this.scenarioIndex = saveData.index;
    this.empathy = saveData.empathy;
    this.playerName = saveData.playerName || 'さくら';
    // 名乗りシーン（40行目付近）以降ならrevealed
    this.hollyRevealed = saveData.hollyRevealed !== undefined ? saveData.hollyRevealed : true;
    this.showScreen('game-screen');
    this.empathyGauge.classList.remove('hidden');
    this.updateEmpathyGauge();
    // Restore background
    if (saveData.bg) {
      this.bgLayer.style.backgroundImage = `url('${BG_MAP[saveData.bg]}')`;
    }
    if (saveData.bgOverlay) {
      this.bgOverlay.style.background = OVERLAY_MAP[saveData.bgOverlay] || 'none';
    }
    this.processCommand();
  }

  // === Command Processor ===
  processCommand() {
    if (this.scenarioIndex >= SCENARIO.length) return;

    const cmd = SCENARIO[this.scenarioIndex];

    switch (cmd.type) {
      case 'label':
        this.scenarioIndex++;
        this.processCommand();
        break;

      case 'bg':
        if (cmd.bg && BG_MAP[cmd.bg]) {
          this.bgLayer.style.backgroundImage = `url('${BG_MAP[cmd.bg]}')`;
          this._currentBg = cmd.bg;
        }
        if (cmd.bgOverlay && OVERLAY_MAP[cmd.bgOverlay]) {
          this.bgOverlay.style.background = OVERLAY_MAP[cmd.bgOverlay];
          this._currentBgOverlay = cmd.bgOverlay;
        }
        this.scenarioIndex++;
        this.processCommand();
        break;

      case 'bgm':
        audioManager.playBGM(cmd.bgm);
        this.scenarioIndex++;
        this.processCommand();
        break;

      case 'se':
        audioManager.playSE(cmd.se);
        this.scenarioIndex++;
        this.processCommand();
        break;

      case 'scene':
        // Scene transition screen
        this.showSceneTransition(this.replacePlayerName(cmd.text), () => {
          this.scenarioIndex++;
          this.processCommand();
        });
        break;

      case 'label_display':
        this.sceneLabel.textContent = cmd.text;
        this.sceneLabel.classList.remove('hidden');
        this.scenarioIndex++;
        this.processCommand();
        break;

      case 'text':
        if (cmd.showHolly) {
          this.hollySprite.classList.remove('hidden');
          this.hollySprite.classList.add('visible');
        }
        if (cmd.hideHolly) {
          this.hollySprite.classList.add('hidden');
          this.hollySprite.classList.remove('visible');
        }
        // ホーリーくんが名乗るシーン検出（「水戸ホーリーホックのホーリーくん」）
        if (!this.hollyRevealed && cmd.text && cmd.text.includes('水戸ホーリーホックのホーリーくん')) {
          this.hollyRevealed = true;
        }
        {
          let speaker = this.replacePlayerName(cmd.speaker || '');
          // 名乗り前は「???」
          if (!this.hollyRevealed && speaker === 'ホーリーくん') {
            speaker = '？？？';
          }
          this.showText(speaker, this.replacePlayerName(cmd.text), cmd.monologue);
        }
        break;

      case 'choice':
        this.showChoices(cmd.choices);
        break;

      case 'jump':
        if (this.labelMap[cmd.to] !== undefined) {
          this.scenarioIndex = this.labelMap[cmd.to];
        } else {
          this.scenarioIndex++;
        }
        this.processCommand();
        break;

      case 'ending':
        this.showEnding(cmd.title, cmd.subtitle, cmd.endType);
        break;

      default:
        this.scenarioIndex++;
        this.processCommand();
        break;
    }
  }

  // === Text Display ===
  showText(speaker, text, isMonologue) {
    // monologue時はspeaker非表示
    this.speakerName.textContent = isMonologue ? '' : speaker;
    this.speakerName.style.display = isMonologue ? 'none' : '';
    this.textContent.textContent = '';
    this.textContent.classList.toggle('monologue', !!isMonologue);
    this.textIndicator.style.display = 'none';
    this.currentText = text;
    this.isTyping = true;

    let charIndex = 0;
    clearInterval(this.typeTimer);
    clearTimeout(this._autoTimer);

    const speed = this.skipMode ? 1 : this.typeSpeed;

    this.typeTimer = setInterval(() => {
      if (charIndex < text.length) {
        this.textContent.textContent += text[charIndex];
        charIndex++;
      } else {
        clearInterval(this.typeTimer);
        this.isTyping = false;
        this.textIndicator.style.display = 'block';
        this.readLines.add(this.scenarioIndex);

        // Auto or skip mode
        if (this.autoMode) {
          this._autoTimer = setTimeout(() => this.advance(), 1500);
        } else if (this.skipMode) {
          setTimeout(() => this.advance(), 50);
        }
      }
    }, speed);
  }

  advance() {
    // 選択肢表示中は進行しない
    if (!this.choiceContainer.classList.contains('hidden')) return;

    if (this.isTyping) {
      // Complete current text immediately
      clearInterval(this.typeTimer);
      this.textContent.textContent = this.currentText;
      this.isTyping = false;
      this.textIndicator.style.display = 'block';
      this.readLines.add(this.scenarioIndex);

      // autoモードならタイマーで次に進む
      if (this.autoMode) {
        this._autoTimer = setTimeout(() => this.advance(), 1500);
      } else if (this.skipMode) {
        setTimeout(() => this.advance(), 50);
      }
      return;
    }

    // Move to next command
    audioManager.playSE('click');
    this.scenarioIndex++;
    this.processCommand();
  }

  doSkip() {
    if (!this.skipMode) return;
    // Only skip already-read lines
    if (this.readLines.has(this.scenarioIndex)) {
      this.advance();
    } else {
      this.skipMode = false;
      document.getElementById('btn-skip').classList.remove('active');
    }
  }

  // === Choices ===
  showChoices(choices) {
    this.choiceContainer.classList.remove('hidden');
    this.choiceContainer.innerHTML = '';
    this.textBox.style.display = 'none';

    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice.text;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        audioManager.playSE('choice');
        this.choiceContainer.classList.add('hidden');
        this.textBox.style.display = '';

        // Apply empathy change
        if (choice.empathy) {
          this.empathy = Math.max(0, Math.min(100, this.empathy + choice.empathy));
          this.updateEmpathyGauge();
        }

        // Jump to label
        if (choice.next && this.labelMap[choice.next] !== undefined) {
          this.scenarioIndex = this.labelMap[choice.next];
        } else {
          this.scenarioIndex++;
        }

        // Check if final choice requires empathy check
        if (choice.requireEmpathy && this.empathy < choice.requireEmpathy) {
          // Not enough empathy - redirect to bad end
          if (this.labelMap['bad_end'] !== undefined) {
            this.scenarioIndex = this.labelMap['bad_end'];
          }
        }

        this.processCommand();
      });
      this.choiceContainer.appendChild(btn);
    });
  }

  // === Scene Transition ===
  showSceneTransition(text, callback) {
    // Create a full-screen overlay for scene transition
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(13,31,60,0.95); z-index: 100;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      opacity: 0; transition: opacity 0.8s ease;
    `;
    const title = document.createElement('h2');
    title.style.cssText = `
      font-family: 'Noto Serif JP', serif;
      color: #f0ece4; font-size: clamp(1.5rem, 4vw, 2.5rem);
      letter-spacing: 0.3em; text-align: center; line-height: 2;
      white-space: pre-line;
    `;
    title.textContent = text;
    overlay.appendChild(title);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });

    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        callback();
      }, 800);
    }, 2500);
  }

  // === Empathy Gauge ===
  updateEmpathyGauge() {
    this.empathyFill.style.height = `${this.empathy}%`;
    // Color changes based on empathy level
    if (this.empathy >= 60) {
      this.empathyFill.style.background = 'linear-gradient(to top, #4a90d9, rgba(74,144,217,0.4))';
    } else if (this.empathy >= 40) {
      this.empathyFill.style.background = 'linear-gradient(to top, #c4a265, rgba(196,162,101,0.4))';
    } else {
      this.empathyFill.style.background = 'linear-gradient(to top, #a06040, rgba(160,96,64,0.4))';
    }
  }

  // === Ending ===
  showEnding(title, subtitle, endType) {
    audioManager.stopBGM();
    setTimeout(() => {
      if (endType === 'good') {
        audioManager.playBGM('ending');
      } else {
        audioManager.playBGM('sad');
      }
    }, 500);

    const endingBg = document.getElementById('ending-bg');
    if (endType === 'good') {
      endingBg.style.background = 'linear-gradient(135deg, #0d1f3c 0%, #1a3a6b 50%, #2d5aa0 100%)';
    } else {
      endingBg.style.background = 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)';
    }

    document.getElementById('ending-title').textContent = title;
    document.getElementById('ending-subtitle').textContent = subtitle;
    this.showScreen('ending-screen');

    // Save read lines
    localStorage.setItem('aoi_readlines', JSON.stringify([...this.readLines]));
  }

  // === Save/Load ===
  showSaveScreen(mode) {
    this.showScreen('save-screen');
    const slotsContainer = document.getElementById('save-slots');
    slotsContainer.innerHTML = '';

    for (let i = 0; i < 10; i++) {
      const slot = document.createElement('div');
      slot.className = 'save-slot';

      const slotTitle = document.createElement('div');
      slotTitle.className = 'slot-title';
      slotTitle.textContent = `Slot ${i + 1}`;

      const slotInfo = document.createElement('div');
      slotInfo.className = 'slot-info';

      const saveData = localStorage.getItem(`aoi_save_${i}`);
      if (saveData) {
        const data = JSON.parse(saveData);
        slotInfo.textContent = `${data.date} | 共感度: ${data.empathy} | ${data.sceneName || ''}`;
      } else {
        slotInfo.textContent = '— 空き —';
      }

      slot.appendChild(slotTitle);
      slot.appendChild(slotInfo);

      slot.addEventListener('click', () => {
        if (mode === 'save') {
          this.saveToSlot(i);
          this.showScreen('game-screen');
        } else if (mode === 'load') {
          const data = localStorage.getItem(`aoi_save_${i}`);
          if (data) {
            this.loadGame(JSON.parse(data));
          }
        }
      });

      slotsContainer.appendChild(slot);
    }
  }

  saveToSlot(slotIndex) {
    // Find current scene name
    let sceneName = '';
    for (let i = this.scenarioIndex; i >= 0; i--) {
      if (SCENARIO[i].type === 'label_display') {
        sceneName = SCENARIO[i].text;
        break;
      }
      if (SCENARIO[i].type === 'scene') {
        sceneName = SCENARIO[i].text.split('\n')[0];
        break;
      }
    }

    const saveData = {
      index: this.scenarioIndex,
      empathy: this.empathy,
      playerName: this.playerName,
      hollyRevealed: this.hollyRevealed,
      date: new Date().toLocaleString('ja-JP'),
      sceneName,
      bg: this._currentBg,
      bgOverlay: this._currentBgOverlay,
    };

    localStorage.setItem(`aoi_save_${slotIndex}`, JSON.stringify(saveData));
  }
}

// === Initialize ===
window.addEventListener('DOMContentLoaded', () => {
  const engine = new GameEngine();
  engine.initTitleScreen();

  // iOS Safari: dvh フォールバック & リサイズ対応
  const setVH = () => {
    document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
  };
  setVH();
  window.addEventListener('resize', setVH);

  // タイトル画面リサイズ時に再描画
  window.addEventListener('resize', () => {
    if (document.getElementById('title-screen').classList.contains('active')) {
      engine.drawTitleCanvas();
    }
  });

  // iOS Safari: 名前入力時にキーボードで画面が崩れるのを防ぐ
  const nameInput = document.getElementById('name-input');
  nameInput.addEventListener('focus', () => {
    setTimeout(() => {
      nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  });
});
