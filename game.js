/** 오늘은 조금 다른 하루: 횡스크롤 동네 탐험 */

const canvas = document.getElementById('viewport');
const ctx = canvas.getContext('2d');

// View & World Constants
const VIEW_ZOOM = 1;
const GROUND_Y = canvas.height;
const PLAYER_BASE_Y = GROUND_Y;

// Game State
const gameState = { globalSaturation: 0 };

// Keyboard Controls State
const keys = {
  left: false,
  right: false,
  speedBoost: false,
};

// Camera
const camera = {
  x: 0,
  y: 0,
  width: canvas.width / VIEW_ZOOM,
  height: canvas.height / VIEW_ZOOM,
  update(targetX, worldWidth) {
    const desiredX = targetX - this.width / 2;
    this.x += (desiredX - this.x) * 0.1;
    this.x = Math.max(0, Math.min(worldWidth - this.width, this.x));
  }
};

// Particle Engine
const particles = [];
function createParticle(x, y, vx, vy, color, size, life, type = 'generic') {
  particles.push({ x, y, vx, vy, color, size, life, maxLife: life, type });
}

// Scene Transition Manager
const sceneTransition = {
  active: false,
  alpha: 0,
  state: 'idle', // 'out' | 'in'
  targetScene: null,
  targetX: 100,

  start(targetSceneId, spawnX) {
    if (this.active) return;
    this.active = true;
    this.state = 'out';
    this.alpha = 0;
    this.targetScene = targetSceneId;
    this.targetX = spawnX;
    window.soundEngine.playFootstep();
  },

  update() {
    if (!this.active) return;

    if (this.state === 'out') {
      this.alpha += 0.09;
      if (this.alpha >= 1) {
        this.alpha = 1;
        changeScene(this.targetScene, this.targetX);
        this.state = 'in';
      }
    } else if (this.state === 'in') {
      this.alpha -= 0.09;
      if (this.alpha <= 0) {
        this.alpha = 0;
        this.active = false;
        this.state = 'idle';
      }
    }
  },

  draw(ctx) {
    if (!this.active && this.alpha <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(14, 16, 22, ${this.alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
};

// Player Object
const player = {
  x: 680,
  y: PLAYER_BASE_Y,
  width: 36,
  height: 72,
  vx: 0,
  speed: 1.0,
  facing: 1, // 1: right, -1: left
  walkPhase: 0,
  idlePhase: 0,
  state: 'IDLE', // IDLE, WALK
  stepCooldown: 0,

  update(currentScene) {
    this.idlePhase += 0.035;

    if (sceneTransition.active) {
      this.vx = 0;
      return;
    }

    if (keys.left && !keys.right) {
      this.vx = -this.speed * (keys.speedBoost ? 3 : 1);
      this.facing = -1;
      this.state = 'WALK';
      this.walkPhase += 0.12;
      this.handleFootsteps();
    } else if (keys.right && !keys.left) {
      this.vx = this.speed * (keys.speedBoost ? 3 : 1);
      this.facing = 1;
      this.state = 'WALK';
      this.walkPhase += 0.12;
      this.handleFootsteps();
    } else {
      this.vx = 0;
      this.state = 'IDLE';
    }

    this.x += this.vx;

    // Boundary Transitions
    if (currentScene.leftExit && this.x <= 25) {
      sceneTransition.start(currentScene.leftExit.target, currentScene.leftExit.spawnX);
    } else if (currentScene.rightExit && this.x >= currentScene.width - 25) {
      sceneTransition.start(currentScene.rightExit.target, currentScene.rightExit.spawnX);
    } else {
      const minX = currentScene.leftExit ? 20 : 35;
      const maxX = currentScene.rightExit ? currentScene.width - 20 : currentScene.width - 35;
      this.x = Math.max(minX, Math.min(maxX, this.x));
    }
  },

  handleFootsteps() {
    this.stepCooldown--;
    if (this.stepCooldown <= 0) {
      window.soundEngine.playFootstep();
      this.stepCooldown = 26;
    }
  },

  draw(ctx) {
    const scale = 3.8;
    const bob = (this.state === 'WALK')
      ? Math.abs(Math.sin(this.walkPhase)) * 2.2
      : Math.sin(this.idlePhase) * 1.0;

    ctx.save();
    ctx.translate(this.x, this.y - scale * (1.5 + bob));
    ctx.scale(this.facing * scale, scale);

    const gait = this.state === 'WALK' ? Math.sin(this.walkPhase) : 0;
    const legSwing = gait * 0.32;
    const armSwing = -gait * 0.28;
    const bodyWidth = 4;
    const legWidth = bodyWidth;
    const armWidth = 3.3;
    ctx.fillStyle = '#ffffff';

    const drawLimb = (x, y, length, width, angle, withFoot = false) => {
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.rotate(angle);
      ctx.fillRect(-width / 2, 0, width, length);
      if (withFoot) {
        ctx.fillRect(-width / 2, length - 1, width + 3, 2.5);
      }
      ctx.restore();
    };

    // Rear-side arm and leg sit behind the simple upright silhouette.
    drawLimb(-2.5, -35, 18, armWidth, armSwing);
    drawLimb(-0.5, -14, 15, legWidth, -legSwing, true);

    // A long rectangular body with a square head block projecting forward.
    ctx.fillRect(-2.5, -39 + bob, bodyWidth, 25);
    ctx.fillRect(-2.5, -50 + bob, 8.5, 11);

    // The visible arm and leg use the same simple block shapes.
    drawLimb(1, -35, 18, armWidth, -armSwing);
    drawLimb(-0.5, -14, 15, legWidth, legSwing, true);

    ctx.restore();
  }
};

const scenes = {
  home: {
    id: 'home',
    name: '아늑한 내 방 (집)',
    width: 960,
    leftExit: null,
    rightExit: { target: 'home_front', spawnX: 70 },
  },
  home_front: {
    id: 'home_front',
    name: '집 앞',
    width: 960,
    leftExit: { target: 'home', spawnX: 680 },
    rightExit: { target: 'bus_stop', spawnX: 70 },
  },
  bus_stop: {
    id: 'bus_stop',
    name: '버스 정류장',
    width: 960,
    leftExit: { target: 'home_front', spawnX: 900 },
    rightExit: { target: 'bus', spawnX: 700 },
  },
  bus: {
    id: 'bus',
    name: '버스 안',
    width: 960,
    leftExit: null,
    rightExit: null,
  },
  street: {
    id: 'street',
    name: '학원과 가게가 있는 거리',
    width: 960,
    leftExit: { target: 'school_field', spawnX: 900 },
    rightExit: { target: 'academy', spawnX: 70 },
  },
  academy: {
    id: 'academy',
    name: '학원',
    width: 960,
    leftExit: { target: 'street', spawnX: 900 },
    rightExit: { target: 'home', spawnX: 680 },
  },
  school_field: {
    id: 'school_field',
    name: '학교',
    width: 960,
    leftExit: { target: 'bus', spawnX: 860 },
    rightExit: { target: 'street', spawnX: 70 },
  },
};

const gameFlow = {
  completed: new Set(),
  mode: null,
  selectedEnding: null,
  finale: null,
  nearby: null,
  busTime: 0,
  miniGame: null,
};
let lastFlowFrame = performance.now();

const sceneActivities = {
  home_front: [
    { id: 'flower', x: 210, label: '꽃 향기 맡기', text: '꽃 향기를 맡아본다. 생각보다 좋은 냄새가 난다. 기분이 조금 좋아진 것 같다.' },
    { id: 'cat', x: 430, label: '고양이에게 간식 주기', text: '고양이에게 간식을 건넨다. 맛있게 먹는 모습을 보니 마음이 놓인다.' },
    { id: 'guard', x: 790, label: '경비 아저씨와 인사하기', text: '먼저 인사를 건넨다. 안녕하세요. 평소보다 기분 좋게 길을 나선다.' },
  ],
  bus_stop: [
    { id: 'crosswalk', x: 250, label: '흰 칸만 밟아 건너기', text: '횡단보도의 흰 칸만 골라 밟는다. 하나, 둘. 오랜만에 해보니 조금 재미있다.' },
    { id: 'snack', x: 600, label: '간식 사 먹기', text: '따뜻한 간식을 한입 먹는다. 별것 아닌데 기분이 좋아진다.' },
  ],
  street: [
    { id: 'sign', x: 180, label: '간판 자세히 보기', text: '늘 지나치던 간판을 찬찬히 바라본다. 이런 그림이 있었구나.' },
    { id: 'poem', x: 420, label: '서점의 시 읽기', text: '유리창 너머의 짧은 문장을 읽는다. 오늘은 천천히 가도 괜찮아.' },
    { id: 'sky', x: 760, label: '하늘 바라보기', kind: 'happy', text: '잠시 걸음을 멈추고 하늘을 바라본다. 구름이 천천히 흘러간다.' },
  ],
  school_field: [
    { id: 'presentation', x: 220, label: '수업에서 발표하기', text: '사람들 앞에서 생각을 말해본다. 생각보다 떨리지 않는다.' },
    { id: 'football', x: 720, label: '축구에 끼기', text: '나도 같이 해도 돼? 공을 주고받다 보니 웃음이 난다.' },
    { id: 'friend', x: 470, label: '친구의 제안 듣기', kind: 'friend', text: '친구가 평소 안 가던 길로 함께 가보자고 한다.' },
  ],
  academy: [
    { id: 'vending', x: 300, label: '자판기 음료 마시기', text: '차가운 음료를 한 모금 마신다. 잠깐 숨을 돌린다.' },
    { id: 'slow_walk', x: 650, label: '천천히 귀가하기', text: '서두르지 않고 천천히 걷는다. 저녁 공기가 시원하다.' },
  ],
};

// Current Active Scene (START AT HOME!)
let currentSceneId = 'home';
let currentScene = scenes[currentSceneId];

function changeScene(sceneId, spawnX) {
  if (!scenes[sceneId]) return;
  const previousSceneId = currentSceneId;
  currentSceneId = sceneId;
  currentScene = scenes[sceneId];
  player.x = spawnX;
  player.y = PLAYER_BASE_Y;
  player.state = 'IDLE';

  if (sceneId === 'bus') {
    gameFlow.busTime = 0;
  }
  if (sceneId === 'home' && previousSceneId === 'academy' && gameFlow.selectedEnding) {
    const endings = {
      happiness: ['소소한 행복', '늘 걷던 길에서 발견한 작은 즐거움이 오늘을 다르게 만들었다.'],
      different: ['평소와 다른 일상', '친구와 함께한 작은 모험이 익숙한 하루에 새로운 장면을 더했다.'],
    };
    const [title, message] = endings[gameFlow.selectedEnding];
    gameFlow.finale = { title, message, night: false };
    gameFlow.mode = 'finale';
  }

  // Update Location Badge HUD
  const locBadge = document.getElementById('location-badge');
  if (locBadge) locBadge.textContent = `📍 ${currentScene.name}`;

  // Center camera
  camera.x = Math.max(0, Math.min(currentScene.width - camera.width, player.x - camera.width / 2));
}

function currentActivities() {
  const activities = [...(sceneActivities[currentSceneId] || [])];
  if (currentSceneId === 'bus') {
    activities.push({ id: 'bus_door', x: 790, label: '학교에서 내리기', kind: 'busDoor' });
  }
  return activities;
}

function setFlowMode(mode) {
  gameFlow.mode = mode;
  keys.left = false;
  keys.right = false;
  keys.speedBoost = false;
}

function startEscapeMiniGame() {
  setFlowMode('dodge');
  gameFlow.miniGame = {
    elapsed: 0,
    spawnTimer: 0,
    obstacles: [],
    playerX: canvas.width / 2,
    lives: 3,
  };
}

function interactWith(activity) {
  window.soundEngine.playInteractionSelect();

  if (activity.kind === 'busDoor') {
    changeScene('school_field', 70);
    return;
  }

  if (activity.kind === 'happy') {
    setFlowMode('calm');
    gameFlow.calmTime = 2.5;
    gameFlow.calmText = activity.text;
    gameFlow.calmId = activity.id;
    return;
  }

  if (activity.kind === 'friend') {
    setFlowMode('typing');
    gameFlow.typing = { target: 'GO', value: '' };
    return;
  }

  gameFlow.completed.add(activity.id);
  gameFlow.dialogue = activity.text;
  setFlowMode('dialogue');
}

function handleGameFlowKey(event) {
  if (!gameFlow.mode) return false;

  if (gameFlow.mode === 'dodge' && event.key === '2') {
    gameFlow.mode = null;
    gameFlow.miniGame = null;
    gameFlow.busTime = 0;
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'typing') {
    if (/^[a-z]$/i.test(event.key)) {
      const expected = gameFlow.typing.target[gameFlow.typing.value.length];
      if (event.key.toUpperCase() === expected) {
        gameFlow.typing.value += expected;
        if (gameFlow.typing.value === gameFlow.typing.target) {
          gameFlow.selectedEnding = 'different';
          gameFlow.dialogue = '친구와 함께 낯선 길을 걸어본다. 익숙한 동네에 새로운 풍경이 열린다.';
          setFlowMode('dialogue');
        }
      } else {
        gameFlow.typing.value = '';
      }
    }
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'dialogue' || gameFlow.mode === 'finale') {
    if (event.key === 'e' || event.key === 'E' || event.key === 'Enter' || event.key === ' ') {
      if (gameFlow.mode === 'finale' && gameFlow.finale?.night) {
        gameFlow.finale = null;
        gameFlow.mode = null;
      } else if (gameFlow.mode === 'finale') {
        gameFlow.mode = null;
      } else {
        gameFlow.mode = null;
        gameFlow.dialogue = null;
      }
    }
    event.preventDefault();
    return true;
  }

  event.preventDefault();
  return true;
}

function updateGameFlow(deltaSeconds) {
  if (gameFlow.mode === 'calm') {
    gameFlow.calmTime -= deltaSeconds;
    if (gameFlow.calmTime <= 0) {
      gameFlow.completed.add(gameFlow.calmId);
      gameFlow.selectedEnding = 'happiness';
      gameFlow.dialogue = `${gameFlow.calmText} 마음이 조금 가벼워진다. 천천히 집으로 돌아가자.`;
      setFlowMode('dialogue');
    }
  } else if (currentSceneId === 'bus' && !gameFlow.mode) {
    gameFlow.busTime += deltaSeconds;
    if (gameFlow.busTime >= 8) {
      startEscapeMiniGame();
    }
  } else if (gameFlow.mode === 'dodge') {
    const miniGame = gameFlow.miniGame;
    miniGame.elapsed += deltaSeconds;
    miniGame.spawnTimer -= deltaSeconds;

    const stage = Math.min(2, Math.floor(miniGame.elapsed / 10));
    const spawnInterval = stage === 1 ? 0.72 : stage === 2 ? 1.15 : 1.05;
    if (miniGame.spawnTimer <= 0) {
      miniGame.obstacles.push({
        x: 70 + Math.random() * (canvas.width - 140),
        y: -24,
        size: 16 + Math.random() * 12,
        speed: 90 + stage * 30 + Math.random() * 25,
        label: ['알림', '숙제', '시간표'][Math.floor(Math.random() * 3)],
      });
      miniGame.spawnTimer = spawnInterval;
    }

    for (const obstacle of miniGame.obstacles) {
      obstacle.y += obstacle.speed * deltaSeconds;
      if (!obstacle.hit && obstacle.y > canvas.height - 65 && obstacle.y < canvas.height - 34
        && Math.abs(obstacle.x - miniGame.playerX) < obstacle.size + 18) {
        obstacle.hit = true;
        miniGame.lives--;
        if (miniGame.lives <= 0) {
          miniGame.lives = 3;
          miniGame.elapsed = Math.max(0, miniGame.elapsed - 3);
        }
      }
    }
    miniGame.obstacles = miniGame.obstacles.filter(obstacle => obstacle.y < canvas.height + 30);

    if (miniGame.elapsed >= 30) {
      gameFlow.finale = {
        title: '일탈',
        message: '종점에서 내린 뒤, 밤하늘의 별을 오래 바라본다. 오늘은 나만의 속도로 여기까지 왔다.',
        night: true,
      };
      gameFlow.selectedEnding = 'escape';
      setFlowMode('finale');
    }
  }

  gameFlow.nearby = null;
  if (!gameFlow.mode) {
    let nearestDistance = 82;
    for (const activity of currentActivities()) {
      if (gameFlow.completed.has(activity.id)) continue;
      const distance = Math.abs(player.x - activity.x);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        gameFlow.nearby = activity;
      }
    }
  }
}

function drawCenterMessage(ctx, message, subtitle = '') {
  const panelWidth = 680;
  const panelHeight = subtitle ? 92 : 72;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - panelHeight) / 2;
  ctx.fillStyle = '#292929';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '14px sans-serif';
  ctx.fillText(message, canvas.width / 2, panelY + (subtitle ? 38 : 43), panelWidth - 48);
  if (subtitle) {
    ctx.fillStyle = '#d0d0d0';
    ctx.font = '12px sans-serif';
    ctx.fillText(subtitle, canvas.width / 2, panelY + 66, panelWidth - 48);
  }
}

function drawFlowOverlay(ctx) {
  if (gameFlow.mode === 'dodge') {
    const miniGame = gameFlow.miniGame;
    const stage = Math.min(3, Math.floor(miniGame.elapsed / 10) + 1);
    ctx.fillStyle = '#242424';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#393939';
    for (let y = 30; y < canvas.height; y += 42) {
      ctx.fillRect(0, y + (miniGame.elapsed * 34 % 42), canvas.width, 2);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`버스는 계속 달린다 · 구간 ${stage}/3`, canvas.width / 2, 28);
    ctx.font = '11px sans-serif';
    ctx.fillText('마우스를 움직여 해야 할 일들을 피하세요', canvas.width / 2, 47);
    ctx.fillText('2: 미니게임 나가기', canvas.width - 18, 24);
    ctx.textAlign = 'left';
    ctx.fillText(`남은 시간 ${Math.ceil(30 - miniGame.elapsed)}초   여유 ${miniGame.lives}`, 18, 24);

    for (const obstacle of miniGame.obstacles) {
      ctx.fillStyle = '#9b9b9b';
      ctx.fillRect(obstacle.x - obstacle.size / 2, obstacle.y, obstacle.size, obstacle.size);
      ctx.fillStyle = '#222222';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(obstacle.label, obstacle.x, obstacle.y + obstacle.size / 2 + 3);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(miniGame.playerX - 11, canvas.height - 53, 22, 30);
    return;
  }

  if (gameFlow.mode === 'typing') {
    drawCenterMessage(ctx, '친구의 제안에 답해보자', `${gameFlow.typing.value}▯   GO 입력`);
    return;
  }
  if (gameFlow.mode === 'calm') {
    drawCenterMessage(ctx, gameFlow.calmText, `잠시 바라본다 · ${Math.ceil(gameFlow.calmTime)}초`);
    return;
  }
  if (gameFlow.mode === 'dialogue') {
    drawCenterMessage(ctx, gameFlow.dialogue);
    return;
  }
  if (gameFlow.mode === 'finale' && gameFlow.finale) {
    ctx.fillStyle = gameFlow.finale.night ? '#17191b' : 'rgba(20, 20, 20, 0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (gameFlow.finale.night) {
      ctx.fillStyle = '#ffffff';
      for (let index = 0; index < 36; index++) {
        const x = (index * 173 + 37) % canvas.width;
        const y = (index * 67 + 19) % (canvas.height - 90);
        ctx.fillRect(x, y, index % 4 === 0 ? 2 : 1, index % 4 === 0 ? 2 : 1);
      }
    }
    const panelWidth = 700;
    const panelX = (canvas.width - panelWidth) / 2;
    const panelY = canvas.height / 2 - 48;
    ctx.fillStyle = '#292929';
    ctx.fillRect(panelX, panelY, panelWidth, 96);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(gameFlow.finale.title, canvas.width / 2, panelY + 36);
    ctx.font = '12px sans-serif';
    ctx.fillText(gameFlow.finale.message, canvas.width / 2, panelY + 66, panelWidth - 48);
    return;
  }
}

function updateAndDrawParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life--;

    const alpha = particle.life / particle.maxLife;

    if (particle.type === 'heart') {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(particle.x - 3, particle.y - 3, 6, 6);
    } else if (particle.type === 'petal') {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(particle.x - 2.5, particle.y - 2.5, 5, 4);
    } else if (particle.type === 'speed') {
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x + particle.vx * 6, particle.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = particle.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(particle.x - 1.5, particle.y - 1.5, 3, 3);
    }

    if (particle.life <= 0) {
      particles.splice(i, 1);
    }
  }
  ctx.globalAlpha = 1.0;
}

