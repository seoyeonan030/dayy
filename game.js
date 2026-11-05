/**
 * 오늘은 조금 다른 하루 (A Slightly Different Day Today)
 * 2D 횡스크롤 일상 탐험 어드벤처
 *
 * [업데이트 내역]
 * 1. 시작 씬: 아늑한 내 방(집 내부)에서 시작. 현관문과 상호작용하거나 오른쪽으로 가면 아파트 단지로 나감.
 * 2. 학교 씬에서 오른쪽으로 가면 다시 집으로 복귀하는 순환 루프 구조.
 * 3. 빽빽한 아파트 단지:
 *    - 아파트 건물의 가로 폭을 절반으로 슬림화.
 *    - 아파트 101동과 102동 사이에 좁은 바람길 공간을 만들고, '아파트 사이 상쾌한 바람 쐬기' 배치.
 *    - 아파트 건물 뒤편이 아닌 탁 트인 하늘 배경 아래 경비실 초소와 차단봉 배치 (겹침 완전 해결).
 *    - 지상 주차장(주차선, 카스토퍼, 주차된 자동차, 가로등) 구현.
 * 4. 놀이터 & 문방구:
 *    - 좌우 반전: 왼쪽이 놀이터, 오른쪽이 문방구 상가.
 *    - 놀이터 배경의 건물을 완전히 없애고 푸른 나무들을 심어 청량한 공원 분위기 조성.
 * 5. 학원가 거리:
 *    - 신호등 오브젝트가 끝나는 바로 오른쪽에 횡단보도 배치 (신호등 앞에서 횡단보도를 가로질러 달림).
 * 6. 학교 & 운동장:
 *    - 학교 옆 건물을 모두 없애고 넓은 모래 운동장(축구 골대, 트랙) 구현.
 * 7. 골목 샛길(네모난 문 모양 오브젝트) 전체 완전 삭제.
 */

const canvas = document.getElementById('viewport');
const ctx = canvas.getContext('2d');
const roomBackground = new Image();
roomBackground.src = 'asset/room_1.png';

// View & World Constants
const VIEW_ZOOM = 1.25;
const GROUND_Y = 380;
const INTERACTION_DISTANCE = 80;

// Game State
const gameState = {
  tasksTotal: 20,
  endingThreshold: 5,
  completedTasks: new Set(),
  isInteracting: false,
  isEnding: false,
  selectedEnding: null,
  lastCompletedPath: null,
  globalSaturation: 0,
  checklistOpen: false,
  unlockedBadges: JSON.parse(localStorage.getItem('different_day_badges') || '[]'),
};

// Keyboard Controls State
const keys = {
  left: false,
  right: false,
  speedBoost: false,
};

// Active Proximity Focus
let activeInteractable = null;

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
    if (this.active || gameState.isInteracting || gameState.isEnding) return;
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
  x: 160,
  y: GROUND_Y,
  width: 36,
  height: 72,
  vx: 0,
  speed: 2.0,
  facing: 1, // 1: right, -1: left
  walkPhase: 0,
  idlePhase: 0,
  state: 'IDLE', // IDLE, WALK, EVENT
  eventTimer: 0,
  eventMaxTime: 0,
  currentEvent: null,
  stepCooldown: 0,

  update(currentScene) {
    this.idlePhase += 0.035;

    if (sceneTransition.active) {
      this.vx = 0;
      return;
    }

    if (this.state === 'EVENT') {
      this.updateEvent();
      return;
    }

    // Keyboard Movement
    if (!gameState.isInteracting && !gameState.isEnding && !gameState.checklistOpen) {
      if (keys.left && !keys.right) {
        this.vx = -this.speed * (keys.speedBoost ? 2 : 1);
        this.facing = -1;
        this.state = 'WALK';
        this.walkPhase += 0.12;
        this.handleFootsteps();
      } else if (keys.right && !keys.left) {
        this.vx = this.speed * (keys.speedBoost ? 2 : 1);
        this.facing = 1;
        this.state = 'WALK';
        this.walkPhase += 0.12;
        this.handleFootsteps();
      } else {
        this.vx = 0;
        this.state = 'IDLE';
      }
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
      createParticle(
        this.x - this.facing * 8,
        this.y + 1,
        -this.facing * (0.2 + Math.random() * 0.3),
        -Math.random() * 0.4,
        'rgba(140, 145, 155, 0.4)',
        2.5,
        16,
        'dust'
      );
    }
  },

  updateEvent() {
    this.eventTimer++;
    if (this.currentEvent && this.currentEvent.onUpdate) {
      this.currentEvent.onUpdate(this, this.eventTimer);
    }

    if (this.eventTimer >= this.eventMaxTime) {
      finishInteraction();
    }
  },

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing * 3, 3);

    const bob = (this.state === 'WALK')
      ? Math.abs(Math.sin(this.walkPhase)) * 2.2
      : Math.sin(this.idlePhase) * 1.0;

    const bodyColor = '#15171d';
    const darkShade = '#0c0e12';
    const accentColor = gameState.globalSaturation > 0.2 ? '#f6c75f' : '#646b7a';

    if (this.state === 'EVENT' && this.currentEvent && this.currentEvent.customDraw) {
      this.currentEvent.customDraw(ctx, this, this.eventTimer);
    } else {
      // Shadow
      ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
      ctx.fillRect(-12, 0, 24, 3);

      const legStride = (this.state === 'WALK') ? Math.sin(this.walkPhase) * 8 : 0;

      // Back Leg & Shoe
      ctx.fillStyle = darkShade;
      ctx.fillRect(-5 - legStride * 0.6, -16 + bob, 4.5, 16);
      ctx.fillRect(-8 - legStride * 0.6, -2 + bob, 8, 3.5);

      // Front Leg & Shoe
      ctx.fillStyle = bodyColor;
      ctx.fillRect(1 + legStride * 0.6, -16 + bob, 4.5, 16);
      ctx.fillRect(1 + legStride * 0.6, -2 + bob, 8, 3.5);

      // Coat
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-7, -37 + bob, 14, 23);
      ctx.fillStyle = darkShade;
      ctx.fillRect(-7, -18 + bob, 14, 4);

      // Messenger Bag
      ctx.fillStyle = '#08090b';
      ctx.fillRect(-10, -32 + bob, 4.5, 11);
      ctx.strokeStyle = '#08090b';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-6, -35 + bob);
      ctx.lineTo(4, -22 + bob);
      ctx.stroke();

      // Scarf
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(-7, -39 + bob);
      ctx.lineTo(7, -39 + bob);
      ctx.lineTo(8, -34 + bob);
      ctx.lineTo(-6, -34 + bob);
      ctx.closePath();
      ctx.fill();

      // Scarf Flutter
      const scarfFlutter = Math.sin(this.idlePhase * 2 + (this.vx !== 0 ? this.walkPhase : 0)) * 2.5;
      ctx.beginPath();
      ctx.moveTo(-5, -36 + bob);
      ctx.lineTo(-13 - Math.abs(this.vx) * 1.5, -32 + bob + scarfFlutter);
      ctx.lineTo(-17 - Math.abs(this.vx) * 2, -26 + bob + scarfFlutter);
      ctx.lineTo(-10, -29 + bob + scarfFlutter);
      ctx.closePath();
      ctx.fill();

      // Head
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-5.5, -49 + bob, 11, 11);

      ctx.fillStyle = darkShade;
      ctx.beginPath();
      ctx.moveTo(-7, -50 + bob);
      ctx.lineTo(8, -50 + bob);
      ctx.lineTo(9.5, -44 + bob);
      ctx.lineTo(5.5, -44 + bob);
      ctx.lineTo(-7, -44 + bob);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
};