function drawRoomFurniture(ctx) {
  const paneWidth = 82;
  const paneHeight = 123;
  const paneGap = 11 * 0.75;
  const windowCenterX = 460.5;
  const windowTop = 74;
  const windowLeft = windowCenterX - (paneWidth * 2 + paneGap) / 2;

  ctx.fillStyle = '#dedede';
  ctx.fillRect(windowLeft, windowTop, paneWidth, paneHeight);
  ctx.fillRect(windowLeft + paneWidth + paneGap, windowTop, paneWidth, paneHeight);

  ctx.fillStyle = '#666666';
  ctx.fillRect(0, GROUND_Y - 122, 15, 97);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(15, GROUND_Y - 82, 275, 47);
  ctx.fillStyle = '#888888';
  ctx.fillRect(107, GROUND_Y - 82, 183, 47);
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, GROUND_Y - 35, 290, 13);
  ctx.fillRect(20, GROUND_Y - 22, 15, 22);
  ctx.fillRect(255, GROUND_Y - 22, 15, 22);

  ctx.fillStyle = '#555555';
  ctx.fillRect(719, GROUND_Y - 112, 241, 18);
  ctx.fillRect(719, GROUND_Y - 94, 11, 94);
  ctx.fillRect(949, GROUND_Y - 94, 11, 94);

  ctx.fillStyle = '#888888';
  ctx.fillRect(850, GROUND_Y - 194, 80, 66);
  ctx.fillStyle = '#333333';
  ctx.fillRect(856, GROUND_Y - 188, 68, 54);
  ctx.fillStyle = '#888888';
  ctx.fillRect(883, GROUND_Y - 134, 14, 20);
  ctx.fillRect(869, GROUND_Y - 114, 42, 4);

  ctx.fillStyle = '#555555';
  ctx.fillRect(758, GROUND_Y - 176, 12, 32);
  ctx.fillRect(750, GROUND_Y - 161, 8, 5);
  ctx.fillRect(750, GROUND_Y - 171, 5, 15);
  ctx.fillRect(770, GROUND_Y - 154, 9, 5);
  ctx.fillRect(774, GROUND_Y - 164, 5, 15);

  ctx.fillStyle = '#666666';
  ctx.beginPath();
  ctx.moveTo(742, GROUND_Y - 144);
  ctx.lineTo(784, GROUND_Y - 144);
  ctx.lineTo(778, GROUND_Y - 112);
  ctx.lineTo(748, GROUND_Y - 112);
  ctx.closePath();
  ctx.fill();
}