// ==========================================
// 20 Distinct Interactive Moments + Front Door
// ==========================================
const interactables = {
  // [Scene 0: 집 내부 현관문]
  home_door: {
    id: 'home_door',
    name: '현관문 열고 밖으로 나가기',
    sceneName: '아늑한 내 방 (집)',
    isSpecialTransition: true,
    scene: 'home',
    x: 680,
    y: GROUND_Y,
    width: 60,
    height: 120,
    colorAura: '#fcd34d',
    thought: '현관문을 열고 바깥으로 나선다. 오늘은 어제와는 조금 다른 하루를 보낼 수 있을까?',
    duration: 50,
    onTrigger(player) {
      window.soundEngine.playFootstep();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 40;
      player.currentEvent = {
        id: 'home_door',
        onUpdate(p, t) {},
        customDraw(ctx, p, t) {}
      };
      setTimeout(() => {
        sceneTransition.start('apartment_dense', 70);
      }, 350);
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Wooden front door
      ctx.fillStyle = '#3d2817';
      ctx.fillRect(-24, -115, 48, 115);
      ctx.fillStyle = '#654321';
      ctx.fillRect(-20, -110, 40, 110);

      // Door handle
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(12, -55, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Warm door light rim
      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(252, 211, 77, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-27, -120, 54, 122);
      }
      ctx.restore();
    }
  },

  // [Scene 1: 빽빽한 아파트 단지 & 주차장] - 1
  breeze: {
    id: 'breeze',
    name: '아파트 사이 상쾌한 바람 쐬기',
    sceneName: '아파트 단지 & 주차장',
    badge: '🍃 상쾌한 환기',
    scene: 'apartment_dense',
    x: 270, // Exactly between Building 101 and Building 102
    y: GROUND_Y,
    width: 65,
    height: 80,
    colorAura: '#38bdf8',
    thought: '높고 빽빽한 아파트 건물 사이 좁은 바람길로 불어오는 시원한 아침 바람.\n눈을 감고 가슴 깊이 공기를 들이마시자, 답답했던 머릿속이 상쾌하게 맑아진다.',
    duration: 130,
    onTrigger(player) {
      window.soundEngine.playRainEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 130;
      player.currentEvent = {
        id: 'breeze',
        onUpdate(p, t) {
          if (t % 8 === 0) {
            createParticle(p.x - 20, p.y - 35 + (Math.random() - 0.5) * 20, 3 + Math.random() * 2, -0.3, '#38bdf8', 2.5, 25, 'speed');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-12, 0, 24, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-5, -16, 4.5, 16);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(1, -16, 4.5, 16);
          ctx.fillRect(-7, -37, 14, 23);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(-6, -39, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(-2, -50, 11, 11);
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Alley ventilation shaft & breeze swirls
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-22, -32, 44, 32);

      for (let ly = -26; ly < -5; ly += 6) {
        ctx.fillStyle = '#111827';
        ctx.fillRect(-18, ly, 36, 2.5);
      }

      ctx.strokeStyle = gameState.completedTasks.has(this.id) ? '#38bdf8' : '#6b7280';
      ctx.lineWidth = 1.8;
      const t = Date.now() * 0.003;
      ctx.beginPath();
      ctx.moveTo(-15, -45 + Math.sin(t) * 3);
      ctx.quadraticCurveTo(0, -55 + Math.cos(t) * 4, 18, -48 + Math.sin(t + 1) * 3);
      ctx.stroke();

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-28, -65, 56, 68);
      }
      ctx.restore();
    }
  },

  // [Scene 1: 빽빽한 아파트 단지 & 주차장] - 2
  cat: {
    id: 'cat',
    name: '경비실 옆 길고양이 쓰다듬기',
    sceneName: '아파트 단지 & 주차장',
    badge: '🐾 다정한 온기',
    scene: 'apartment_dense',
    x: 610, // In front of security booth, free of building overlap
    y: GROUND_Y,
    width: 65,
    height: 60,
    colorAura: '#ffaa5a',
    thought: '햇살이 드는 경비실 옆 상자 위, 작은 고양이가 다정하게 등을 내어준다.\n손끝으로 전해지는 포근하고 따뜻한 숨결에 마음이 부드럽게 풀려난다.',
    duration: 130,
    onTrigger(player) {
      window.soundEngine.playCatEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 130;
      player.currentEvent = {
        id: 'cat',
        onUpdate(p, t) {
          if (t % 15 === 0 && t < 100) {
            createParticle(p.x + 28, p.y - 35, (Math.random() - 0.5) * 0.8, -1 - Math.random(), '#ff9472', 4, 30, 'heart');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-15, 0, 30, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-10, -10, 20, 10);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(-6, -28, 13, 19);
          ctx.strokeStyle = '#15171d';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(3, -22);
          ctx.lineTo(18, -14);
          ctx.stroke();
          ctx.fillStyle = '#ffaa5a';
          ctx.fillRect(-4, -30, 11, 4.5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(2, -39, 10, 10);
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Cardboard box
      ctx.fillStyle = gameState.completedTasks.has(this.id) ? '#c89d6e' : '#6c7382';
      ctx.fillRect(-22, -24, 44, 24);
      ctx.strokeStyle = '#4b515d';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-22, -24, 44, 24);

      // Cat
      ctx.fillStyle = gameState.completedTasks.has(this.id) ? '#ffaa5a' : '#23262f';
      ctx.fillRect(-10, -36, 22, 13);
      ctx.fillRect(8, -42, 11, 11);
      ctx.beginPath();
      ctx.moveTo(8, -42); ctx.lineTo(11, -48); ctx.lineTo(14, -42);
      ctx.moveTo(14, -42); ctx.lineTo(17, -48); ctx.lineTo(20, -42);
      ctx.fill();

      const tailWag = Math.sin(Date.now() * 0.005) * 4;
      ctx.strokeStyle = gameState.completedTasks.has(this.id) ? '#ffaa5a' : '#23262f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-10, -31);
      ctx.lineTo(-18, -38 + tailWag);
      ctx.stroke();

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(255, 170, 90, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-28, -52, 56, 56);
      }
      ctx.restore();
    }
  },

  // [Scene 1: 빽빽한 아파트 단지 & 주차장] - 3
  flower: {
    id: 'flower',
    name: '화단 속 작은 들꽃 관찰하기',
    sceneName: '아파트 단지 & 주차장',
    badge: '🌼 숨겨진 발견',
    scene: 'apartment_dense',
    x: 880, // Next to the parking lot curb
    y: GROUND_Y,
    width: 60,
    height: 55,
    colorAura: '#fde047',
    thought: '주차장 옆 작은 화단, 콘크리트 틈새를 뚫고 꿋꿋하게 피어난 노란 들꽃 하나.\n매일 무심히 지나치던 발밑에서 작은 생명의 경이로움을 발견한다.',
    duration: 130,
    onTrigger(player) {
      window.soundEngine.playFlowerEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 130;
      player.currentEvent = {
        id: 'flower',
        onUpdate(p, t) {
          if (t % 12 === 0) {
            createParticle(p.x + 18, p.y - 20, (Math.random() - 0.5) * 1.2, -1 - Math.random(), '#fde047', 3, 30, 'sparkle');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-12, 0, 24, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-8, -12, 16, 12);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(-6, -26, 12, 16);
          ctx.fillStyle = '#fde047';
          ctx.fillRect(-4, -28, 9, 4);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(0, -36, 10, 10);
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Planter brick curb
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(-25, -12, 50, 12);

      // Green stems & leaves
      ctx.strokeStyle = gameState.completedTasks.has(this.id) ? '#22c55e' : '#4b5563';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-6, -12); ctx.lineTo(-8, -26);
      ctx.moveTo(6, -12); ctx.lineTo(8, -30);
      ctx.moveTo(0, -12); ctx.lineTo(0, -36);
      ctx.stroke();

      // Yellow flowers
      const flowerColor = gameState.completedTasks.has(this.id) ? '#fde047' : '#9ca3af';
      ctx.fillStyle = flowerColor;
      ctx.beginPath(); ctx.arc(-8, -26, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(8, -30, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -36, 5.5, 0, Math.PI * 2); ctx.fill();

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-30, -45, 60, 48);
      }
      ctx.restore();
    }
  },

  // [Scene 2: 어린이 놀이터 & 문방구 상가] - 4 (Left Playground)
  swing: {
    id: 'swing',
    name: '놀이터 그네 타고 하늘 구르기',
    sceneName: '어린이 놀이터 & 문방구 상가',
    badge: '🎠 높이 솟은 자유',
    scene: 'store_playground',
    x: 220, // In left playground
    y: GROUND_Y,
    width: 85,
    height: 125,
    colorAura: '#eab308',
    thought: '발끝을 힘껏 차올리자 푸른 나무와 하늘이 높게 기운다.\n규율과 시간표에서 벗어나 오직 하늘과 바람만을 마주하는 짜릿한 순간.',
    duration: 140,
    onTrigger(player) {
      window.soundEngine.playSwingEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 140;
      player.currentEvent = {
        id: 'swing',
        onUpdate(p, t) {
          if (t % 14 === 0) {
            createParticle(p.x, p.y - 40, (Math.random() - 0.5) * 2, -1 - Math.random() * 2, '#eab308', 3, 25, 'sparkle');
          }
        },
        customDraw(ctx, p, t) {
          const swingAngle = Math.sin((t / 25) * Math.PI) * 0.42;
          ctx.save();
          ctx.translate(0, -110);
          ctx.rotate(swingAngle);
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-10, 0); ctx.lineTo(-10, 85);
          ctx.moveTo(10, 0); ctx.lineTo(10, 85);
          ctx.stroke();
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(-15, 85, 30, 5);

          ctx.fillStyle = '#15171d';
          ctx.fillRect(-7, 60, 14, 25);
          ctx.fillRect(-4, 85, 18, 5);
          ctx.fillRect(10, 90, 5, 10);
          ctx.fillStyle = '#eab308';
          ctx.fillRect(-6, 58, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(-5.5, 48, 11, 11);
          ctx.restore();
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      const isDone = gameState.completedTasks.has(this.id);
      // Swing Frame
      ctx.strokeStyle = isDone ? '#eab308' : '#575f6e';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-38, 0); ctx.lineTo(0, -120); ctx.lineTo(38, 0);
      ctx.moveTo(-48, -120); ctx.lineTo(48, -120);
      ctx.stroke();

      const isSwinging = (player.state === 'EVENT' && player.currentEvent?.id === 'swing');
      if (!isSwinging) {
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, -120); ctx.lineTo(-10, -25);
        ctx.moveTo(10, -120); ctx.lineTo(10, -25);
        ctx.stroke();
        ctx.fillStyle = isDone ? '#d4a373' : '#646c7c';
        ctx.fillRect(-14, -25, 28, 5);
      }

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-45, -130, 90, 135);
      }
      ctx.restore();
    }
  },

  // [Scene 2: 어린이 놀이터 & 문방구 상가] - 5 (Right Store)
  gacha: {
    id: 'gacha',
    name: '문방구 앞 캡슐 뽑기 기계 돌리기',
    sceneName: '어린이 놀이터 & 문방구 상가',
    badge: '🎁 두근거리는 설렘',
    scene: 'store_playground',
    x: 820, // In front of right store
    y: GROUND_Y,
    width: 65,
    height: 85,
    colorAura: '#f43f5e',
    thought: '동전 구멍에 동전을 넣고 손잡이를 힘껏 돌린다. 짤랑, 찰칵!\n어린 날의 두근거림과 함께 데굴데굴 굴러 나온 캡슐에 마음이 활짝 핀다.',
    duration: 135,
    onTrigger(player) {
      window.soundEngine.playGachaEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 135;
      player.currentEvent = {
        id: 'gacha',
        onUpdate(p, t) {
          if (t % 10 === 0 && t > 30) {
            createParticle(p.x + 22, p.y - 25, (Math.random() - 0.5) * 1.5, -1.5 - Math.random(), '#f43f5e', 3.5, 30, 'sparkle');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-12, 0, 24, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-5, -16, 4.5, 16);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(1, -16, 4.5, 16);
          ctx.fillRect(-7, -37, 14, 23);
          ctx.fillStyle = '#f43f5e';
          ctx.fillRect(-6, -39, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(0, -49, 11, 11);
          ctx.strokeStyle = '#15171d';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(3, -25);
          ctx.lineTo(16, -28);
          ctx.stroke();
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      const isDone = gameState.completedTasks.has(this.id);
      ctx.fillStyle = isDone ? '#e11d48' : '#4b5563';
      ctx.fillRect(-16, -42, 32, 42);

      ctx.fillStyle = isDone ? 'rgba(255, 255, 255, 0.4)' : 'rgba(107, 114, 128, 0.35)';
      ctx.fillRect(-15, -75, 30, 33);
      ctx.strokeStyle = isDone ? '#fda4af' : '#6b7280';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-15, -75, 30, 33);

      const capColors = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = isDone ? capColors[i] : '#9ca3af';
        ctx.beginPath();
        ctx.arc(-8 + (i % 2) * 16, -65 + Math.floor(i / 2) * 14, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#fcd34d';
      ctx.beginPath(); ctx.arc(0, -22, 5, 0, Math.PI * 2); ctx.fill();

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-22, -82, 44, 84);
      }
      ctx.restore();
    }
  },

  // [Scene 2: 어린이 놀이터 & 문방구 상가] - 6 (Right Store)
  snack: {
    id: 'snack',
    name: '문방구 매점 따뜻한 간식 맛보기',
    sceneName: '어린이 놀이터 & 문방구 상가',
    badge: '🍢 달콤한 추억',
    scene: 'store_playground',
    x: 1040, // Next to right store window
    y: GROUND_Y,
    width: 75,
    height: 90,
    colorAura: '#f97316',
    thought: '김이 모락모락 피어나는 매점 가판대에서 따끈한 간식을 받아 든다.\n달콤하고 고소한 온기가 입안 가득 번지며 굳어 있던 몸과 마음을 녹여준다.',
    duration: 130,
    onTrigger(player) {
      window.soundEngine.playSnackEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 130;
      player.currentEvent = {
        id: 'snack',
        onUpdate(p, t) {
          if (t % 8 === 0) {
            createParticle(p.x + 14, p.y - 38, (Math.random() - 0.5) * 0.5, -1.2 - Math.random() * 0.8, 'rgba(255, 255, 255, 0.65)', 3, 28, 'steam');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-12, 0, 24, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-5, -16, 4.5, 16);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(1, -16, 4.5, 16);
          ctx.fillRect(-7, -37, 14, 23);
          ctx.fillStyle = '#f97316';
          ctx.fillRect(6, -34, 7, 7);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(0, -49, 11, 11);
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      const isDone = gameState.completedTasks.has(this.id);
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(-28, -40, 56, 40);

      ctx.fillStyle = isDone ? '#ea580c' : '#374151';
      ctx.fillRect(-20, -52, 40, 14);

      ctx.fillStyle = isDone ? '#fb923c' : '#6b7280';
      ctx.fillRect(-32, -75, 64, 15);

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-36, -82, 72, 84);
      }
      ctx.restore();
    }
  },

  // [Scene 3: 빽빽한 학원가 거리] - 7
  sprint: {
    id: 'sprint',
    name: '신호등 횡단보도 전력 질주하기',
    sceneName: '빽빽한 학원가 거리',
    badge: '⚡ 짜릿한 질주',
    scene: 'academy_dense',
    x: 240, // Positioned at the curb before crosswalk begins
    y: GROUND_Y,
    width: 65,
    height: 100,
    colorAura: '#06b6d4',
    thought: '초록불이 켜진 횡단보도를 온 힘을 다해 질주한다!\n가슴 끝까지 차오르는 숨과 함께 마음속 묵은 답답함이 단숨에 날아간다.',
    duration: 130,
    onTrigger(player) {
      window.soundEngine.playSprintEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 130;
      player.currentEvent = {
        id: 'sprint',
        onUpdate(p, t) {
          if (t < 80) {
            p.facing = 1;
            p.x += 2.6; // Dash across the crosswalk to the right!
            p.walkPhase += 0.22;
            if (t % 3 === 0) {
              createParticle(p.x - 14, p.y - 25, -2.5 - Math.random() * 2, (Math.random() - 0.5) * 2, '#06b6d4', 3.5, 20, 'speed');
            }
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-15, 0, 30, 3);
          const leg = Math.sin(p.walkPhase) * 12;
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-7 - leg * 0.7, -14, 5, 14);
          ctx.fillRect(-11 - leg * 0.7, -2, 8, 3.5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(2 + leg * 0.7, -14, 5, 14);
          ctx.fillRect(2 + leg * 0.7, -2, 8, 3.5);
          ctx.save();
          ctx.rotate(0.32);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(-7, -38, 14, 23);
          ctx.fillStyle = '#06b6d4';
          ctx.fillRect(-6, -40, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(-5.5, -50, 11, 11);
          ctx.restore();
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      // Traffic Signal Post
      ctx.fillStyle = '#4b5262';
      ctx.fillRect(-3, -115, 6, 115);
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-12, -135, 24, 24);

      // Green light glowing
      ctx.fillStyle = gameState.completedTasks.has(this.id) ? '#22c55e' : '#64748b';
      ctx.beginPath(); ctx.arc(0, -123, 7, 0, Math.PI * 2); ctx.fill();

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-20, -142, 40, 145);
      }
      ctx.restore();
    }
  },

  // [Scene 3: 빽빽한 학원가 거리] - 8
  bookstore: {
    id: 'bookstore',
    name: '동네 서점 쇼윈도 시 구절 읽기',
    sceneName: '빽빽한 학원가 거리',
    badge: '📖 마음에 남은 한 줄',
    scene: 'academy_dense',
    x: 820,
    y: GROUND_Y,
    width: 80,
    height: 110,
    colorAura: '#a855f7',
    thought: '학원가 모퉁이 서점 유리창에 붙은 아름다운 한 줄의 시.\n"가장 어두운 밤에도 별은 빛난다." 바쁜 일상 속 지친 영혼에 조용한 위로를 건넨다.',
    duration: 130,
    onTrigger(player) {
      window.soundEngine.playBookEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 130;
      player.currentEvent = {
        id: 'bookstore',
        onUpdate(p, t) {
          if (t % 14 === 0) {
            createParticle(p.x + 10, p.y - 45, (Math.random() - 0.5) * 1.2, -1 - Math.random(), '#a855f7', 3, 30, 'sparkle');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-12, 0, 24, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-5, -16, 4.5, 16);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(1, -16, 4.5, 16);
          ctx.fillRect(-7, -37, 14, 23);
          ctx.fillStyle = '#a855f7';
          ctx.fillRect(-6, -39, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(0, -49, 11, 11);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(8, -32, 9, 12);
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      const isDone = gameState.completedTasks.has(this.id);
      ctx.fillStyle = isDone ? '#475569' : '#334155';
      ctx.fillRect(-35, -95, 70, 95);
      ctx.fillStyle = isDone ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(-30, -85, 60, 50);

      ctx.fillStyle = isDone ? '#a855f7' : '#64748b';
      ctx.fillRect(-18, -65, 36, 22);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('POEM', 0, -50);

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-40, -102, 80, 105);
      }
      ctx.restore();
    }
  },

  // [Scene 4: 학교 교문 & 운동장] - 9
  cherry_wish: {
    id: 'cherry_wish',
    name: '교문 앞 벚꽃나무 아래서 소원 빌기',
    sceneName: '학교 교문 & 운동장',
    badge: '🌸 피어나는 다짐',
    scene: 'school_field',
    x: 380, // Beside school gate
    y: GROUND_Y,
    width: 85,
    height: 140,
    colorAura: '#f472b6',
    thought: '바람에 살랑이며 손바닥 위로 내려앉은 연분홍빛 벚꽃잎 하나.\n두 눈을 꼭 감고 마음속 소원을 빌어본다. 오늘 하루가 조금 더 특별해지기를.',
    duration: 135,
    onTrigger(player) {
      window.soundEngine.playCherryWishEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 135;
      player.currentEvent = {
        id: 'cherry_wish',
        onUpdate(p, t) {
          if (t % 8 === 0) {
            createParticle(p.x + (Math.random() - 0.5) * 60, p.y - 120, 1 + Math.random(), 0.8 + Math.random() * 0.8, '#f472b6', 3.5, 45, 'petal');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-12, 0, 24, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-5, -16, 4.5, 16);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(1, -16, 4.5, 16);
          ctx.fillRect(-7, -37, 14, 23);
          ctx.fillStyle = '#f472b6';
          ctx.fillRect(-6, -39, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(0, -49, 11, 11);
          ctx.fillStyle = '#fcd34d';
          ctx.beginPath(); ctx.arc(7, -28, 4, 0, Math.PI * 2); ctx.fill();
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      const isDone = gameState.completedTasks.has(this.id);
      ctx.fillStyle = '#3d2b25';
      ctx.fillRect(-8, -130, 16, 130);

      ctx.fillStyle = isDone ? '#f472b6' : '#6b7280';
      ctx.fillRect(-45, -180, 50, 50);
      ctx.fillRect(-15, -195, 55, 55);
      ctx.fillRect(15, -170, 40, 45);

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-50, -205, 100, 210);
      }
      ctx.restore();
    }
  },

  // [Scene 4: 학교 교문 & 운동장] - 10
  hilltop_sky: {
    id: 'hilltop_sky',
    name: '언덕길 난간에서 탁 트인 하늘 바라보기',
    sceneName: '학교 교문 & 운동장',
    badge: '🌅 나만의 지평선',
    scene: 'school_field',
    x: 1040, // At the end of the sports field overlook
    y: GROUND_Y,
    width: 80,
    height: 110,
    colorAura: '#fbbf24',
    thought: '정해진 시간표를 벗어나 높은 언덕 끝에 서서 먼 하늘을 바라본다.\n넓게 펼쳐진 지평선과 바람 속에서, 내 삶의 진정한 주인이 된 기분이 든다.',
    duration: 135,
    onTrigger(player) {
      window.soundEngine.playBenchEvent();
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = 135;
      player.currentEvent = {
        id: 'hilltop_sky',
        onUpdate(p, t) {
          if (t % 10 === 0) {
            createParticle(p.x + 10, p.y - 50, 1.5 + Math.random(), -0.5 + (Math.random() - 0.5), '#fbbf24', 3.5, 35, 'sparkle');
          }
        },
        customDraw(ctx, p, t) {
          ctx.fillStyle = 'rgba(10, 12, 16, 0.4)';
          ctx.fillRect(-12, 0, 24, 3);
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-5, -16, 4.5, 16);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(1, -16, 4.5, 16);
          ctx.fillRect(-7, -37, 14, 23);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-6, -39, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(0, -49, 11, 11);
        }
      };
    },
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);

      const isDone = gameState.completedTasks.has(this.id);
      ctx.fillStyle = isDone ? '#64748b' : '#475569';
      ctx.fillRect(-35, -20, 70, 20);

      ctx.strokeStyle = isDone ? '#fbbf24' : '#6b7280';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-35, -55); ctx.lineTo(35, -55);
      ctx.moveTo(-20, -20); ctx.lineTo(-20, -55);
      ctx.moveTo(20, -20); ctx.lineTo(20, -55);
      ctx.stroke();

      ctx.fillStyle = isDone ? '#f59e0b' : '#334155';
      ctx.save();
      ctx.translate(0, -60);
      ctx.rotate(-0.3);
      ctx.fillRect(-15, -4, 30, 8);
      ctx.restore();

      if (this === activeInteractable) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-42, -75, 84, 80);
      }
      ctx.restore();
    }
  }
};

// ==========================================
// 5 Connected Scenes (With Home & Looped Cycle)
// ==========================================
const scenes = {
  // 0. 아늑한 내 방 (시작 위치)
  home: {
    id: 'home',
    name: '아늑한 내 방 (집)',
    width: 820,
    leftExit: null, // Room wall
    rightExit: { target: 'apartment_dense', spawnX: 70 },
    doors: [], // No alley doors!
    interactables: ['home_door', 'morning_stretch', 'journal_entry'],
    drawBackground(ctx, sat) {
      ctx.fillStyle = sat < 0.2 ? '#20232b' : '#38332e';
      ctx.fillRect(0, 0, this.width, canvas.height);

      if (roomBackground.complete && roomBackground.naturalWidth > 0) {
        const imageScale = this.width / roomBackground.naturalWidth;
        const imageHeight = roomBackground.naturalHeight * imageScale;
        const floorOffset = imageHeight * (253 / roomBackground.naturalHeight);
        ctx.drawImage(roomBackground, 0, GROUND_Y - floorOffset, this.width, imageHeight);
      }
    }
  },

  // 1. 아파트 단지 & 주차장 (apartment_dense)
  apartment_dense: {
    id: 'apartment_dense',
    name: '아파트 단지 & 주차장',
    width: 1250,
    leftExit: { target: 'home', spawnX: 720 },
    rightExit: { target: 'store_playground', spawnX: 70 },
    doors: [], // Alley shortcuts removed!
    interactables: ['breeze', 'cat', 'flower', 'security_greeting', 'parking_cloudwatch'],
    drawBackground(ctx, sat) {
      // Sky
      const sky = ctx.createLinearGradient(0, -50, 0, 160);
      if (sat < 0.2) {
        sky.addColorStop(0, '#c7d2de');
        sky.addColorStop(1, '#e6edf4');
      } else {
        sky.addColorStop(0, '#7dd3fc');
        sky.addColorStop(1, '#fef08a');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(-100, -80, this.width + 200, 260);

      // =========================================
      // Left: Slimmed Apartment Blocks (가로 폭 절반으로 축소!)
      // =========================================
      // Block 101 (x: 40 to 220, Width: 180px - Half width!)
      const apt1 = sat < 0.2 ? '#949ba8' : '#b2b9c5';
      ctx.fillStyle = apt1;
      ctx.fillRect(40, GROUND_Y - 280, 180, 280);
      ctx.fillStyle = '#646b77';
      ctx.fillRect(220, GROUND_Y - 280, 2, 280);

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('101', 55, GROUND_Y - 240);

      // Balcony grid (2 columns)
      ctx.fillStyle = '#475569';
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 2; c++) {
          const bx = 100 + c * 55;
          const by = GROUND_Y - 260 + r * 46;
          ctx.fillRect(bx, by, 44, 22);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by + 11, 44, 11);
        }
      }

      // Narrow Gap / Breeze Alley between Buildings (x: 220 to 320)
      // Showing distant dark alleyway depth
      ctx.fillStyle = '#1c202a';
      ctx.fillRect(222, GROUND_Y - 210, 96, 210);

      // Block 102 (x: 320 to 500, Width: 180px - Half width!)
      const apt2 = sat < 0.2 ? '#888f9c' : '#a3abb8';
      ctx.fillStyle = apt2;
      ctx.fillRect(320, GROUND_Y - 280, 180, 280);
      ctx.fillStyle = '#646b77';
      ctx.fillRect(500, GROUND_Y - 280, 2, 280);

      ctx.fillStyle = '#1e293b';
      ctx.fillText('102', 335, GROUND_Y - 240);

      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 2; c++) {
          const bx = 380 + c * 55;
          const by = GROUND_Y - 260 + r * 46;
          ctx.fillRect(bx, by, 44, 22);
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by + 11, 44, 11);
        }
      }

      // =========================================
      // Right: Security Booth & Parking Lot (아파트 건물과 전혀 안 겹침!)
      // =========================================
      // Open Sky is visible behind security booth (x: 520 to 1250)

      // Parking Barrier Arm (차단봉 x: 530 to 570 - Completely free of building behind!)
      ctx.fillStyle = '#eab308';
      ctx.fillRect(530, GROUND_Y - 45, 8, 45); // Pillar
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(530, GROUND_Y - 36, 45, 5); // Barrier bar

      // Security Office Booth (경비실 초소 x: 580 to 660)
      ctx.fillStyle = sat < 0.2 ? '#64748b' : '#52525b';
      ctx.fillRect(580, GROUND_Y - 85, 80, 85);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(590, GROUND_Y - 70, 45, 30); // Window
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('경비실', 595, GROUND_Y - 50);

      // Ground Surface Parking Lot (지상 주차장 x: 670 to 1200)
      // Parking Lot Streetlights
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(760, GROUND_Y); ctx.lineTo(760, GROUND_Y - 140);
      ctx.lineTo(780, GROUND_Y - 140);
      ctx.stroke();
      ctx.fillStyle = sat < 0.2 ? '#cbd5e1' : '#fef08a';
      ctx.beginPath(); ctx.arc(780, GROUND_Y - 138, 5, 0, Math.PI * 2); ctx.fill();

      // Parking Signboard ("P 아파트 입주민 전용 주차장")
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(680, GROUND_Y - 95, 36, 36);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('P', 698, GROUND_Y - 70);

      // Parked Car Silhouettes (Car 1: x: 960 to 1080)
      const carColor = sat < 0.2 ? '#334155' : '#1e293b';
      ctx.fillStyle = carColor;
      ctx.fillRect(960, GROUND_Y - 32, 105, 32); // Car body
      ctx.fillRect(985, GROUND_Y - 50, 60, 20); // Cabin
      ctx.fillStyle = '#475569';
      ctx.beginPath(); ctx.arc(985, GROUND_Y, 8, 0, Math.PI * 2); ctx.fill(); // Wheel 1
      ctx.beginPath(); ctx.arc(1045, GROUND_Y, 8, 0, Math.PI * 2); ctx.fill(); // Wheel 2

      // Parking spaces markings (White diagonal parking lines)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2.5;
      for (let px = 740; px <= 1180; px += 80) {
        ctx.beginPath();
        ctx.moveTo(px, GROUND_Y);
        ctx.lineTo(px + 18, GROUND_Y + 70);
        ctx.stroke();
        // Wheel stopper
        ctx.fillStyle = '#eab308';
        ctx.fillRect(px + 4, GROUND_Y + 18, 12, 4);
      }
    }
  },

  // 2. 어린이 놀이터 & 문방구 상가 (store_playground)
  store_playground: {
    id: 'store_playground',
    name: '어린이 놀이터 & 문방구 상가',
    width: 1250,
    leftExit: { target: 'apartment_dense', spawnX: 1180 },
    rightExit: { target: 'academy_dense', spawnX: 70 },
    doors: [], // No doors!
    interactables: ['swing', 'gacha', 'snack', 'playground_slide', 'playground_friend'],
    drawBackground(ctx, sat) {
      // Sky
      const sky = ctx.createLinearGradient(0, -50, 0, 160);
      if (sat < 0.2) {
        sky.addColorStop(0, '#cbd4e0');
        sky.addColorStop(1, '#e8f0f8');
      } else {
        sky.addColorStop(0, '#93c5fd');
        sky.addColorStop(1, '#fed7aa');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(-100, -80, this.width + 200, 260);

      // =========================================
      // LEFT: Neighborhood Playground (배경 건물 완전히 없앰! 푸른 나무들 배치!)
      // =========================================
      // Green Trees in the background (x: 40 to 600)
      const treeLeafColor1 = sat < 0.2 ? '#64748b' : '#22c55e';
      const treeLeafColor2 = sat < 0.2 ? '#475569' : '#16a34a';

      // Tree 1 (x: 80)
      ctx.fillStyle = '#3d2b25';
      ctx.fillRect(75, GROUND_Y - 140, 14, 140);
      ctx.fillStyle = treeLeafColor1;
      ctx.beginPath(); ctx.arc(82, GROUND_Y - 165, 45, 0, Math.PI * 2); ctx.fill();

      // Tree 2 (x: 280)
      ctx.fillStyle = '#3d2b25';
      ctx.fillRect(275, GROUND_Y - 160, 16, 160);
      ctx.fillStyle = treeLeafColor2;
      ctx.beginPath(); ctx.arc(283, GROUND_Y - 190, 55, 0, Math.PI * 2); ctx.fill();

      // Tree 3 (x: 480)
      ctx.fillStyle = '#3d2b25';
      ctx.fillRect(475, GROUND_Y - 150, 14, 150);
      ctx.fillStyle = treeLeafColor1;
      ctx.beginPath(); ctx.arc(482, GROUND_Y - 175, 50, 0, Math.PI * 2); ctx.fill();

      // Playground Sandbox Ground
      ctx.fillStyle = sat < 0.2 ? '#78716c' : '#d4a373';
      ctx.fillRect(30, GROUND_Y - 10, 560, 10);

      // Playground Fence
      ctx.strokeStyle = sat < 0.2 ? '#6b7280' : '#eab308';
      ctx.lineWidth = 2.5;
      for (let fx = 30; fx < 580; fx += 22) {
        ctx.beginPath();
        ctx.moveTo(fx, GROUND_Y); ctx.lineTo(fx, GROUND_Y - 26);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(30, GROUND_Y - 20); ctx.lineTo(580, GROUND_Y - 20);
      ctx.stroke();

      // Playground Slide Tower (x: 420)
      const slideColor = sat < 0.2 ? '#64748b' : '#ef4444';
      const towerColor = sat < 0.2 ? '#475569' : '#3b82f6';
      ctx.fillStyle = towerColor;
      ctx.fillRect(420, GROUND_Y - 110, 48, 110);
      ctx.fillStyle = sat < 0.2 ? '#71717a' : '#eab308';
      ctx.beginPath();
      ctx.moveTo(410, GROUND_Y - 110);
      ctx.lineTo(444, GROUND_Y - 140);
      ctx.lineTo(478, GROUND_Y - 110);
      ctx.fill();

      // Slide Chute
      ctx.strokeStyle = slideColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(420, GROUND_Y - 80);
      ctx.quadraticCurveTo(370, GROUND_Y - 50, 340, GROUND_Y);
      ctx.stroke();

      // Playground Bench (x: 120)
      ctx.fillStyle = sat < 0.2 ? '#575f6e' : '#a16207';
      ctx.fillRect(110, GROUND_Y - 28, 60, 6);
      ctx.fillRect(110, GROUND_Y - 18, 60, 5);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(115, GROUND_Y - 18, 4, 18);
      ctx.fillRect(160, GROUND_Y - 18, 4, 18);

      // =========================================
      // RIGHT: Commercial Stationery Store (문방구를 놀이터 오른쪽으로 배치!)
      // =========================================
      const storeTone = sat < 0.2 ? '#8f96a3' : '#b0a99f';
      ctx.fillStyle = storeTone;
      ctx.fillRect(640, GROUND_Y - 240, 580, 240);
      ctx.fillStyle = '#575f6e';
      ctx.fillRect(640, GROUND_Y - 240, 2, 240);

      // 2nd Floor Windows
      ctx.fillStyle = '#334155';
      ctx.fillRect(670, GROUND_Y - 210, 140, 48);
      ctx.fillRect(840, GROUND_Y - 210, 140, 48);
      ctx.fillRect(1010, GROUND_Y - 210, 140, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('무지개 피아노 교습소', 680, GROUND_Y - 180);

      // 1st Floor Stationery Storefront ("무지개 문방구")
      const signColor = sat < 0.2 ? '#475569' : '#0284c7';
      ctx.fillStyle = signColor;
      ctx.fillRect(660, GROUND_Y - 145, 520, 36);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('무지개 문방구  (문구 · 완구 · 팬시 · 간식)', 720, GROUND_Y - 120);

      // Striped Awning (Red & Yellow)
      const c1 = sat < 0.2 ? '#52525b' : '#ef4444';
      const c2 = sat < 0.2 ? '#71717a' : '#f59e0b';
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = i % 2 === 0 ? c1 : c2;
        ctx.fillRect(660 + i * 20, -109 + GROUND_Y, 20, 24);
      }

      // Store Glass Display Windows
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(680, GROUND_Y - 85, 320, 75);

      const bookColors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = sat < 0.2 ? '#64748b' : bookColors[i];
        ctx.fillRect(700 + i * 70, GROUND_Y - 60, 50, 40);
      }
    }
  },

  // 3. 빽빽한 학원가 거리 (academy_dense)
  academy_dense: {
    id: 'academy_dense',
    name: '빽빽한 학원가 거리',
    width: 1200,
    leftExit: { target: 'store_playground', spawnX: 1180 },
    rightExit: { target: 'school_field', spawnX: 70 },
    doors: [], // No doors!
    interactables: ['sprint', 'bookstore', 'study_pause', 'street_melody'],
    drawBackground(ctx, sat) {
      // Sky
      const sky = ctx.createLinearGradient(0, -50, 0, 160);
      if (sat < 0.2) {
        sky.addColorStop(0, '#c7d1dd');
        sky.addColorStop(1, '#e5ecf5');
      } else {
        sky.addColorStop(0, '#60a5fa');
        sky.addColorStop(1, '#fed7aa');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(-100, -80, this.width + 200, 260);

      // Large Buildings
      const bldColor1 = sat < 0.2 ? '#949ba8' : '#b2b8c4';
      ctx.fillStyle = bldColor1;
      ctx.fillRect(0, GROUND_Y - 270, 580, 270);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(580, GROUND_Y - 270, 2, 270);

      const bldColor2 = sat < 0.2 ? '#888f9c' : '#9ca3af';
      ctx.fillStyle = bldColor2;
      ctx.fillRect(582, GROUND_Y - 280, 618, 280);

      // Dense Academy Signs
      const signs = [
        { text: '일등 수학 단과 전문 학원', x: 40, y: GROUND_Y - 240, w: 230, h: 32, col: '#1e3a8a' },
        { text: '열정 영어 어학원 (초·중·고)', x: 40, y: GROUND_Y - 200, w: 230, h: 32, col: '#991b1b' },
        { text: '명문 국어 논술 전문 학원', x: 40, y: GROUND_Y - 160, w: 230, h: 32, col: '#065f46' },
        { text: '하이탑 과학탐구 영재관', x: 300, y: GROUND_Y - 240, w: 240, h: 32, col: '#7c2d12' },
        { text: '탑클래스 프리미엄 독서실', x: 300, y: GROUND_Y - 200, w: 240, h: 32, col: '#4c1d95' },
        { text: '프라임 입시 미술 학원', x: 300, y: GROUND_Y - 160, w: 240, h: 32, col: '#be185d' },

        { text: '미래로 대학 입시 컨설팅', x: 620, y: GROUND_Y - 250, w: 250, h: 34, col: '#0f766e' },
        { text: '글로벌 토플 · 수능 영어', x: 620, y: GROUND_Y - 208, w: 250, h: 34, col: '#1d4ed8' },
        { text: '정예 수학 1:1 과외 클리닉', x: 620, y: GROUND_Y - 166, w: 250, h: 34, col: '#b91c1c' },
        { text: '24시 스터디카페 & 라운지', x: 900, y: GROUND_Y - 230, w: 260, h: 36, col: '#d97706' },
      ];

      signs.forEach(s => {
        ctx.fillStyle = sat < 0.2 ? '#475569' : s.col;
        ctx.fillRect(s.x, s.y, s.w, s.h);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(s.text, s.x + 14, s.y + 21);
      });
    }
  },

  // 4. 학교 교문 & 운동장 (school_field)
  school_field: {
    id: 'school_field',
    name: '학교 교문 & 운동장',
    width: 1200,
    leftExit: { target: 'academy_dense', spawnX: 1120 },
    rightExit: { target: 'home', spawnX: 70 }, // LOOP BACK TO HOME!
    doors: [], // No doors!
    interactables: ['cherry_wish', 'hilltop_sky', 'soccer_practice', 'cheer_team'],
    drawBackground(ctx, sat) {
      // Expansive Sky
      const sky = ctx.createLinearGradient(0, -60, 0, 190);
      if (sat < 0.2) {
        sky.addColorStop(0, '#cbd4e0');
        sky.addColorStop(0.6, '#e0e8f2');
        sky.addColorStop(1, '#f1f5f9');
      } else {
        sky.addColorStop(0, '#60a5fa');
        sky.addColorStop(0.5, '#c084fc');
        sky.addColorStop(1, '#fed7aa');
      }
      ctx.fillStyle = sky;
      ctx.fillRect(-100, -80, this.width + 200, 300);

      // Distant mountain ridges
      ctx.fillStyle = sat < 0.2 ? '#b8c0cc' : '#c4b5fd';
      ctx.beginPath();
      ctx.moveTo(350, GROUND_Y - 140);
      ctx.lineTo(600, GROUND_Y - 180);
      ctx.lineTo(850, GROUND_Y - 150);
      ctx.lineTo(1200, GROUND_Y - 170);
      ctx.lineTo(1200, GROUND_Y);
      ctx.lineTo(350, GROUND_Y);
      ctx.fill();

      // =========================================
      // Left: School Main Building & Clock Tower (x: 0 to 320)
      // =========================================
      const schoolTone = sat < 0.2 ? '#99a0ad' : '#bfa59a';
      ctx.fillStyle = schoolTone;
      ctx.fillRect(0, GROUND_Y - 220, 320, 220);

      // Clock Tower
      ctx.fillStyle = sat < 0.2 ? '#888f9c' : '#ad8f84';
      ctx.fillRect(110, GROUND_Y - 280, 80, 60);

      // Clock Face
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(150, GROUND_Y - 250, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#171920';
      ctx.fillRect(149, GROUND_Y - 262, 2, 12);
      ctx.fillRect(149, GROUND_Y - 250, 7, 2);

      // School Front Gates (x: 20 to 320)
      ctx.fillStyle = '#374151';
      ctx.fillRect(20, GROUND_Y - 95, 20, 95);  // Gate Pillar 1
      ctx.fillRect(300, GROUND_Y - 95, 20, 95); // Gate Pillar 2

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('고등학교', 25, GROUND_Y - 55);

      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 2.5;
      for (let gx = 45; gx <= 295; gx += 16) {
        ctx.beginPath();
        ctx.moveTo(gx, GROUND_Y); ctx.lineTo(gx, GROUND_Y - 75);
        ctx.stroke();
      }

      // =========================================
      // Right: School Sports Field (학교 옆 건물 없애고 운동장 전개!)
      // =========================================
      // Sand Track Ground (x: 320 to 1200)
      ctx.fillStyle = sat < 0.2 ? '#78716c' : '#d4a373';
      ctx.fillRect(320, GROUND_Y - 8, 880, 8);

      // Running Track White Chalk Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(330, GROUND_Y - 5);
      ctx.lineTo(1180, GROUND_Y - 5);
      ctx.stroke();

      // Flagpole with Korean Flag (x: 520)
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(520, GROUND_Y); ctx.lineTo(520, GROUND_Y - 140);
      ctx.stroke();
      ctx.fillStyle = sat < 0.2 ? '#e2e8f0' : '#ef4444';
      ctx.fillRect(522, GROUND_Y - 138, 24, 15);

      // Soccer Goal Post & Net (축구 골대 x: 680 to 770)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(680, GROUND_Y);
      ctx.lineTo(680, GROUND_Y - 60);
      ctx.lineTo(760, GROUND_Y - 60);
      ctx.lineTo(760, GROUND_Y);
      ctx.stroke();

      // Goal Net Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      for (let gx = 690; gx < 760; gx += 14) {
        ctx.beginPath();
        ctx.moveTo(gx, GROUND_Y); ctx.lineTo(gx, GROUND_Y - 60);
        ctx.stroke();
      }
      for (let gy = GROUND_Y - 50; gy < GROUND_Y; gy += 12) {
        ctx.beginPath();
        ctx.moveTo(680, gy); ctx.lineTo(760, gy);
        ctx.stroke();
      }

      // Sports Field Stand / Podium (조회대 x: 840 to 920)
      ctx.fillStyle = '#64748b';
      ctx.fillRect(840, GROUND_Y - 25, 75, 25);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(845, GROUND_Y - 30, 65, 5);
    }
  }
};

function createExtraMoment(config) {
  return {
    ...config,
    width: 64,
    height: 72,
    duration: 105,
    onTrigger(player) {
      player.state = 'EVENT';
      player.eventTimer = 0;
      player.eventMaxTime = this.duration;
      player.currentEvent = {
        id: this.id,
        onUpdate(p, timer) {
          if (timer % 18 === 0) {
            createParticle(p.x + 12, p.y - 42, (Math.random() - 0.5) * 1.4, -1.2, this.colorAura, 3, 28, 'sparkle');
          }
        },
        customDraw(ctx) {
          ctx.fillStyle = '#0c0e12';
          ctx.fillRect(-6, -16, 5, 16);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(2, -16, 5, 16);
          ctx.fillRect(-7, -38, 14, 23);
          ctx.fillStyle = this.colorAura;
          ctx.fillRect(-6, -40, 12, 5);
          ctx.fillStyle = '#15171d';
          ctx.fillRect(-5, -50, 11, 11);
        }
      };
      player.currentEvent.colorAura = this.colorAura;
    },
    draw(ctx) {
      const isDone = gameState.completedTasks.has(this.id);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = isDone ? this.colorAura : '#475569';
      ctx.beginPath();
      ctx.arc(0, -25, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(this.symbol, 0, -18);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(-14, -2, 28, 3);

      if (this === activeInteractable) {
        ctx.strokeStyle = this.colorAura;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-30, -55, 60, 58);
      }
      ctx.restore();
    }
  };
}

Object.assign(interactables, {
  morning_stretch: createExtraMoment({
    id: 'morning_stretch', name: '창가에서 아침 스트레칭하기', sceneName: '아늑한 내 방 (집)',
    badge: '🧘 아침 기지개', scene: 'home', x: 320, y: GROUND_Y, colorAura: '#f59e0b',
    symbol: '☀️', endingPath: 'warmth', thought: '창문을 열고 천천히 몸을 늘인다. 굳은 어깨에 아침 햇살이 포근하게 내려앉는다.'
  }),
  journal_entry: createExtraMoment({
    id: 'journal_entry', name: '책상에 오늘의 마음 적기', sceneName: '아늑한 내 방 (집)',
    badge: '✍️ 첫 문장', scene: 'home', x: 520, y: GROUND_Y, colorAura: '#60a5fa',
    symbol: '✎', endingPath: 'discovery', thought: '짧은 문장 하나로 오늘의 마음을 적어 둔다. 아직 오지 않은 하루가 조금 궁금해진다.'
  }),
  security_greeting: createExtraMoment({
    id: 'security_greeting', name: '경비 아저씨에게 먼저 인사하기', sceneName: '아파트 단지 & 주차장',
    badge: '👋 반가운 인사', scene: 'apartment_dense', x: 720, y: GROUND_Y, colorAura: '#fb7185',
    symbol: '👋', endingPath: 'warmth', thought: '짧은 인사에 경비 아저씨가 환하게 웃어 주신다. 늘 지나치던 길이 조금 가까워진다.'
  }),
  parking_cloudwatch: createExtraMoment({
    id: 'parking_cloudwatch', name: '주차장에서 구름 모양 찾기', sceneName: '아파트 단지 & 주차장',
    badge: '☁️ 구름 관찰', scene: 'apartment_dense', x: 1120, y: GROUND_Y, colorAura: '#38bdf8',
    symbol: '☁', endingPath: 'discovery', thought: '바쁜 걸음을 멈추고 구름을 올려다본다. 저 구름은 꼭 커다란 고래를 닮았다.'
  }),
  playground_slide: createExtraMoment({
    id: 'playground_slide', name: '미끄럼틀을 타고 내려오기', sceneName: '어린이 놀이터 & 문방구 상가',
    badge: '🛝 바람 타기', scene: 'store_playground', x: 390, y: GROUND_Y, colorAura: '#f97316',
    symbol: '↘', endingPath: 'freedom', thought: '미끄럼틀 꼭대기에서 잠깐 망설이다 몸을 맡긴다. 바람을 가르며 내려오는 순간, 웃음이 터진다.'
  }),
  playground_friend: createExtraMoment({
    id: 'playground_friend', name: '놀이터 친구와 공 주고받기', sceneName: '어린이 놀이터 & 문방구 상가',
    badge: '⚽ 함께한 공', scene: 'store_playground', x: 650, y: GROUND_Y, colorAura: '#34d399',
    symbol: '⚽', endingPath: 'warmth', thought: '처음 보는 아이와 공을 주고받는다. 이름은 몰라도 함께 웃은 순간은 오래 기억날 것 같다.'
  }),
  study_pause: createExtraMoment({
    id: 'study_pause', name: '학원가 골목에서 잠깐 눈 감기', sceneName: '빽빽한 학원가 거리',
    badge: '🌿 짧은 쉼표', scene: 'academy_dense', x: 560, y: GROUND_Y, colorAura: '#4ade80',
    symbol: '…', endingPath: 'discovery', thought: '쏟아지는 간판과 발걸음 소리 사이에서 잠시 눈을 감는다. 내 호흡이 다시 들린다.'
  }),
  street_melody: createExtraMoment({
    id: 'street_melody', name: '거리의 작은 음악에 귀 기울이기', sceneName: '빽빽한 학원가 거리',
    badge: '🎵 거리의 선율', scene: 'academy_dense', x: 1040, y: GROUND_Y, colorAura: '#c084fc',
    symbol: '♫', endingPath: 'warmth', thought: '어디선가 흘러나온 익숙한 멜로디에 발걸음을 늦춘다. 하루가 잠깐 다정해진다.'
  }),
  soccer_practice: createExtraMoment({
    id: 'soccer_practice', name: '운동장에서 골대 향해 슛하기', sceneName: '학교 교문 & 운동장',
    badge: '🥅 힘찬 슛', scene: 'school_field', x: 720, y: GROUND_Y, colorAura: '#facc15',
    symbol: '⚽', endingPath: 'freedom', thought: '발끝으로 공을 힘껏 차 올린다. 골대를 향해 날아가는 공처럼 마음도 가벼워진다.'
  }),
  cheer_team: createExtraMoment({
    id: 'cheer_team', name: '운동장 친구들에게 응원 보내기', sceneName: '학교 교문 & 운동장',
    badge: '📣 힘이 되는 응원', scene: 'school_field', x: 900, y: GROUND_Y, colorAura: '#fb7185',
    symbol: '!', endingPath: 'warmth', thought: '힘차게 응원을 보내자 친구들이 손을 흔든다. 서로를 북돋우는 목소리가 운동장에 울린다.'
  })
});

const endingPaths = {
  breeze: 'discovery', cat: 'warmth', flower: 'discovery', swing: 'freedom', gacha: 'freedom',
  snack: 'warmth', sprint: 'freedom', bookstore: 'discovery', cherry_wish: 'warmth', hilltop_sky: 'discovery'
};
Object.entries(endingPaths).forEach(([id, path]) => {
  interactables[id].endingPath = path;
});

const endingStories = {
  freedom: {
    name: '자유의 엔딩',
    badge: '✨ 내 마음이 향하는 곳으로',
    title: '바람을 따라, 나만의 속도로',
    description: '오늘은 해야 할 일보다 마음이 먼저 향하는 곳을 따라 걸었습니다. 마음껏 뛰고 웃었던 순간들이 내일의 걸음을 조금 더 가볍게 만듭니다.'
  },
  warmth: {
    name: '온기의 엔딩',
    badge: '💛 서로에게 건넨 작은 온기',
    title: '다정함이 이어 준 하루',
    description: '먼저 건넨 인사와 함께 나눈 웃음이 하루를 바꾸었습니다. 작고 다정한 순간들은 서로의 마음에 남아 따뜻한 길을 만듭니다.'
  },
  discovery: {
    name: '발견의 엔딩',
    badge: '🌱 익숙한 곳에서 찾은 새로운 마음',
    title: '늘 걷던 길에서 발견한 나',
    description: '잠시 멈춰 바라본 풍경과 마음속에 남긴 문장들이 새로운 생각을 열었습니다. 익숙한 동네에서 발견한 작은 변화가 나만의 다음 길이 됩니다.'
  }
};

// Current Active Scene (START AT HOME!)
let currentSceneId = 'home';
let currentScene = scenes[currentSceneId];

function changeScene(sceneId, spawnX) {
  if (!scenes[sceneId]) return;
  currentSceneId = sceneId;
  currentScene = scenes[sceneId];
  player.x = spawnX;
  player.state = 'IDLE';

  // Update Location Badge HUD
  document.getElementById('location-badge').textContent = `📍 ${currentScene.name}`;

  // Center camera
  camera.x = Math.max(0, Math.min(currentScene.width - camera.width, player.x - camera.width / 2));
}

// Interaction Handlers
function startInteraction(obj) {
  if (gameState.isInteracting || gameState.isEnding) return;
  if (obj.completed && !obj.isSpecialTransition) return;

  gameState.isInteracting = true;
  window.soundEngine.playInteractionSelect();

  if (obj.thought) {
    const narrationBox = document.getElementById('narration-box');
    narrationBox.textContent = obj.thought;
    narrationBox.classList.add('active');
  }

  obj.onTrigger(player);
}

function finishInteraction() {
  const currentEventId = player.currentEvent?.id;
  const obj = Object.values(interactables).find(o => o.id === currentEventId);

  if (obj && !obj.isSpecialTransition && !gameState.completedTasks.has(obj.id)) {
    gameState.completedTasks.add(obj.id);
    obj.completed = true;
    gameState.lastCompletedPath = obj.endingPath;

    gameState.globalSaturation = Math.min(1.0, gameState.completedTasks.size / gameState.endingThreshold);

    window.soundEngine.playProgressMilestone();

    // Check Badges
    if (!gameState.unlockedBadges.includes(obj.id)) {
      gameState.unlockedBadges.push(obj.id);
      localStorage.setItem('different_day_badges', JSON.stringify(gameState.unlockedBadges));
    }

    updateHUD();
    updateChecklistModal();
  }

  const narrationBox = document.getElementById('narration-box');
  narrationBox.classList.remove('active');

  player.state = 'IDLE';
  player.currentEvent = null;
  gameState.isInteracting = false;

  if (gameState.completedTasks.size >= gameState.endingThreshold) {
    triggerGrandEndingSequence();
  }
}

function determineEndingPath() {
  const counts = { freedom: 0, warmth: 0, discovery: 0 };
  gameState.completedTasks.forEach(id => {
    const path = interactables[id]?.endingPath;
    if (path) counts[path]++;
  });

  const highestCount = Math.max(...Object.values(counts));
  const leadingPaths = Object.keys(counts).filter(path => counts[path] === highestCount);
  return leadingPaths.includes(gameState.lastCompletedPath)
    ? gameState.lastCompletedPath
    : leadingPaths[0];
}

function updateHUD() {
  const count = gameState.completedTasks.size;
  const total = gameState.tasksTotal;
  const percent = Math.round((count / total) * 100);

  const progressBar = document.getElementById('progress-bar');
  const progressNumber = document.getElementById('progress-number');
  if (progressBar) progressBar.style.width = `${percent}%`;
  if (progressNumber) progressNumber.textContent = `${count} / ${total} (${percent}%)`;
}

// 20-Task Checklist Modal Updates
function updateChecklistModal() {
  const listContainer = document.getElementById('checklist-items');
  listContainer.innerHTML = '';

  Object.values(interactables).forEach(task => {
    if (task.isSpecialTransition) return; // Skip home door

    const isDone = gameState.completedTasks.has(task.id);
    const item = document.createElement('div');
    item.className = `task-item ${isDone ? 'completed' : ''}`;
    item.innerHTML = `
      <div class="task-check">${isDone ? '✓' : ''}</div>
      <div class="task-info">
        <span class="task-name">${task.name}</span>
        <span class="task-scene">📍 ${task.sceneName}</span>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

function toggleChecklistModal(forceState) {
  const modal = document.getElementById('checklist-modal');
  if (forceState !== undefined) {
    gameState.checklistOpen = forceState;
  } else {
    gameState.checklistOpen = !gameState.checklistOpen;
  }

  if (gameState.checklistOpen) {
    updateChecklistModal();
    modal.classList.add('active');
  } else {
    modal.classList.remove('active');
  }
}

// Grand Ending Sequence (5 of 20 Moments)
function triggerGrandEndingSequence() {
  gameState.selectedEnding = determineEndingPath();
  gameState.isEnding = true;
  player.state = 'IDLE';

  for (let i = 0; i < 40; i++) {
    createParticle(
      player.x + (Math.random() - 0.5) * 80,
      player.y - 40 + (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 4,
      -2 - Math.random() * 3,
      ['#fcd34d', '#f43f5e', '#38bdf8', '#a855f7', '#22c55e'][i % 5],
      4,
      50,
      'sparkle'
    );
  }

  window.soundEngine.playTenCompleteFanfare();

  setTimeout(() => {
    showEndingModal();
  }, 1400);
}

function showEndingModal() {
  const ending = endingStories[gameState.selectedEnding];
  const endingModal = document.getElementById('ending-modal');
  endingModal.dataset.ending = gameState.selectedEnding;
  document.getElementById('ending-badge').textContent = ending.badge;
  document.getElementById('ending-title').textContent = ending.title;
  document.getElementById('ending-desc').textContent = ending.description;

  const choicesList = document.getElementById('choices-list');
  choicesList.innerHTML = '';

  gameState.completedTasks.forEach(id => {
    const task = interactables[id];
    const item = document.createElement('div');
    item.className = 'choice-item';
    item.innerHTML = `<span class="choice-bullet">✓</span> <span>${task.name}</span>`;
    choicesList.appendChild(item);
  });
  document.getElementById('choices-summary-title').textContent = `오늘 달성한 순간 (${gameState.completedTasks.size} / ${gameState.tasksTotal})`;

  const badgesGrid = document.getElementById('badges-grid');
  badgesGrid.innerHTML = '';

  Object.values(interactables).forEach(task => {
    if (task.isSpecialTransition) return;
    const isUnlocked = gameState.unlockedBadges.includes(task.id);
    const card = document.createElement('div');
    card.className = `badge-card ${isUnlocked ? 'unlocked' : ''}`;
    const [icon, name] = task.badge.split(' ');
    card.innerHTML = `
      <span class="badge-icon">${icon}</span>
      <span class="badge-name">${name}</span>
    `;
    badgesGrid.appendChild(card);
  });
  document.getElementById('badges-title').textContent = `🏆 일상 달성 배지 (${gameState.unlockedBadges.length} / ${gameState.tasksTotal} 해금)`;

  endingModal.classList.add('active');
}

function resetGame() {
  gameState.completedTasks.clear();
  gameState.isInteracting = false;
  gameState.isEnding = false;
  gameState.selectedEnding = null;
  gameState.lastCompletedPath = null;
  gameState.globalSaturation = 0;

  Object.values(interactables).forEach(obj => obj.completed = false);

  changeScene('home', 160);

  updateHUD();
  updateChecklistModal();
  const endingModal = document.getElementById('ending-modal');
  endingModal.classList.remove('active');
  delete endingModal.dataset.ending;
  document.getElementById('narration-box').classList.remove('active');
  toggleChecklistModal(false);
}

// Particle Engine Update & Draw
function updateAndDrawParticles(ctx) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life--;

    const alpha = p.life / p.maxLife;

    if (p.type === 'heart') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    } else if (p.type === 'petal') {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 4);
    } else if (p.type === 'speed') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 6, p.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }

    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
  ctx.globalAlpha = 1.0;
}

// Draw Ground & Pavement
function drawPavement(ctx, scene, sat) {
  if (scene.id === 'home') return; // Handled inside home drawBackground

  // Ground
  const groundColor = sat < 0.2 ? '#3b404d' : `rgb(${Math.round(59 + sat * 18)}, ${Math.round(64 + sat * 16)}, ${Math.round(77 + sat * 14)})`;
  ctx.fillStyle = groundColor;
  ctx.fillRect(-100, GROUND_Y, scene.width + 200, canvas.height - GROUND_Y + 100);

  // Curb Line
  ctx.fillStyle = sat < 0.2 ? '#646b7a' : '#7d8799';
  ctx.fillRect(-100, GROUND_Y + 4, scene.width + 200, 5);

  // Sidewalk Blocks Pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let bx = -50; bx < scene.width + 100; bx += 36) {
    ctx.beginPath();
    ctx.moveTo(bx, GROUND_Y);
    ctx.lineTo(bx - 14, GROUND_Y + 120);
    ctx.stroke();
  }

  // Crosswalk Stripes (Placed exactly to the right of the traffic light at x: 240)
  if (scene.id === 'academy_dense') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    // From x: 260 to x: 520 (Right next to sprint object!)
    for (let zw = 260; zw <= 520; zw += 24) {
      ctx.fillRect(zw, GROUND_Y + 14, 15, 45);
    }
  }
}

// Main Game Loop
function gameLoop() {
  player.update(currentScene);
  camera.update(player.x, currentScene.width);
  sceneTransition.update();

  // Proximity Detection
  activeInteractable = null;

  if (!gameState.isInteracting && !gameState.isEnding && !sceneTransition.active) {
    let closestDist = INTERACTION_DISTANCE;
    for (const objKey of currentScene.interactables) {
      const obj = interactables[objKey];
      if (!obj) continue;
      if (obj.completed && !obj.isSpecialTransition) continue;

      const dist = Math.abs(player.x - obj.x);
      if (dist <= closestDist) {
        closestDist = dist;
        activeInteractable = obj;
      }
    }
  }

  // Update In-World Proximity Prompt Position
  const promptEl = document.getElementById('proximity-prompt');
  const promptText = document.getElementById('prompt-text');
  const canvasRect = canvas.getBoundingClientRect();

  if (activeInteractable) {
    const screenX = ((activeInteractable.x - camera.x) * VIEW_ZOOM) * (canvasRect.width / canvas.width);
    const screenY = ((activeInteractable.y - activeInteractable.height - 25) * VIEW_ZOOM) * (canvasRect.height / canvas.height);

    promptEl.style.left = `${screenX}px`;
    promptEl.style.top = `${screenY}px`;
    promptText.textContent = `${activeInteractable.name}`;
    promptEl.classList.add('visible');
  } else {
    promptEl.classList.remove('visible');
  }

  // Render Frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(VIEW_ZOOM, VIEW_ZOOM);
  ctx.translate(-camera.x, 0);

  // 1. Scene Background Architecture
  currentScene.drawBackground(ctx, gameState.globalSaturation);

  // 2. Pavement & Ground
  drawPavement(ctx, currentScene, gameState.globalSaturation);

  // 3. Interactive Objects
  for (const objKey of currentScene.interactables) {
    const obj = interactables[objKey];
    if (obj) obj.draw(ctx);
  }

  // 4. Player Character
  player.draw(ctx);

  // 5. Particle Effects
  updateAndDrawParticles(ctx);

  ctx.restore();

  // Screen Fade Transition
  sceneTransition.draw(ctx);

  requestAnimationFrame(gameLoop);
}

// Keyboard Event Handlers (Strictly Keyboard-Only Controls)
window.addEventListener('keydown', (e) => {
  window.soundEngine.ensureResume();

  // Ending Modal Key Controls
  if (gameState.isEnding) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'r' || e.key === 'R') {
      resetGame();
    }
    return;
  }

  // Checklist Modal Toggle
  if (e.key === 'Tab') {
    e.preventDefault();
    toggleChecklistModal();
    return;
  }
  if (e.key === 'Escape' && gameState.checklistOpen) {
    toggleChecklistModal(false);
    return;
  }

  if (gameState.checklistOpen) return;

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

  // Interaction with Space / E / Enter / F
  if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter' || e.key === 'f' || e.key === 'F') {
    if (gameState.isInteracting || sceneTransition.active) return;

    if (activeInteractable) {
      player.state = 'IDLE';
      player.vx = 0;
      player.facing = activeInteractable.x > player.x ? 1 : -1;
      startInteraction(activeInteractable);
    }
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

// UI Buttons
document.getElementById('audio-toggle').addEventListener('click', () => {
  const isMuted = window.soundEngine.toggleMute();
  document.getElementById('audio-icon').textContent = isMuted ? '🔇' : '🔊';
});

const checklistToggleBtn = document.getElementById('checklist-toggle-btn');
if (checklistToggleBtn) {
  checklistToggleBtn.addEventListener('click', () => {
    toggleChecklistModal();
  });
}

document.getElementById('checklist-close-btn').addEventListener('click', () => {
  toggleChecklistModal(false);
});

document.getElementById('restart-btn').addEventListener('click', () => {
  resetGame();
});

// Responsive Aspect Ratio Scaling
function handleResize() {
  const container = document.getElementById('game-container');
  const targetAspect = 16 / 9;
  let w = container.clientWidth;
  let h = container.clientHeight;

  if (w / h > targetAspect) {
    w = h * targetAspect;
  } else {
    h = w / targetAspect;
  }

  canvas.style.width = `${Math.floor(w)}px`;
  canvas.style.height = `${Math.floor(h)}px`;
}

window.addEventListener('resize', handleResize);
handleResize();

// Initialize HUD and Checklist
updateHUD();
updateChecklistModal();

// Start Game Loop
requestAnimationFrame(gameLoop);