function drawOutdoorBackground(ctx, scene) {
  const wall = '#858585';
  const mid = '#666666';
  const dark = '#484848';
  const light = '#dddddd';

  if (scene.id === 'home_front') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = wall;
    ctx.fillRect(28, 38, 430, 210);
    ctx.fillRect(484, 83, 150, 165);
    ctx.fillStyle = dark;
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 5; column++) {
        ctx.fillRect(48 + column * 78, 60 + row * 58, 42, 30);
      }
    }
    ctx.fillStyle = mid;
    ctx.fillRect(701, 178, 154, 142);
    ctx.fillStyle = light;
    ctx.fillRect(718, 198, 70, 40);

    const flowerDone = gameFlow.completed.has('flower');
    ctx.fillStyle = flowerDone ? '#5d8a65' : dark;
    ctx.fillRect(208, 278, 4, 33);
    ctx.fillRect(200, 294, 10, 4);
    ctx.fillRect(211, 287, 10, 4);
    ctx.fillStyle = flowerDone ? '#e5c76d' : light;
    ctx.fillRect(203, 266, 8, 8);
    ctx.fillRect(211, 266, 8, 8);
    ctx.fillRect(207, 262, 8, 8);
    ctx.fillStyle = dark;
    ctx.fillRect(418, 290, 28, 15);
    ctx.fillRect(438, 281, 13, 14);
    ctx.fillRect(439, 278, 5, 6);
    ctx.fillRect(447, 278, 5, 6);
    ctx.fillRect(414, 285, 6, 4);
    ctx.fillStyle = gameFlow.completed.has('cat') ? '#b9a2c7' : light;
    ctx.fillRect(445, 287, 5, 4);
    return;
  }

  if (scene.id === 'bus_stop') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = wall;
    ctx.fillRect(35, 40, 250, 190);
    ctx.fillRect(320, 70, 176, 160);
    ctx.fillStyle = dark;
    ctx.fillRect(55, 60, 62, 42);
    ctx.fillRect(145, 60, 62, 42);
    ctx.fillRect(340, 92, 54, 38);
    ctx.fillRect(413, 92, 54, 38);
    ctx.fillStyle = mid;
    ctx.fillRect(124, 132, 484, 8);
    ctx.fillRect(132, 140, 8, 115);
    ctx.fillRect(595, 140, 8, 115);
    ctx.fillRect(206, 220, 318, 12);
    ctx.fillRect(218, 232, 12, 35);
    ctx.fillRect(500, 232, 12, 35);
    ctx.fillStyle = light;
    ctx.fillRect(223, 150, 170, 54);
    ctx.fillStyle = dark;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('정류장', 308, 183);
    for (let stripe = 0; stripe < 6; stripe++) {
      ctx.fillStyle = stripe % 2 ? light : mid;
      ctx.fillRect(180 + stripe * 28, 280, 18, 30);
    }
    ctx.fillStyle = mid;
    ctx.fillRect(560, 190, 128, 104);
    ctx.fillStyle = light;
    ctx.fillRect(570, 202, 108, 16);
    ctx.fillStyle = dark;
    ctx.fillRect(574, 229, 100, 65);
    ctx.fillStyle = gameFlow.completed.has('snack') ? '#d2a55a' : '#b0b0b0';
    ctx.fillRect(586, 247, 24, 28);
    ctx.fillRect(619, 238, 35, 37);
    return;
  }

  if (scene.id === 'bus') {
    ctx.fillStyle = '#969696';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 36, 960, 18);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 54, 960, 230);
    for (let window = 0; window < 5; window++) {
      ctx.fillStyle = '#d4d4d4';
      ctx.fillRect(40 + window * 142, 70, 118, 94);
      ctx.fillStyle = mid;
      ctx.fillRect(40 + window * 142, 164, 118, 8);
      ctx.fillRect(45 + window * 142, 206, 100, 10);
      ctx.fillRect(55 + window * 142, 216, 9, 68);
      ctx.fillRect(127 + window * 142, 216, 9, 68);
    }
    ctx.fillStyle = gameFlow.busTime < 8 ? '#555555' : '#eeeeee';
    ctx.fillRect(790, 54, 10, 230);
    ctx.fillStyle = dark;
    ctx.fillRect(18, 228, 22, 56);
    ctx.fillRect(922, 228, 22, 56);
    return;
  }

  if (scene.id === 'school_field') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = wall;
    ctx.fillRect(25, 50, 450, 180);
    ctx.fillRect(44, 24, 170, 26);
    ctx.fillStyle = dark;
    for (let window = 0; window < 5; window++) {
      ctx.fillRect(50 + window * 78, 78, 48, 36);
      ctx.fillRect(50 + window * 78, 132, 48, 36);
    }
    ctx.fillStyle = mid;
    ctx.fillRect(160, 194, 150, 126);
    ctx.fillStyle = light;
    ctx.fillRect(172, 210, 124, 110);
    ctx.fillStyle = dark;
    ctx.fillRect(196, 220, 76, 8);
    ctx.fillRect(210, 244, 48, 48);

    ctx.fillStyle = '#777777';
    ctx.fillRect(674, 242, 4, 64);
    ctx.fillRect(674, 242, 68, 4);
    ctx.fillRect(738, 242, 4, 64);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2;
    ctx.strokeRect(684, 252, 50, 42);
    ctx.fillStyle = gameFlow.completed.has('football') ? '#d4d4d4' : '#777777';
    ctx.fillRect(706, 286, 15, 15);

    const friendTone = gameFlow.selectedEnding === 'different' ? '#eeeeee' : '#777777';
    ctx.fillStyle = friendTone;
    ctx.fillRect(462, 230, 15, 34);
    ctx.fillRect(459, 210, 21, 20);
    ctx.fillRect(458, 264, 8, 40);
    ctx.fillRect(472, 264, 8, 40);
    ctx.fillRect(448, 236, 14, 6);
    ctx.fillRect(477, 236, 14, 6);
    return;
  }

  if (scene.id === 'street') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = wall;
    ctx.fillRect(20, 72, 300, 204);
    ctx.fillRect(340, 42, 294, 234);
    ctx.fillRect(654, 82, 286, 194);
    ctx.fillStyle = dark;
    ctx.fillRect(34, 96, 272, 25);
    ctx.fillRect(354, 66, 266, 25);
    ctx.fillRect(668, 106, 258, 25);
    ctx.fillStyle = '#d0d0d0';
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('동네 가게', 170, 114);
    ctx.fillText('책방', 487, 84);
    ctx.fillText('학원 안내', 797, 124);
    ctx.fillStyle = mid;
    ctx.fillRect(44, 148, 104, 106);
    ctx.fillRect(168, 148, 122, 106);
    ctx.fillRect(370, 112, 218, 142);
    ctx.fillRect(688, 156, 224, 98);
    ctx.fillStyle = '#d5d5d5';
    ctx.fillRect(52, 158, 88, 88);
    ctx.fillRect(178, 158, 102, 88);
    ctx.fillRect(380, 122, 198, 122);
    ctx.fillStyle = dark;
    ctx.fillRect(391, 134, 176, 78);
    ctx.fillStyle = gameFlow.completed.has('poem') ? '#e2e2e2' : '#b8b8b8';
    ctx.fillRect(402, 145, 154, 56);
    ctx.fillStyle = dark;
    ctx.font = '12px sans-serif';
    ctx.fillText('오늘은 천천히 가도 괜찮아', 479, 177);
    ctx.fillStyle = mid;
    ctx.fillRect(748, 252, 4, 52);
    ctx.fillRect(718, 270, 66, 8);
    ctx.fillRect(722, 278, 6, 26);
    ctx.fillRect(774, 278, 6, 26);
    return;
  }

  if (scene.id === 'academy') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = wall;
    ctx.fillRect(24, 36, 912, 242);
    ctx.fillStyle = dark;
    ctx.fillRect(44, 54, 272, 34);
    ctx.fillRect(344, 54, 272, 34);
    ctx.fillRect(644, 54, 272, 34);
    ctx.fillStyle = '#dedede';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('수학 교습소', 180, 77);
    ctx.fillText('영어 학원', 480, 77);
    ctx.fillText('작은 독서실', 780, 77);
    ctx.fillStyle = mid;
    ctx.fillRect(70, 110, 228, 118);
    ctx.fillRect(366, 110, 228, 118);
    ctx.fillRect(664, 110, 228, 118);
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(80, 120, 208, 98);
    ctx.fillRect(376, 120, 208, 98);
    ctx.fillRect(674, 120, 208, 98);
    ctx.fillStyle = dark;
    ctx.fillRect(276, 184, 50, 112);
    ctx.fillStyle = '#bdbdbd';
    ctx.fillRect(282, 192, 38, 68);
    ctx.fillStyle = gameFlow.completed.has('vending') ? '#a7c7b1' : '#777777';
    ctx.fillRect(290, 204, 22, 14);
    ctx.fillStyle = dark;
    ctx.fillRect(296, 230, 10, 8);
    ctx.fillRect(295, 247, 12, 8);
    ctx.fillStyle = mid;
    ctx.fillRect(630, 260, 184, 10);
    ctx.fillRect(642, 270, 10, 34);
    ctx.fillRect(790, 270, 10, 34);
  }
}

function drawOutdoorForeground(ctx, scene) {
  if (scene.id === 'home_front') {
    const flowerDone = gameFlow.completed.has('flower');
    ctx.fillStyle = flowerDone ? '#5d8a65' : '#484848';
    ctx.fillRect(208, 278, 4, 33);
    ctx.fillRect(200, 294, 10, 4);
    ctx.fillRect(211, 287, 10, 4);
    ctx.fillStyle = flowerDone ? '#e5c76d' : '#dddddd';
    ctx.fillRect(203, 266, 8, 8);
    ctx.fillRect(211, 266, 8, 8);
    ctx.fillRect(207, 262, 8, 8);

    ctx.fillStyle = '#484848';
    ctx.fillRect(418, 290, 28, 15);
    ctx.fillRect(438, 281, 13, 14);
    ctx.fillRect(439, 278, 5, 6);
    ctx.fillRect(447, 278, 5, 6);
    ctx.fillRect(414, 285, 6, 4);
    ctx.fillStyle = gameFlow.completed.has('cat') ? '#b9a2c7' : '#dddddd';
    ctx.fillRect(445, 287, 5, 4);
  } else if (scene.id === 'school_field') {
    const friendTone = gameFlow.selectedEnding === 'different' ? '#eeeeee' : '#777777';
    ctx.fillStyle = friendTone;
    ctx.fillRect(462, 230, 15, 34);
    ctx.fillRect(459, 210, 21, 20);
    ctx.fillRect(458, 264, 8, 40);
    ctx.fillRect(472, 264, 8, 40);
    ctx.fillRect(448, 236, 14, 6);
    ctx.fillRect(477, 236, 14, 6);
    ctx.fillStyle = gameFlow.completed.has('football') ? '#d4d4d4' : '#777777';
    ctx.fillRect(706, 286, 15, 15);
  }
}

function drawSceneBackground(ctx, scene) {
  ctx.fillStyle = '#b5b5b5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (scene.id === 'home') {
    drawRoomFurniture(ctx);
  } else {
    drawOutdoorBackground(ctx, scene);
  }
}

// Main Game Loop
function gameLoop() {
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFlowFrame) / 1000, 0.05);
  lastFlowFrame = now;

  player.update(currentScene);
  camera.update(player.x, currentScene.width);
  sceneTransition.update();
  updateGameFlow(deltaSeconds);

  // Render Frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(VIEW_ZOOM, VIEW_ZOOM);
  ctx.translate(-camera.x, 0);

  drawSceneBackground(ctx, currentScene);

  // 2. Player Character
  player.draw(ctx);
  drawOutdoorForeground(ctx, currentScene);

  // 4. Particle Effects
  updateAndDrawParticles(ctx);
  drawFlowOverlay(ctx);

  ctx.restore();

  // Screen Fade Transition
  sceneTransition.draw(ctx);

  requestAnimationFrame(gameLoop);
}

// Keyboard Event Handlers (Strictly Keyboard-Only Controls)
window.addEventListener('keydown', (e) => {
  window.soundEngine.ensureResume();

  // Sound Mute Toggle with 'M' key
  if (e.key === 'm' || e.key === 'M') {
    window.soundEngine.toggleMute();
    return;
  }

  if (handleGameFlowKey(e)) return;
  if (gameFlow.mode) return;

  if ((e.key === 'e' || e.key === 'E') && gameFlow.nearby) {
    e.preventDefault();
    const activity = gameFlow.nearby;
    gameFlow.nearby = null;
    interactWith(activity);
    return;
  }

  // Horizontal Movement
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    keys.left = true;
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    keys.right = true;
  }
  if (e.key === '1') {
    keys.speedBoost = true;
  }

});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    keys.left = false;
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    keys.right = false;
  }
  if (e.key === '1') {
    keys.speedBoost = false;
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (gameFlow.mode !== 'dodge' || !gameFlow.miniGame) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  gameFlow.miniGame.playerX = Math.max(24, Math.min(canvas.width - 24, (e.clientX - rect.left) * scaleX));
});

canvas.addEventListener('click', () => {
  if (gameFlow.mode === 'dodge' && gameFlow.miniGame) {
    gameFlow.miniGame.playerX = Math.max(24, Math.min(canvas.width - 24, gameFlow.miniGame.playerX));
  }
});

// UI Buttons (Null-safe)
const audioToggle = document.getElementById('audio-toggle');
if (audioToggle) {
  audioToggle.addEventListener('click', () => {
    const isMuted = window.soundEngine.toggleMute();
    const audioIcon = document.getElementById('audio-icon');
    if (audioIcon) audioIcon.textContent = isMuted ? '🔇' : '🔊';
  });
}

// Responsive Aspect Ratio Scaling
function handleResize() {
  const container = document.getElementById('game-container');
  const targetAspect = 3;
  let w = container.clientWidth;
  let h = container.clientHeight;

  if (w / h > targetAspect) {
    w = h * targetAspect;
  } else {
    h = w / targetAspect;
  }

  const scale = Math.min(0.8, 1280 / w, 426.67 / h);
  w *= scale;
  h *= scale;

  h = Math.floor(h);
  w = h * targetAspect;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

window.addEventListener('resize', handleResize);
handleResize();

// Start Game Loop
requestAnimationFrame(gameLoop);
