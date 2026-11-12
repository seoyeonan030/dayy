/** 오늘은 조금 다른 하루: 횡스크롤 동네 탐험 */

const canvas = document.getElementById('viewport');
const ctx = canvas.getContext('2d');

const VIEW_ZOOM = 1;
const GROUND_Y = canvas.height;
const PLAYER_BASE_Y = GROUND_Y;
const PLANTER_SHIFT = 112;
const PLANTER_RAISE = 48;
const PLANTER_DROP = 48;
const FLOWER_CENTER = 274.75;
const FLOWER_CENTER_TOP = 210;
const WINDOW_COLOR = '#dedede';
const BUS_STOP_LEFT_SHIFT = 40;
const BUS_WIDTH = 697;
const BUS_STOP_POSITION = 920 - BUS_STOP_LEFT_SHIFT - BUS_WIDTH;
const BUS_STOP_DEPART_POSITION = 960 - (BUS_STOP_POSITION + BUS_WIDTH);

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
  sitting: null,
  stepCooldown: 0,

  update(currentScene) {
    this.idlePhase += 0.035;

    if (gameFlow.mode === 'crossing') {
      this.vx = 0;
      this.facing = 1;
      this.state = 'WALK';
      this.walkPhase += 0.12;
      this.handleFootsteps();
      return;
    }

    if (sceneTransition.active || ((currentScene.id === 'elevator' || currentScene.id === 'floor1_elevator') && elevatorRide.startedAt !== null) ||
      (busArrival.state === 'departing' &&
        (currentScene.id === 'bus_stop' || busArrival.departureTarget === currentScene.id)) ||
        (currentScene.id === 'bus' && busJourney.state === 'moving')) {
      this.vx = 0;
      return;
    }

    if (this.sitting) {
      if (this.sitting.seatId === 'school_board_desk_seat' && gameFlow.schoolClassStartedAt !== null) {
        this.vx = 0;
        return;
      }
      if (!keys.left && !keys.right) {
        this.vx = 0;
        return;
      }
      standPlayerUp();
    }

    if (keys.left && !keys.right) {
      this.vx = -this.speed * (keys.speedBoost ? 6 : 1);
      this.facing = -1;
      this.state = 'WALK';
      this.walkPhase += 0.12;
      this.handleFootsteps();
    } else if (keys.right && !keys.left) {
      this.vx = this.speed * (keys.speedBoost ? 6 : 1);
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
    if (currentScene.id === 'school_board' && currentScene.leftExit && this.x <= 25 && gameFlow.schoolClassesAttended < 2) {
      this.x = 40;
      this.vx = 0;
      this.state = 'IDLE';
      gameFlow.dialogue = gameFlow.schoolClassesAttended === 0
        ? '오전 수업을 들어야 교실을 나갈 수 있다.'
        : '오후 수업을 들어야 교실을 나갈 수 있다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue', 1500);
      return;
    }
    if (currentScene.id === 'home_front' && !gameFlow.schoolAccessUnlocked && this.vx < 0 && this.x <= 75) {
      this.x = 85;
      this.vx = 0;
      this.state = 'IDLE';
      gameFlow.dialogue = '학교에 가야 한다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue');
      return;
    }
    if (currentScene.id === 'living_room' && !gameFlow.ateToday && !gameFlow.skipMealGate &&
        ((currentScene.leftExit && this.x <= 25) || (currentScene.rightExit && this.x >= currentScene.width - 25))) {
      this.x = Math.max(26, Math.min(currentScene.width - 26, this.x));
      this.vx = 0;
      this.state = 'IDLE';
      gameFlow.dialogue = '배가 고프다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue', 1500);
      return;
    }
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
    const elevatorElapsed = (currentSceneId === 'elevator' || currentSceneId === 'floor1_elevator') && elevatorRide.startedAt !== null
      ? performance.now() - elevatorRide.startedAt
      : -1;
    if (elevatorElapsed >= 2350) return;
    const elevatorArrivalElapsed = (currentSceneId === 'elevator' || currentSceneId === 'floor1_elevator') && elevatorArrival.startedAt !== null
      ? performance.now() - elevatorArrival.startedAt
      : -1;
    if (elevatorArrivalElapsed >= 0 && elevatorArrivalElapsed < 1600) return;
    const activityMotion = gameFlow.mode === 'dialogue' ? gameFlow.activityMotion : null;
    if (this.sitting) {
      ctx.save();
      ctx.translate(this.x, this.sitting.seatY);
      ctx.scale(this.facing * scale, scale);
      ctx.fillStyle = '#ffffff';
      const torsoLength = this.sitting.seatId === 'bus_stop_bench' ? 15 : 22;
      ctx.fillRect(-2.5, -torsoLength - 11, 8.5, 11);
      ctx.fillRect(-2.5, -torsoLength, 4, torsoLength);
      if (activityMotion === 'cat') {
        const strokeOffset = Math.sin(performance.now() / 120) * 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.3;
        ctx.beginPath();
        ctx.moveTo(1, -torsoLength + 3);
        ctx.lineTo(13, -10);
        ctx.lineTo(25 + strokeOffset, -7);
        ctx.stroke();
      } else if (activityMotion === 'cereal') {
        const spoonProgress = (1 + Math.cos(performance.now() / 240)) / 2;
        const handX = 7 + 14 * spoonProgress;
        const handY = -26 + 12 * spoonProgress;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.3;
        ctx.beginPath();
        ctx.moveTo(1, -19);
        ctx.lineTo(8, -14);
        ctx.lineTo(handX, handY);
        ctx.stroke();
        ctx.strokeStyle = '#777777';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(handX + 3, handY + 1);
        ctx.stroke();
        ctx.fillStyle = '#777777';
        ctx.fillRect(handX + 2.5, handY, 2, 2);
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillRect(0, -torsoLength + 3, 3.3, torsoLength - 6);
      }
      ctx.fillRect(-2.5, -3, 11, 4);
      ctx.fillRect(5, 0, 4, (GROUND_Y - this.sitting.seatY) / scale);
      ctx.fillRect(5, (GROUND_Y - this.sitting.seatY) / scale - 2.5, 7, 2.5);
      ctx.restore();
      return;
    }
    const bob = (this.state === 'WALK')
      ? Math.abs(Math.sin(this.walkPhase)) * 2.2
      : Math.sin(this.idlePhase) * 1.0;

    ctx.save();
    ctx.translate(this.x, this.y - scale * (1.5 + bob));
    ctx.scale(this.facing * scale, scale);

    const gait = this.state === 'WALK' ? Math.sin(this.walkPhase * 0.5) : 0;
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

    drawLimb(-0.5, -14, 15, legWidth, -legSwing, true);
    if (activityMotion === 'flower') {
      ctx.save();
      ctx.translate(-0.5, -14 + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2, -25, bodyWidth, 25);
      ctx.fillRect(-2, -36, 8.5, 11);
      ctx.fillRect(0, -21, armWidth, 18);
      ctx.restore();
    } else {
      drawLimb(-2.5, -35, 18, armWidth, armSwing);
      ctx.fillRect(-2.5, -39 + bob, bodyWidth, 25);
      ctx.fillRect(-2.5, -50 + bob, 8.5, 11);
      if (activityMotion === 'guard') {
        drawLimb(1, -35, 18, armWidth, -2.3 + Math.sin(performance.now() / 120) * 0.3);
      } else if (activityMotion === 'cat') {
        drawLimb(1, -35, 24, armWidth, -0.9 + Math.sin(performance.now() / 120) * 0.12);
      } else if (activityMotion === 'dishes') {
        drawLimb(1, -35, 19, armWidth, -0.8 + Math.sin(performance.now() / 130) * 0.22);
      } else {
        drawLimb(1, -35, 18, armWidth, -armSwing);
      }
    }
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
    rightExit: { target: 'living_room', spawnX: 70 },
  },
  living_room: {
    id: 'living_room',
    name: '거실과 부엌',
    width: 960,
    leftExit: { target: 'home', spawnX: 900 },
    rightExit: { target: 'apartment_hallway', spawnX: 480 },
  },
  apartment_hallway: {
    id: 'apartment_hallway',
    name: '아파트 현관',
    width: 960,
    leftExit: null,
    rightExit: { target: 'elevator', spawnX: 70 },
  },
  elevator: {
    id: 'elevator',
    name: '엘리베이터',
    width: 960,
    leftExit: { target: 'apartment_hallway', spawnX: 900 },
    rightExit: null,
  },
  floor1_elevator: {
    id: 'floor1_elevator',
    name: '1층 엘리베이터',
    width: 960,
    leftExit: null,
    rightExit: { target: 'home_front', spawnX: 70 },
  },
  home_front: {
    id: 'home_front',
    name: '집 앞',
    width: 960,
    leftExit: { target: 'floor1_elevator', spawnX: 900 },
    rightExit: { target: 'bus_stop', spawnX: 70 },
  },
  bus_stop: {
    id: 'bus_stop',
    name: '버스 정류장',
    width: 960,
    leftExit: { target: 'home_front', spawnX: 900 },
    rightExit: null,
  },
  bus: {
    id: 'bus',
    name: '버스 안',
    width: 960,
    leftExit: null,
    rightExit: null,
  },
  refrigerator: {
    id: 'refrigerator',
    name: '냉장고 퍼즐',
    width: 960,
    leftExit: null,
    rightExit: null,
  },
  street: {
    id: 'street',
    name: '학원과 가게가 있는 거리',
    width: 960,
    leftExit: { target: 'academy', spawnX: 900 },
    rightExit: { target: 'school_field', spawnX: 70 },
  },
  academy: {
    id: 'academy',
    name: '학원',
    width: 960,
    leftExit: { target: 'home_front', spawnX: 900 },
    rightExit: { target: 'school', spawnX: 70 },
  },
  school_field: {
    id: 'school_field',
    name: '학교 정류장',
    width: 960,
    leftExit: { target: 'academy', spawnX: 900 },
    rightExit: { target: 'school', spawnX: 70 },
  },
  sea_stop: {
    id: 'sea_stop',
    name: '바다 정류장',
    width: 960,
    leftExit: null,
    rightExit: { target: 'sea', spawnX: 70 },
  },
  sea: {
    id: 'sea',
    name: '바다',
    width: 960,
    leftExit: { target: 'sea_stop', spawnX: 900 },
    rightExit: null,
  },
  school: {
    id: 'school',
    name: '학교',
    width: 960,
    leftExit: { target: 'academy', spawnX: 900 },
    rightExit: null,
  },
  school_board: {
    id: 'school_board',
    name: '초록 칠판 교실',
    width: 960,
    leftExit: { target: 'school', spawnX: 722 },
    rightExit: null,
  },
};

const gameFlow = {
  completed: new Set(),
  breakfastBowl: 'none',
  ateToday: false,
  skipMealGate: false,
  cerealEver: false,
  leftChairSat: false,
  fridgeUnlocked: false,
  breakfastEver: false,
  fridgeEver: false,
  dishesPrompted: false,
  visitedSchool: false,
  schoolAccessUnlocked: false,
  schoolClassesAttended: 0,
  schoolBreakTalked: false,
  schoolClassStartedAt: null,
  day: 1,
  mode: null,
  selectedEnding: null,
  finale: null,
  nearby: null,
  monitorTask: null,
};
let lastFlowFrame = performance.now();
let busStopSignalStartedAt = 0;
function isCrossingSignalRed() {
  return (performance.now() - busStopSignalStartedAt) % 10000 < 7000;
}
const busArrival = { state: 'waiting', x: -697, idleSince: null, departureTarget: null };
const elevatorRide = { startedAt: null, startX: 0, destination: null };
const elevatorArrival = { startedAt: null, pendingDestination: null };
const busStopHint = { firstSeatAt: null, shown: false };
const busJourney = { state: 'boarding', stopIndex: 0, departAt: null, bellPressed: false, sceneryOffset: 0, movingUntil: 0, standingSince: null, safetyWarned: false, stopStartedAt: null };
const busStops = ['따분함', '지루함', '똑같음', '학교', '바다'];

const sceneActivities = {
  home: [
    { id: 'cactus', x: 763, bounds: { x: 749, y: 144, width: 29, height: 64 }, label: '선인장에게 말 걸기', text: '선인장에게 말을 걸어본다. 오늘도 잘 지내자.' },
    { id: 'monitor', x: 890, bounds: { x: 850, y: 126, width: 80, height: 66 }, label: '모니터 과제 하기', kind: 'monitor' },
  ],
  bus: [
    { id: 'bus_exit', x: 846, bounds: { x: 758, y: 58, width: 176, height: 262 }, label: '버스에서 내리기', kind: 'leaveBus' },
    { id: 'bus_bell_1', x: 381, bounds: { x: 372, y: 112, width: 18, height: 18 }, label: '하차벨 누르기', kind: 'busBell' },
    { id: 'bus_bell_2', x: 742, bounds: { x: 733, y: 112, width: 18, height: 18 }, label: '하차벨 누르기', kind: 'busBell' },
    ...Array.from({ length: 4 }, (_, seatIndex) => {
      const chairX = 56 + seatIndex * 180;
      return { id: `bus_seat_${seatIndex}`, x: chairX + 25, bounds: { x: chairX, y: 177, width: 50, height: 143 }, label: '버스 의자에 앉기', kind: 'seat', seatX: chairX + 25, seatY: 248 };
    }),
  ],
  living_room: [
    { id: 'kitchen_chair', x: 573, bounds: { x: 548, y: 177, width: 50, height: 143 }, label: '의자에 앉기', kind: 'seat', seatX: 573, seatY: 248 },
    { id: 'right_chair', x: 888, bounds: { x: 863, y: 177, width: 50, height: 143 }, label: '의자에 앉기', kind: 'seat', seatX: 888, seatY: 248, facing: -1 },
    { id: 'cereal', x: 663, bounds: { x: 642, y: 192, width: 42, height: 16 }, label: '시리얼 먹기', kind: 'seatedTask', seatId: 'kitchen_chair', text: '매일 먹는 시리얼을 챙겨 먹는다.' },
    { id: 'breakfast', x: 805, bounds: { x: 784, y: 192, width: 42, height: 16 }, label: '아침밥 먹기', kind: 'seatedTask', seatId: 'right_chair', text: '아침밥을 먹는다. 든든하게 하루를 시작한다.' },
    { id: 'fridge', x: 55, bounds: { x: 0, y: 70, width: 111, height: 250 }, label: '아침밥 준비하기', kind: 'fridge' },
    { id: 'dishes', x: 185, bounds: { x: 133, y: 165, width: 99, height: 27 }, label: '설거지하기', kind: 'dishes', text: '사용한 그릇을 깨끗이 씻는다. 부엌이 한결 산뜻해졌다.' },
  ],
  apartment_hallway: [
    { id: 'apartment_door_888', x: 480, bounds: { x: 420, y: 84, width: 120, height: 236 }, label: '888호 들어가기', kind: 'apartmentDoor' },
  ],
  elevator: [
    { id: 'elevator_door', x: 480, bounds: { x: 358, y: 84, width: 244, height: 236 }, label: '엘리베이터 타기', kind: 'elevatorDoor' },
    { id: 'stairs_door', x: 839, bounds: { x: 779, y: 84, width: 120, height: 236 }, label: '계단으로 내려가기', kind: 'stairDoor' },
  ],
  floor1_elevator: [
    { id: 'elevator_door', x: 480, bounds: { x: 358, y: 84, width: 244, height: 236 }, label: '엘리베이터 타기', kind: 'elevatorDoor' },
    { id: 'stairs_door', x: 839, bounds: { x: 779, y: 84, width: 120, height: 236 }, label: '계단으로 나가기', kind: 'stairDoor' },
  ],
  home_front: [
    { id: 'flower', x: FLOWER_CENTER + PLANTER_SHIFT, bounds: { x: FLOWER_CENTER + PLANTER_SHIFT - 14, y: FLOWER_CENTER_TOP - PLANTER_RAISE + PLANTER_DROP, width: 28, height: 264 - FLOWER_CENTER_TOP }, label: '꽃 향기 맡기', text: '꽃 향기를 맡아본다. 생각보다 좋은 냄새가 난다. 기분이 조금 좋아진 것 같다.' },
    { id: 'guard', x: 852, bounds: { x: 764, y: 88, width: 176, height: 138 * 0.7 }, label: '경비 아저씨와 인사하기', text: '먼저 인사를 건넨다. 안녕하세요. 평소보다 기분 좋게 길을 나선다.' },
  ],
  bus_stop: [
    { id: 'crossing_signal', x: 53, bounds: { x: 30, y: 48, width: 46, height: 272 }, label: '횡단보도 건너기', kind: 'crossing' },
    { id: 'bus_stop_bench', x: 650 - BUS_STOP_LEFT_SHIFT, bounds: { x: 585 - BUS_STOP_LEFT_SHIFT, y: 255, width: 260, height: 65 }, label: '정류장 의자에 앉기', kind: 'seat', seatX: 650 - BUS_STOP_LEFT_SHIFT, seatY: 255 },
    { id: 'cat', x: 770 - BUS_STOP_LEFT_SHIFT, bounds: { x: 745 - BUS_STOP_LEFT_SHIFT, y: 228, width: 74, height: 27 }, label: '고양이 쓰다듬기', text: '고양이를 조심스럽게 쓰다듬는다. 따뜻한 온기가 손끝에 전해진다.' },
  ],
  street: [
    { id: 'sign', x: 180, bounds: { x: 30, y: 92, width: 280, height: 34 }, label: '간판 자세히 보기', text: '늘 지나치던 간판을 찬찬히 바라본다. 이런 그림이 있었구나.' },
    { id: 'poem', x: 420, bounds: { x: 388, y: 130, width: 182, height: 86 }, label: '서점의 시 읽기', text: '유리창 너머의 짧은 문장을 읽는다. 오늘은 천천히 가도 괜찮아.' },
    { id: 'sky', x: 760, bounds: { x: 718, y: 24, width: 98, height: 42 }, label: '하늘 바라보기', kind: 'happy', text: '잠시 걸음을 멈추고 하늘을 바라본다. 구름이 천천히 흘러간다.' },
  ],
  school_field: [],
  sea_stop: [],
  sea: [],
  school: [
    { id: 'school_main_door', x: 722, bounds: { x: 600, y: 84, width: 244, height: 236 }, label: '학교 안으로 들어가기', kind: 'schoolDoor' },
  ],
  school_board: [
    { id: 'school_board_desk_seat', x: 628.875, bounds: { x: 538.5, y: 216, width: 180.75, height: 104 }, label: '수업 듣기 위해 앉기', kind: 'seat', seatX: 628.875, seatY: 260, facing: -1 },
    { id: 'school_break_friend', x: 809.625, bounds: { x: 784, y: 220, width: 52, height: 100 }, label: '친구와 쉬는 시간 보내기', kind: 'schoolBreakFriend' },
  ],
  academy: [],
};

// Current Active Scene (START AT HOME!)
let currentSceneId = 'home';
let currentScene = scenes[currentSceneId];

function changeScene(sceneId, spawnX) {
  if (!scenes[sceneId]) return;
  const previousSceneId = currentSceneId;
  const disembarkingBus = sceneId === 'bus_stop' && previousSceneId === 'bus' && busArrival.departureTarget !== null;
  if (sceneId === 'bus' && previousSceneId === 'bus_stop' && busArrival.state === 'departing') {
    setFlowMode(null);
  }
  currentSceneId = sceneId;
  currentScene = scenes[sceneId];
  elevatorRide.startedAt = null;
  elevatorRide.destination = null;
  elevatorArrival.startedAt = elevatorArrival.pendingDestination === sceneId ? performance.now() : null;
  elevatorArrival.pendingDestination = null;
  if (sceneId === 'bus') {
    busJourney.state = 'boarding';
    busJourney.stopIndex = 0;
    busJourney.departAt = null;
    busJourney.bellPressed = false;
    busJourney.sceneryOffset = 0;
    busJourney.standingSince = null;
    busJourney.safetyWarned = false;
    busJourney.stopStartedAt = null;
  }
  if (sceneId === 'school') {
    gameFlow.visitedSchool = true;
    gameFlow.schoolAccessUnlocked = true;
  }
  if (sceneId === 'bus_stop') {
    busStopSignalStartedAt = performance.now();
    if (!disembarkingBus) {
      busArrival.state = 'waiting';
      busArrival.x = -BUS_WIDTH;
      busArrival.departureTarget = null;
    }
    busArrival.idleSince = null;
    busStopHint.firstSeatAt = null;
    busStopHint.shown = false;
  }
  player.x = spawnX;
  if (sceneId === 'apartment_hallway' && previousSceneId === 'living_room') player.x = 480;
  if (player.sitting?.seatId === 'kitchen_chair') gameFlow.leftChairSat = false;
  player.y = PLAYER_BASE_Y;
  player.state = 'IDLE';
  player.sitting = null;

  if (sceneId === 'refrigerator') {
    resetRefrigeratorPuzzle();
    setFlowMode('puzzle');
  } else if (sceneId === 'living_room' && previousSceneId === 'refrigerator' && gameFlow.breakfastBowl === 'carried') {
    gameFlow.dialogue = '아침밥을 해 먹었다. 기분 좋게 하루를 시작해보자.';
    gameFlow.activityMotion = null;
    setFlowMode('dialogue');
  }

  if (sceneId === 'home' && gameFlow.visitedSchool && gameFlow.selectedEnding) {
    const endings = {
      happiness: ['소소한 행복', '늘 걷던 길에서 발견한 작은 즐거움이 오늘을 다르게 만들었다.'],
      different: ['평소와 다른 일상', '친구와 함께한 작은 모험이 익숙한 하루에 새로운 장면을 더했다.'],
    };
    const [title, message] = endings[gameFlow.selectedEnding];
    gameFlow.finale = { title, message, night: false };
    gameFlow.mode = 'finale';
  }
  if (sceneId === 'home' && gameFlow.visitedSchool) {
    gameFlow.visitedSchool = false;
    gameFlow.day++;
    gameFlow.schoolClassesAttended = 0;
    gameFlow.schoolBreakTalked = false;
    gameFlow.schoolClassStartedAt = null;
    gameFlow.ateToday = false;
    gameFlow.skipMealGate = false;
    gameFlow.breakfastBowl = 'none';
    gameFlow.completed.delete('cereal');
    gameFlow.completed.delete('breakfast');
    gameFlow.completed.delete('breakfast_prepared');
  }

  // Update Location Badge HUD
  const locBadge = document.getElementById('location-badge');
  if (locBadge) locBadge.textContent = `📍 ${currentScene.name}`;

  // Center camera
  camera.x = Math.max(0, Math.min(currentScene.width - camera.width, player.x - camera.width / 2));
}

function currentActivities() {
  const activities = (sceneActivities[currentSceneId] || []).filter(activity => {
    if (activity.id === 'cactus') return gameFlow.schoolClassesAttended === 0;
    if (activity.id === 'monitor') return gameFlow.schoolClassesAttended >= 2;
    if (activity.kind === 'seatedTask') return gameFlow.schoolClassesAttended === 0 && !gameFlow.ateToday && player.sitting?.seatId === activity.seatId && (activity.id !== 'breakfast' || gameFlow.breakfastBowl === 'placed');
    if (activity.id === 'kitchen_chair') return !gameFlow.completed.has('breakfast_prepared');
    if (activity.id === 'right_chair') return gameFlow.completed.has('breakfast_prepared');
    if (activity.id === 'fridge') return gameFlow.fridgeUnlocked && !gameFlow.ateToday && !gameFlow.completed.has('breakfast_prepared');
    if (activity.id === 'dishes') return gameFlow.ateToday && (gameFlow.cerealEver || gameFlow.breakfastEver) && (!gameFlow.dishesPrompted || gameFlow.completed.has('breakfast_prepared'));
    if (activity.id === 'school_board_desk_seat') return gameFlow.schoolClassesAttended < 2;
    if (activity.id === 'school_break_friend') return gameFlow.schoolClassesAttended === 1 && gameFlow.schoolClassStartedAt === null && !gameFlow.schoolBreakTalked;
    if (activity.kind === 'busBell') return busJourney.state === 'stopped' && !busJourney.bellPressed;
    return true;
  });
  if (currentSceneId === 'bus_stop' && busArrival.state === 'stopped' && gameFlow.schoolClassesAttended === 0) {
    return [{ id: 'arrived_bus', x: player.x, bounds: { x: busArrival.x, y: 48, width: 697, height: 272 }, label: '버스 타기', kind: 'boardBus' }];
  }
  return activities;
}

function setFlowMode(mode, dialogueDuration = 1500) {
  gameFlow.mode = mode;
  if (mode === 'dialogue') gameFlow.dialogueUntil = performance.now() + dialogueDuration;
  keys.left = false;
  keys.right = false;
  keys.speedBoost = false;
}

let monitorTaskInput = null;

function focusMonitorTaskInput() {
  if (!monitorTaskInput) {
    monitorTaskInput = document.createElement('textarea');
    monitorTaskInput.setAttribute('aria-label', '모니터 과제 입력');
    Object.assign(monitorTaskInput.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      resize: 'none',
    });
    monitorTaskInput.addEventListener('input', () => {
      if (gameFlow.mode === 'monitorTyping' && gameFlow.monitorTask) {
        gameFlow.monitorTask.value = monitorTaskInput.value;
        if (gameFlow.monitorTask.value === gameFlow.monitorTask.target) completeMonitorTask();
      }
    });
    document.body.appendChild(monitorTaskInput);
  }
  monitorTaskInput.value = '';
  monitorTaskInput.focus();
}

function completeMonitorTask() {
  if (!gameFlow.monitorTask || gameFlow.monitorTask.value !== gameFlow.monitorTask.target) return;
  gameFlow.completed.add(`monitor_${gameFlow.monitorTask.type}`);
  gameFlow.monitorTask.phase = 'success';
  monitorTaskInput?.blur();
  setFlowMode('monitorSuccess');
}

function closeMonitorTask() {
  monitorTaskInput?.blur();
  if (monitorTaskInput) monitorTaskInput.value = '';
  gameFlow.monitorTask = null;
  setFlowMode(null);
}

function standPlayerUp() {
  if (player.sitting?.seatId === 'kitchen_chair') {
    if (gameFlow.leftChairSat && !gameFlow.ateToday) gameFlow.fridgeUnlocked = true;
    gameFlow.leftChairSat = false;
  }
  player.sitting = null;
}

function interactWith(activity) {
  if (activity.id === 'cactus' && gameFlow.schoolClassesAttended > 0) return;
  if (activity.kind === 'seatedTask' && (gameFlow.schoolClassesAttended > 0 || gameFlow.ateToday || currentSceneId !== 'living_room' || player.sitting?.seatId !== activity.seatId || (activity.id === 'breakfast' && gameFlow.breakfastBowl !== 'placed'))) return;
  if (activity.kind === 'dishes' && (!gameFlow.ateToday || (!gameFlow.cerealEver && !gameFlow.breakfastEver) || gameFlow.completed.has('dishes') || (gameFlow.dishesPrompted && !gameFlow.completed.has('breakfast_prepared')))) return;
  window.soundEngine.playInteractionSelect();

  if (activity.kind === 'dishes' && !gameFlow.dishesPrompted) {
    gameFlow.dishesPrompted = true;
    gameFlow.dialogue = '부모님이 하실 테니까 굳이 안 해도 될 것 같다.';
    gameFlow.activityMotion = null;
    setFlowMode('dialogue');
    return;
  }

  if (activity.kind === 'schoolBreakFriend') {
    if (currentSceneId !== 'school_board' || gameFlow.schoolClassesAttended !== 1 || gameFlow.schoolBreakTalked) return;
    gameFlow.schoolBreakTalked = true;
    gameFlow.dialogue = '쉬는 시간에 친구와 이야기를 나눴다.';
    gameFlow.activityMotion = null;
    setFlowMode('dialogue', 2200);
    return;
  }

  if (activity.kind === 'monitor') {
    if (currentSceneId !== 'home' || gameFlow.schoolClassesAttended < 2) return;
    gameFlow.monitorTask = { phase: 'select', type: null, target: '', value: '', error: false };
    setFlowMode('monitorMenu');
    return;
  }

  if (activity.kind === 'seat') {
    setFlowMode(null);
    player.x = activity.seatX;
    player.y = PLAYER_BASE_Y;
    player.facing = activity.facing || 1;
    player.state = 'IDLE';
    player.sitting = { seatY: activity.seatY, seatId: activity.id };
    if (activity.id === 'kitchen_chair') gameFlow.leftChairSat = true;
    if (activity.id === 'school_board_desk_seat' && gameFlow.schoolClassesAttended < 2) {
      const classNumber = gameFlow.schoolClassesAttended + 1;
      gameFlow.schoolClassStartedAt = performance.now();
      gameFlow.dialogue = classNumber === 1
        ? '오전 수업이 시작됐다. 자리에 앉아 수업을 듣자.'
        : '오후 수업이 시작됐다. 자리에 앉아 수업을 듣자.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue', 5000);
    }
    if (currentSceneId === 'bus_stop' && activity.id === 'bus_stop_bench' && busStopHint.firstSeatAt === null) {
      busStopHint.firstSeatAt = performance.now();
    }
    if (currentSceneId === 'bus' && busJourney.state === 'boarding') {
      busJourney.state = 'moving';
      busJourney.movingUntil = performance.now() + 7500;
      busJourney.departAt = null;
    }
    if (activity.id === 'right_chair' && gameFlow.breakfastBowl === 'carried') gameFlow.breakfastBowl = 'placed';
    return;
  }

  if (activity.kind === 'fridge') {
    if (!gameFlow.fridgeUnlocked || gameFlow.ateToday || gameFlow.completed.has('breakfast_prepared')) return;
    setFlowMode(null);
    sceneTransition.start('refrigerator', 55);
    return;
  }

  if (activity.kind === 'homeFrontExit') {
    setFlowMode(null);
    sceneTransition.start('home_front', 70);
    return;
  }

  if (activity.kind === 'stairDoor') {
    setFlowMode(null);
    if (gameFlow.visitedSchool || gameFlow.schoolClassesAttended > 0) {
      gameFlow.dialogue = '힘들어서 계단으로 갈 수 없다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue');
      return;
    }
    const destination = currentSceneId === 'elevator' ? 'floor1_elevator' : 'elevator';
    sceneTransition.start(destination, 839);
    return;
  }

  if (activity.kind === 'apartmentDoor') {
    setFlowMode(null);
    sceneTransition.start('living_room', 900);
    return;
  }

  if (activity.kind === 'schoolDoor') {
    setFlowMode(null);
    const enteringSchool = currentSceneId === 'school';
    if (enteringSchool && gameFlow.schoolClassesAttended >= 2) {
      gameFlow.dialogue = '집에 갈 시간이다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue');
      return;
    }
    sceneTransition.start(enteringSchool ? 'school_board' : 'school', enteringSchool ? 70 : 722);
    return;
  }

  if (activity.kind === 'elevatorDoor') {
    if (elevatorRide.startedAt !== null) return;
    setFlowMode(null);
    player.sitting = null;
    elevatorRide.startX = player.x;
    elevatorRide.destination = currentSceneId === 'elevator' ? 'floor1_elevator' : 'elevator';
    elevatorRide.startedAt = performance.now();
    return;
  }

  if (activity.kind === 'crossing') {
    if (isCrossingSignalRed()) {
      gameFlow.dialogue = '지금은 빨간불이다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue');
      return;
    }
    player.sitting = null;
    player.facing = 1;
    gameFlow.crossingStartedAt = performance.now();
    gameFlow.dialogue = '횡단보도를 건너 학원가로 향한다.';
    gameFlow.activityMotion = null;
    setFlowMode('crossing');
    return;
  }

  if (activity.kind === 'boardBus') {
    if (gameFlow.schoolClassesAttended > 0) return;
    player.sitting = null;
    setFlowMode('bus_departure');
    busArrival.state = 'departing';
    return;
  }

  if (activity.kind === 'busBell') {
    if (currentSceneId !== 'bus' || busJourney.state !== 'stopped' || busJourney.bellPressed) return;
    busJourney.bellPressed = busJourney.stopIndex >= 4;
    busJourney.departAt = null;
    if (busJourney.stopIndex < 4) {
      gameFlow.dialogue = `학교까지는 아직 ${4 - busJourney.stopIndex}정거장이 남았다.`;
      gameFlow.activityMotion = null;
      setFlowMode('dialogue', 4500);
    } else if (busJourney.stopIndex >= busStops.length) {
      gameFlow.dialogue = '이번 정류장이 종점입니다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue', 4500);
    }
    return;
  }

  if (activity.kind === 'leaveBus') {
    if (currentSceneId !== 'bus' || player.sitting || busJourney.state !== 'stopped') return;
    const atSeaTerminal = busJourney.stopIndex >= busStops.length;
    if ((!busJourney.bellPressed && !atSeaTerminal) || busJourney.stopIndex < 4) {
      gameFlow.dialogue = busJourney.stopIndex < busStops.length
        ? `학교까지는 아직 ${Math.max(4 - busJourney.stopIndex, 1)}정거장이 남았다.`
        : '먼저 하차벨을 눌러야 한다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue', 4500);
      if (busJourney.bellPressed && busJourney.stopIndex < busStops.length) {
        busJourney.bellPressed = false;
        busJourney.departAt = null;
      }
      return;
    }
    setFlowMode(null);
    busArrival.departureTarget = busJourney.stopIndex === 4 ? 'school_field' : 'sea_stop';
    busArrival.state = 'departing';
    busArrival.x = BUS_STOP_DEPART_POSITION;
    sceneTransition.start(busArrival.departureTarget, 70);
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
  if (activity.id === 'cereal' || activity.id === 'breakfast') gameFlow.ateToday = true;
  if (activity.id === 'cereal') gameFlow.cerealEver = true;
  if (activity.id === 'breakfast') gameFlow.breakfastEver = true;
  gameFlow.dialogue = activity.text;
  if (activity.id === 'cat') window.soundEngine.playCatEvent();
  if (activity.id === 'cereal' || activity.id === 'breakfast') window.soundEngine.playCrunchEvent();
  if (activity.id === 'dishes') window.soundEngine.playDishwashingEvent();
  gameFlow.activityMotion = activity.id === 'breakfast' ? 'cereal' : (['cat', 'flower', 'guard', 'cereal', 'dishes'].includes(activity.id) ? activity.id : null);
  if (gameFlow.activityMotion) {
    player.facing = activity.x >= player.x ? 1 : -1;
    if (activity.id === 'cat') {
      player.facing = 1;
      if (!player.sitting) player.x = 710 - BUS_STOP_LEFT_SHIFT;
    } else if (activity.id === 'dishes') {
      player.x = 218;
      player.facing = -1;
    }
  }
  setFlowMode('dialogue');
}

function handleGameFlowKey(event) {
  if (!gameFlow.mode) return false;

  if (gameFlow.mode === 'monitorMenu') {
    if (event.key === 'Escape') {
      closeMonitorTask();
    } else if (event.key === '1' || event.key === '2') {
      const type = event.key === '1' ? 'chat' : 'email';
      gameFlow.monitorTask = {
        type,
        phase: 'typing',
        value: '',
        target: type === 'chat'
          ? '나도 예전부터 너랑 친해지고 싶었어. 오늘 얘기해서 좋았고, 집에 와서도 계속 연락하고 싶어.'
          : '예전부터 너를 좋아했어. 오늘 학교에서 처음 말을 걸어 대화해서 정말 기뻤어. 집에 와서도 계속 연락하고 싶어.',
        error: false,
      };
      setFlowMode('monitorTyping');
      focusMonitorTaskInput();
    }
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'monitorTyping') {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMonitorTask();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (gameFlow.monitorTask?.value === gameFlow.monitorTask?.target) {
        completeMonitorTask();
      } else if (gameFlow.monitorTask) {
        gameFlow.monitorTask.error = true;
      }
    } else if (event.key === 'Tab') {
      event.preventDefault();
    }
    return true;
  }

  if (gameFlow.mode === 'monitorSuccess') {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      closeMonitorTask();
    }
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

  if (gameFlow.mode === 'dialogue') {
    event.preventDefault();
    return true;
  }

  if (gameFlow.mode === 'finale') {
    if (event.key === 'e' || event.key === 'E' || event.key === 'Enter' || event.key === ' ') {
      if (gameFlow.finale?.night) {
        gameFlow.finale = null;
        gameFlow.mode = null;
      } else {
        gameFlow.mode = null;
      }
    }
    event.preventDefault();
    return true;
  }

  event.preventDefault();
  return true;
}

function updateGameFlow(deltaSeconds) {
  if ((currentSceneId === 'elevator' || currentSceneId === 'floor1_elevator') && elevatorArrival.startedAt !== null) {
    if (performance.now() - elevatorArrival.startedAt < 3200) {
      player.state = 'IDLE';
      gameFlow.nearby = null;
      return;
    }
    elevatorArrival.startedAt = null;
  }

  if ((currentSceneId === 'elevator' || currentSceneId === 'floor1_elevator') && elevatorRide.startedAt !== null) {
    const elapsed = performance.now() - elevatorRide.startedAt;
    player.state = 'IDLE';
    gameFlow.nearby = null;
    if (elapsed >= 3950 && !sceneTransition.active) {
      const destination = elevatorRide.destination;
      elevatorArrival.pendingDestination = destination;
      sceneTransition.start(destination, 480);
    }
    return;
  }

  if (gameFlow.mode === 'crossing' && performance.now() - gameFlow.crossingStartedAt >= 1500) {
    setFlowMode(null);
    gameFlow.dialogue = null;
    sceneTransition.start('street', 70);
  }
  if (gameFlow.mode === 'dialogue' && performance.now() >= gameFlow.dialogueUntil) {
    gameFlow.mode = null;
    gameFlow.dialogue = null;
    gameFlow.activityMotion = null;
  }

  if (currentSceneId === 'school_board' && gameFlow.schoolClassStartedAt !== null &&
      performance.now() - gameFlow.schoolClassStartedAt >= 5000) {
    gameFlow.schoolClassStartedAt = null;
    gameFlow.schoolClassesAttended = Math.min(gameFlow.schoolClassesAttended + 1, 2);
    gameFlow.dialogue = gameFlow.schoolClassesAttended === 1
      ? '오전 수업이 끝났다. 쉬는 시간이다.'
      : '오후 수업이 끝났다. 수업이 끝났으니 집에 돌아가자.';
    gameFlow.activityMotion = null;
    setFlowMode('dialogue', 2500);
  }

  if (gameFlow.mode === 'calm') {
    gameFlow.calmTime -= deltaSeconds;
    if (gameFlow.calmTime <= 0) {
      gameFlow.completed.add(gameFlow.calmId);
      gameFlow.selectedEnding = 'happiness';
      gameFlow.dialogue = `${gameFlow.calmText} 마음이 조금 가벼워진다. 천천히 집으로 돌아가자.`;
      setFlowMode('dialogue');
    }
  }

  if (currentSceneId === 'bus') {
    if (busJourney.state === 'moving') {
      busJourney.sceneryOffset = (busJourney.sceneryOffset + 120 * deltaSeconds) % 600;
      if (performance.now() >= busJourney.movingUntil) {
        busJourney.state = 'stopped';
        const stopName = busStops[Math.min(busJourney.stopIndex, busStops.length - 1)];
        busJourney.stopIndex = Math.min(busJourney.stopIndex + 1, busStops.length);
        busJourney.departAt = null;
        busJourney.bellPressed = false;
        busJourney.standingSince = null;
        busJourney.safetyWarned = false;
        gameFlow.dialogue = `이번 정류장은 ${stopName} 정류장입니다.`;
        gameFlow.activityMotion = null;
        setFlowMode('dialogue', 4500);
        busJourney.stopStartedAt = performance.now();
      }
    }
    if (busJourney.state === 'stopped' && busJourney.stopIndex === 4 &&
        busJourney.stopStartedAt !== null && performance.now() - busJourney.stopStartedAt >= 20000) {
      busJourney.state = 'moving';
      busJourney.movingUntil = performance.now() + 15000;
      busJourney.departAt = null;
      busJourney.bellPressed = false;
      busJourney.stopStartedAt = null;
      gameFlow.mode = null;
      gameFlow.dialogue = null;
      gameFlow.activityMotion = null;
    }
    if (busJourney.state === 'stopped' && busJourney.stopIndex < busStops.length) {
      if (player.sitting) {
        busJourney.standingSince = null;
        busJourney.safetyWarned = false;
      } else if (busJourney.standingSince === null) {
        busJourney.standingSince = performance.now();
      } else if (!busJourney.safetyWarned && !gameFlow.mode && performance.now() - busJourney.standingSince >= 3000) {
        busJourney.safetyWarned = true;
        gameFlow.dialogue = '안전을 위해 자리에 앉아주세요.';
        gameFlow.activityMotion = null;
        setFlowMode('dialogue');
      }
    }
    if (busJourney.state === 'stopped' && !busJourney.bellPressed && busJourney.stopIndex !== 4) {
      const showingSafetyNotice = gameFlow.mode === 'dialogue' && gameFlow.dialogue === '안전을 위해 자리에 앉아주세요.';
      if ((gameFlow.mode && !showingSafetyNotice) || keys.left || keys.right || keys.speedBoost) {
        busJourney.departAt = null;
      } else if (busJourney.departAt === null) {
        busJourney.departAt = performance.now() + 3000;
      } else if (performance.now() >= busJourney.departAt) {
        busJourney.state = 'moving';
        busJourney.movingUntil = performance.now() + 7500;
        busJourney.departAt = null;
        busJourney.stopStartedAt = null;
        keys.left = false;
        keys.right = false;
      }
    }
  }

  if (currentSceneId === 'bus_stop') {
    if (busStopHint.firstSeatAt !== null && !busStopHint.shown && !gameFlow.mode && !sceneTransition.active &&
        busArrival.state !== 'departing' && performance.now() - busStopHint.firstSeatAt >= 10000) {
      busStopHint.shown = true;
      gameFlow.dialogue = '버스 정류장에 앉아서 버스를 기다리자.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue');
    }
    if (busArrival.state === 'waiting') {
      if (gameFlow.schoolClassesAttended === 0 && player.sitting?.seatId === 'bus_stop_bench' && !gameFlow.mode && !keys.left && !keys.right) {
        if (busArrival.idleSince === null) busArrival.idleSince = performance.now();
        if (performance.now() - busArrival.idleSince >= 3000) busArrival.state = 'arriving';
      } else {
        busArrival.idleSince = null;
      }
    } else if (busArrival.state === 'arriving') {
      const stopX = BUS_STOP_POSITION;
      busArrival.x = Math.min(stopX, busArrival.x + 380 * deltaSeconds);
      if (busArrival.x >= stopX) busArrival.state = 'stopped';
    }
  }
  const busIsLeavingCurrentScene = busArrival.state === 'departing' &&
    (currentSceneId === 'bus_stop' || busArrival.departureTarget === currentSceneId);
  if (busIsLeavingCurrentScene && !sceneTransition.active) {
      busArrival.x = Math.min(currentScene.width, busArrival.x + 380 * deltaSeconds);
      if (busArrival.x >= currentScene.width) {
        if (currentSceneId === busArrival.departureTarget) {
          busArrival.state = 'waiting';
          busArrival.departureTarget = null;
        } else {
          const destination = busArrival.departureTarget || 'bus';
          busArrival.departureTarget = null;
          sceneTransition.start(destination, destination === 'bus' ? 100 : 70);
        }
      }
  }

  gameFlow.nearby = null;
  if (!gameFlow.mode && currentSceneId === 'bus_stop' && busArrival.state === 'stopped') {
    gameFlow.nearby = !player.sitting && Math.abs(player.x - 53) < 82
      ? sceneActivities.bus_stop.find(activity => activity.id === 'crossing_signal')
      : currentActivities()[0];
  } else if (currentSceneId === 'bus_stop' && busArrival.state === 'arriving') {
    return;
  } else if (!gameFlow.mode && player.sitting && currentSceneId === 'living_room') {
    gameFlow.nearby = currentActivities().find(activity => activity.kind === 'seatedTask' && !gameFlow.completed.has(activity.id)) || null;
  } else if (!gameFlow.mode && player.sitting && currentSceneId === 'bus') {
    gameFlow.nearby = currentActivities().find(activity => activity.kind === 'busBell' && Math.abs(player.x - activity.x) < 82) || null;
  } else if (!gameFlow.mode && player.sitting?.seatId === 'bus_stop_bench' && currentSceneId === 'bus_stop' && !gameFlow.completed.has('cat')) {
    gameFlow.nearby = sceneActivities.bus_stop.find(activity => activity.id === 'cat');
  } else if (!gameFlow.mode && !player.sitting) {
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

function drawNearbyActivityHighlight(ctx) {
  const activity = gameFlow.nearby;
  const bounds = activity?.bounds;
  if (!bounds) return;

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 5;

  if (activity.id === 'crossing_signal') {
    ctx.beginPath();
    ctx.moveTo(30, 48);
    ctx.lineTo(76, 48);
    ctx.lineTo(76, 144);
    ctx.lineTo(58, 144);
    ctx.lineTo(58, 320);
    ctx.lineTo(48, 320);
    ctx.lineTo(48, 144);
    ctx.lineTo(30, 144);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id.startsWith('bus_seat_')) {
    ctx.translate(bounds.x, 0);
    ctx.beginPath();
    ctx.moveTo(0, 177);
    ctx.lineTo(8, 177);
    ctx.lineTo(8, 248);
    ctx.lineTo(50, 248);
    ctx.lineTo(50, 264);
    ctx.lineTo(8, 264);
    ctx.lineTo(8, 320);
    ctx.lineTo(0, 320);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'right_chair') {
    ctx.beginPath();
    ctx.moveTo(913, 177);
    ctx.lineTo(905, 177);
    ctx.lineTo(905, 248);
    ctx.lineTo(863, 248);
    ctx.lineTo(863, 320);
    ctx.lineTo(871, 320);
    ctx.lineTo(871, 256);
    ctx.lineTo(905, 256);
    ctx.lineTo(905, 320);
    ctx.lineTo(913, 320);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'kitchen_chair') {
    ctx.translate(bounds.x - 548, 0);
    ctx.beginPath();
    ctx.moveTo(548, 177);
    ctx.lineTo(556, 177);
    ctx.lineTo(556, 248);
    ctx.lineTo(598, 248);
    ctx.lineTo(598, 320);
    ctx.lineTo(590, 320);
    ctx.lineTo(590, 256);
    ctx.lineTo(556, 256);
    ctx.lineTo(556, 320);
    ctx.lineTo(548, 320);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'school_board_desk_seat') {
    ctx.beginPath();
    ctx.moveTo(bounds.x, 216);
    ctx.lineTo(bounds.x + bounds.width, 216);
    ctx.lineTo(bounds.x + bounds.width, 227);
    ctx.lineTo(bounds.x + 169.25, 227);
    ctx.lineTo(bounds.x + 169.25, 320);
    ctx.lineTo(bounds.x + 158.25, 320);
    ctx.lineTo(bounds.x + 158.25, 227);
    ctx.lineTo(bounds.x + 25, 227);
    ctx.lineTo(bounds.x + 25, 320);
    ctx.lineTo(bounds.x + 14, 320);
    ctx.lineTo(bounds.x + 14, 227);
    ctx.lineTo(bounds.x, 227);
    ctx.closePath();
    ctx.stroke();
    const chairCenterX = bounds.x + bounds.width / 2;
    ctx.beginPath();
    ctx.moveTo(chairCenterX - 25, 252);
    ctx.lineTo(chairCenterX + 25, 252);
    ctx.lineTo(chairCenterX + 25, 260);
    ctx.lineTo(chairCenterX + 21, 260);
    ctx.lineTo(chairCenterX + 21, 320);
    ctx.lineTo(chairCenterX + 14, 320);
    ctx.lineTo(chairCenterX + 14, 260);
    ctx.lineTo(chairCenterX - 14, 260);
    ctx.lineTo(chairCenterX - 14, 320);
    ctx.lineTo(chairCenterX - 21, 320);
    ctx.lineTo(chairCenterX - 21, 260);
    ctx.lineTo(chairCenterX - 25, 260);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeRect(chairCenterX + 18, 220, 8, 32);
  } else if (activity.id === 'bus_stop_bench') {
    ctx.translate(-BUS_STOP_LEFT_SHIFT, 0);
    ctx.beginPath();
    ctx.moveTo(585, 255);
    ctx.lineTo(845, 255);
    ctx.lineTo(845, 320);
    ctx.lineTo(835, 320);
    ctx.lineTo(835, 265);
    ctx.lineTo(595, 265);
    ctx.lineTo(595, 320);
    ctx.lineTo(585, 320);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'cereal' || activity.id === 'breakfast') {
    if (activity.id === 'breakfast') ctx.translate(142, 0);
    ctx.beginPath();
    ctx.moveTo(642, 192);
    ctx.lineTo(684, 192);
    ctx.lineTo(678, 208);
    ctx.lineTo(648, 208);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'cat') {
    ctx.translate(-BUS_STOP_LEFT_SHIFT, 0);
    ctx.translate(0, 20);
    ctx.beginPath();
    ctx.moveTo(745, 212);
    ctx.lineTo(747, 212);
    ctx.lineTo(747, 208);
    ctx.lineTo(753, 208);
    ctx.lineTo(753, 212);
    ctx.lineTo(759, 212);
    ctx.lineTo(759, 208);
    ctx.lineTo(765, 208);
    ctx.lineTo(765, 212);
    ctx.lineTo(768, 212);
    ctx.lineTo(768, 217);
    ctx.lineTo(812, 217);
    ctx.lineTo(812, 225);
    ctx.lineTo(819, 225);
    ctx.lineTo(819, 235);
    ctx.lineTo(745, 235);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'dishes') {
    ctx.beginPath();
    ctx.moveTo(133, 187);
    ctx.lineTo(180, 187);
    ctx.lineTo(180, 165);
    ctx.lineTo(201, 165);
    ctx.lineTo(201, 175);
    ctx.lineTo(196, 175);
    ctx.lineTo(196, 170);
    ctx.lineTo(185, 170);
    ctx.lineTo(185, 187);
    ctx.lineTo(232, 187);
    ctx.lineTo(232, 192);
    ctx.lineTo(133, 192);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'cactus') {
    traceCactus(ctx);
    ctx.stroke();
  } else if (activity.id === 'elevator_door') {
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  } else if (activity.id === 'flower') {
    ctx.translate(PLANTER_SHIFT + FLOWER_CENTER - 330, PLANTER_DROP - PLANTER_RAISE + FLOWER_CENTER_TOP - 198);
    ctx.beginPath();
    ctx.moveTo(326, 198);
    ctx.lineTo(334, 198);
    ctx.lineTo(334, 204);
    ctx.lineTo(342, 204);
    ctx.lineTo(342, 212);
    ctx.lineTo(338, 212);
    ctx.lineTo(338, 218);
    ctx.lineTo(322, 218);
    ctx.lineTo(322, 212);
    ctx.lineTo(318, 212);
    ctx.lineTo(318, 204);
    ctx.lineTo(326, 204);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(328, 216);
    ctx.lineTo(328, 462 - FLOWER_CENTER_TOP);
    ctx.lineTo(332, 462 - FLOWER_CENTER_TOP);
    ctx.lineTo(332, 216);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(328, 240);
    ctx.lineTo(320, 236);
    ctx.lineTo(318, 240);
    ctx.lineTo(328, 244);
    ctx.closePath();
    ctx.moveTo(332, 234);
    ctx.lineTo(340, 230);
    ctx.lineTo(342, 234);
    ctx.lineTo(332, 238);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'sky') {
    ctx.beginPath();
    ctx.moveTo(736, 40);
    ctx.lineTo(748, 40);
    ctx.lineTo(748, 30);
    ctx.lineTo(776, 30);
    ctx.lineTo(776, 40);
    ctx.lineTo(788, 40);
    ctx.lineTo(788, 46);
    ctx.lineTo(796, 46);
    ctx.lineTo(796, 56);
    ctx.lineTo(736, 56);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'friend') {
    ctx.beginPath();
    ctx.moveTo(459, 210);
    ctx.lineTo(480, 210);
    ctx.lineTo(480, 230);
    ctx.lineTo(477, 230);
    ctx.lineTo(477, 236);
    ctx.lineTo(491, 236);
    ctx.lineTo(491, 242);
    ctx.lineTo(477, 242);
    ctx.lineTo(477, 264);
    ctx.lineTo(480, 304);
    ctx.lineTo(472, 304);
    ctx.lineTo(468, 264);
    ctx.lineTo(466, 264);
    ctx.lineTo(466, 304);
    ctx.lineTo(458, 304);
    ctx.lineTo(458, 264);
    ctx.lineTo(462, 242);
    ctx.lineTo(448, 242);
    ctx.lineTo(448, 236);
    ctx.lineTo(462, 236);
    ctx.lineTo(462, 230);
    ctx.lineTo(459, 230);
    ctx.closePath();
    ctx.stroke();
  } else if (activity.id === 'presentation') {
    ctx.strokeRect(160, 194, 150, 126);
  } else if (activity.id === 'football') {
    ctx.strokeRect(706, 286, 15, 15);
  } else if (activity.id === 'sign') {
    ctx.strokeRect(34, 96, 272, 25);
  } else if (activity.id === 'poem') {
    ctx.strokeRect(391, 134, 176, 78);
  } else if (activity.id === 'arrived_bus') {
    ctx.strokeRect(busArrival.x, 48, 697, 272);
  } else {
    ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  if (activity.kind === 'busBell') {
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('하차벨', bounds.x + bounds.width / 2, bounds.y - 20);
    ctx.font = '11px sans-serif';
    ctx.fillText('[K]로 상호작용', bounds.x + bounds.width / 2, bounds.y - 5);
  }
  ctx.restore();
}

function drawCenterMessage(ctx, message, subtitle = '', backgroundOpacity = 1) {
  const panelWidth = 680;
  const panelHeight = subtitle ? 92 : 72;
  const panelX = (canvas.width - panelWidth) / 2;
  const panelY = (canvas.height - panelHeight) / 2;
  ctx.fillStyle = `rgba(41, 41, 41, ${backgroundOpacity})`;
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

function drawMonitorTaskOverlay(ctx) {
  const task = gameFlow.monitorTask;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#bdbdbd';
  ctx.fillRect(76, 20, 808, 280);
  ctx.fillStyle = '#25292d';
  ctx.fillRect(84, 28, 792, 264);
  ctx.fillStyle = '#45545b';
  ctx.fillRect(84, 28, 792, 32);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px sans-serif';

  if (gameFlow.mode === 'monitorMenu') {
    ctx.fillText('모니터 · 연락 방법 선택', 108, 44);
    ctx.font = '14px sans-serif';
    ctx.fillText('학교에서 먼저 말을 걸었던 같은 반 친구에게 연락해 보자.', 112, 100);
    ctx.fillText('[1] 채팅으로 메시지 주고받기', 112, 148);
    ctx.fillText('[2] 메일 보내기', 112, 184);
    ctx.fillStyle = '#c4cbd0';
    ctx.font = '12px sans-serif';
    ctx.fillText('숫자 1 또는 2를 누르세요 · Esc 닫기', 112, 250);
    return;
  }

  if (gameFlow.mode === 'monitorSuccess') {
    ctx.fillText(task.type === 'chat' ? '채팅 · 대화 완료' : '메일 · 발송 완료', 108, 44);
    ctx.font = '13px sans-serif';
    if (task.type === 'chat') {
      ctx.fillText('나: ' + task.target, 112, 120, 728);
      ctx.fillStyle = '#a9d8bd';
      ctx.fillText('친구: 나도 좋아! 내일 학교에서 또 이야기하자.', 112, 166, 728);
    } else {
      ctx.fillText('받는 사람: 같은 반 친구', 112, 112);
      ctx.fillText('보낸 내용: ' + task.target, 112, 150, 728);
      ctx.fillStyle = '#a9d8bd';
      ctx.fillText('메일을 보냈다.', 112, 190);
    }
    ctx.fillStyle = '#c4cbd0';
    ctx.font = '12px sans-serif';
    ctx.fillText('Enter 또는 Esc를 눌러 닫기', 112, 254);
    return;
  }

  ctx.fillText(task.type === 'chat' ? '채팅 · 같은 반 친구' : '메일 작성', 108, 44);
  ctx.font = '12px sans-serif';
  if (task.type === 'chat') {
    ctx.fillStyle = '#b7c3c8';
    ctx.fillText('친구: 오늘 학교에서 먼저 말 걸어줘서 반가웠어!', 112, 86, 728);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('보낼 문장 그대로 입력:', 112, 124);
    ctx.fillText(task.target, 112, 146, 728);
  } else {
    ctx.fillStyle = '#b7c3c8';
    ctx.fillText('받는 사람: 같은 반 친구     제목: 오늘 학교에서 못한 이야기', 112, 86, 728);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('메일 내용 그대로 입력:', 112, 124);
    ctx.fillText(task.target, 112, 146, 728);
  }
  ctx.fillStyle = '#f1f1f1';
  ctx.fillRect(108, 174, 744, 52);
  ctx.fillStyle = '#282d30';
  ctx.fillRect(112, 178, 736, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.fillText(task.value || '여기에 입력하세요…', 122, 200, 716);
  ctx.fillStyle = task.error ? '#ffaaaa' : '#c4cbd0';
  ctx.fillText(task.error ? '문장이 정확히 일치하지 않습니다. 고쳐서 다시 입력하세요.' : '문장을 완벽하게 입력하면 자동으로 완료됩니다 · Esc 닫기', 112, 258, 728);
}

function drawFlowOverlay(ctx) {
  if (['monitorMenu', 'monitorTyping', 'monitorSuccess'].includes(gameFlow.mode)) {
    drawMonitorTaskOverlay(ctx);
    return;
  }
  if (gameFlow.mode === 'crossing') {
    drawCenterMessage(ctx, gameFlow.dialogue, '', 0.3);
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
    const stopAnnouncement = currentSceneId === 'bus' && busJourney.state === 'stopped' && gameFlow.dialogue?.startsWith('이번 정류장은 ');
    const terminalAnnouncement = stopAnnouncement && busJourney.stopIndex === busStops.length;
    const subtitle = terminalAnnouncement
      ? '이번 정류장이 종점입니다.'
      : stopAnnouncement ? '내리실 분은 하차벨 [K]를 누른 후, 문으로 하차해 주세요.' : '';
    drawCenterMessage(ctx, gameFlow.dialogue, subtitle, 0.3);
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

function traceCactus(ctx) {
  ctx.beginPath();
  ctx.moveTo(757, GROUND_Y - 176);
  ctx.lineTo(769, GROUND_Y - 176);
  ctx.lineTo(769, GROUND_Y - 154);
  ctx.lineTo(773, GROUND_Y - 154);
  ctx.lineTo(773, GROUND_Y - 164);
  ctx.lineTo(778, GROUND_Y - 164);
  ctx.lineTo(778, GROUND_Y - 149);
  ctx.lineTo(769, GROUND_Y - 149);
  ctx.lineTo(769, GROUND_Y - 144);
  ctx.lineTo(757, GROUND_Y - 144);
  ctx.lineTo(757, GROUND_Y - 156);
  ctx.lineTo(749, GROUND_Y - 156);
  ctx.lineTo(749, GROUND_Y - 171);
  ctx.lineTo(754, GROUND_Y - 171);
  ctx.lineTo(754, GROUND_Y - 161);
  ctx.lineTo(757, GROUND_Y - 161);
  ctx.closePath();
}

function drawRoomFurniture(ctx) {
  const paneWidth = 82;
  const paneHeight = 123;
  const paneGap = 11 * 0.75;
  const windowCenterX = 460.5;
  const windowTop = 74;
  const windowLeft = windowCenterX - (paneWidth * 2 + paneGap) / 2;

  ctx.fillStyle = WINDOW_COLOR;
  ctx.fillRect(windowLeft, windowTop, paneWidth, paneHeight);
  ctx.fillRect(windowLeft + paneWidth + paneGap, windowTop, paneWidth, paneHeight);

  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(15, GROUND_Y - 82, 275, 47);
  ctx.fillStyle = '#888888';
  ctx.fillRect(107, GROUND_Y - 82, 183, 47);
  ctx.fillStyle = '#555555';
  ctx.fillRect(0, GROUND_Y - 122, 15, 97);
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

  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#67966a' : '#555555';
  traceCactus(ctx);
  ctx.fill();

  ctx.fillStyle = gameFlow.completed.has('cactus') ? '#d99aa9' : '#7d7d7d';
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

    // A narrow apartment block sits beneath a canopy along the top edge.
    ctx.fillStyle = wall;
    ctx.fillRect(0, 28, 75, 292);
    ctx.fillStyle = mid;
    ctx.fillRect(0, 0, 155, 32);
    ctx.fillStyle = mid;
    ctx.fillRect(0, 30, 155, 4);

    // The planter stays monochrome until its flower task is complete.
    ctx.save();
    ctx.translate(PLANTER_SHIFT, PLANTER_DROP);
    const flowerDone = gameFlow.completed.has('flower');
    ctx.fillStyle = flowerDone ? '#806c50' : '#777777';
    ctx.fillRect(58, 264 - PLANTER_RAISE, 431.5, 56 + PLANTER_RAISE - PLANTER_DROP);
    ctx.fillStyle = flowerDone ? '#719d79' : '#999999';
    ctx.fillRect(63, 133, 423.5, 131 - PLANTER_RAISE);
    ctx.translate(0, -PLANTER_RAISE);
    const flowerPlants = [
      { x: 108.25, top: 222 }, { x: 163.75, top: 210 },
      { x: 219.25, top: 222 }, { x: FLOWER_CENTER, top: FLOWER_CENTER_TOP },
      { x: 330.25, top: 222 }, { x: 385.75, top: 210 },
      { x: 441.25, top: 222 },
    ];
    for (const plant of flowerPlants) {
      const leafColor = flowerDone ? '#4e7952' : '#666666';
      const petalColor = flowerDone ? '#b9a2c7' : '#b0b0b0';
      ctx.fillStyle = leafColor;
      ctx.fillRect(plant.x - 2, plant.top + 16, 4, 264 - plant.top - 16);
      ctx.fillRect(plant.x - 12, plant.top + 38, 12, 4);
      ctx.fillRect(plant.x + 2, plant.top + 31, 12, 4);
      ctx.fillStyle = petalColor;
      ctx.fillRect(plant.x - 10, plant.top + 6, 8, 8);
      ctx.fillRect(plant.x - 4, plant.top, 8, 8);
      ctx.fillRect(plant.x + 4, plant.top + 6, 8, 8);
      ctx.fillRect(plant.x - 4, plant.top + 12, 8, 8);
      ctx.fillStyle = flowerDone ? '#f6e8aa' : '#d0d0d0';
      ctx.fillRect(plant.x - 2, plant.top + 7, 4, 4);
    }
    ctx.restore();

    // Guard booth is flush with the right edge and the screen bottom.
    const guardDone = gameFlow.completed.has('guard');
    ctx.fillStyle = guardDone ? '#739bb5' : '#777777';
    ctx.fillRect(744, 0, 216, 320);
    ctx.fillStyle = guardDone ? '#517892' : wall;
    ctx.fillRect(760, 40, 184, 32);
    ctx.fillStyle = light;
    ctx.font = 'bold 15px sans-serif';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillText('경비실', 852, 62);
    ctx.restore();
    ctx.fillStyle = guardDone ? '#a9cad0' : WINDOW_COLOR;
    ctx.fillRect(764, 88, 176, 138 * 0.7);
    return;
  }

  if (scene.id === 'bus_stop') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.save();
    ctx.translate(24, 0);
    ctx.fillStyle = mid;
    ctx.fillRect(24, 132, 10, 188);
    ctx.fillStyle = dark;
    ctx.fillRect(6, 48, 46, 96);
    ctx.fillStyle = '#666666';
    ctx.fillRect(14, 57, 30, 30);
    ctx.fillStyle = '#a3a3a3';
    ctx.fillRect(14, 105, 30, 30);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(14, isCrossingSignalRed() ? 57 : 105, 30, 30);
    ctx.restore();
    ctx.save();
    ctx.translate(-20 - BUS_STOP_LEFT_SHIFT, 0);
    ctx.fillStyle = '#999999';
    ctx.fillRect(530, 80, 410, 240);
    ctx.fillStyle = '#858585';
    ctx.fillRect(530, 80, 410, 34);
    ctx.fillRect(530, 114, 34 / 3, 206);
    ctx.fillRect(940 - 34 / 3, 114, 34 / 3, 206);
    ctx.fillStyle = mid;
    ctx.fillRect(605, 255, 260, 10);
    ctx.fillRect(605, 265, 10, 55);
    ctx.fillRect(855, 265, 10, 55);
    ctx.fillStyle = gameFlow.completed.has('cat') ? '#dc8742' : '#484848';
    ctx.fillRect(775, 237, 57, 18);
    ctx.fillRect(823, 245, 16, 10);
    const catHeadDrop = gameFlow.mode === 'dialogue' && gameFlow.activityMotion === 'cat'
      ? Math.round((1 + Math.sin(performance.now() / 160)) * 2)
      : 0;
    ctx.fillRect(765, 232 + catHeadDrop, 23, 23 - catHeadDrop);
    ctx.fillRect(767, 228 + catHeadDrop, 6, 8);
    ctx.fillRect(779, 228 + catHeadDrop, 6, 8);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(769, 241 + catHeadDrop, 7, 2);
    ctx.fillStyle = light;
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('집', 610, 97);
    ctx.fillText('정류장', 735, 97);
    ctx.fillText('학교', 860, 97);
    for (const arrowX of [674, 804]) {
      ctx.beginPath();
      ctx.moveTo(arrowX - 4.33, 92);
      ctx.lineTo(arrowX + 4.33, 97);
      ctx.lineTo(arrowX - 4.33, 102);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.restore();
    return;
  }

  if (scene.id === 'school_field' || scene.id === 'sea_stop') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.save();
    ctx.translate(80 - 530, 0);
    ctx.fillStyle = '#999999';
    ctx.fillRect(530, 80, 410, 240);
    ctx.fillStyle = '#858585';
    ctx.fillRect(530, 80, 410, 34);
    ctx.fillRect(530, 114, 34 / 3, 206);
    ctx.fillRect(940 - 34 / 3, 114, 34 / 3, 206);
    ctx.fillStyle = mid;
    ctx.fillRect(605, 255, 260, 10);
    ctx.fillRect(605, 265, 10, 55);
    ctx.fillRect(855, 265, 10, 55);
    ctx.fillStyle = light;
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const stopLabels = scene.id === 'sea_stop' ? ['학교', '바다'] : ['집', '학교', '바다'];
    stopLabels.forEach((label, index) => ctx.fillText(label, 610 + index * 125, 97));
    const arrowPositions = scene.id === 'sea_stop' ? [674] : [674, 804];
    for (const arrowX of arrowPositions) {
      ctx.beginPath();
      ctx.moveTo(arrowX - 4.33, 92);
      ctx.lineTo(arrowX + 4.33, 97);
      ctx.lineTo(arrowX - 4.33, 102);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  if (scene.id === 'sea') {
    ctx.fillStyle = '#101b33';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = '#e6e8df';
    for (const [starX, starY, starSize] of [
      [84, 34, 3], [162, 76, 2], [248, 25, 2], [326, 62, 3],
      [414, 38, 2], [502, 82, 3], [596, 29, 2], [674, 67, 2],
      [766, 32, 3], [852, 78, 2], [918, 42, 2], [722, 98, 2],
      [284, 96, 2], [548, 54, 2], [126, 101, 2],
    ]) {
      ctx.fillRect(starX, starY, starSize, starSize);
    }
    ctx.fillStyle = '#9bafb1';
    ctx.fillRect(0, 116, 960, 32);
    ctx.fillStyle = '#78949b';
    ctx.fillRect(0, 148, 960, 132);
    ctx.fillStyle = '#a4b5b3';
    ctx.globalAlpha = 0.55;
    const waveTime = performance.now() / 1000;
    for (const [startX, waveY, waveWidth, speed] of [
      [24, 166, 42, 24], [176, 190, 58, 18], [342, 158, 36, 27],
      [508, 218, 64, 20], [704, 180, 46, 25], [858, 246, 52, 17],
      [98, 254, 34, 22], [420, 194, 48, 16], [632, 238, 38, 28],
      [792, 212, 56, 19],
    ]) {
      const waveX = (startX + waveTime * speed) % 960;
      for (const repeatOffset of [-960, 0, 960]) {
        ctx.fillRect(waveX + repeatOffset, waveY, waveWidth, 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#b8b0a0';
    ctx.fillRect(0, 280, 960, 40);
    return;
  }

  if (scene.id === 'school') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);

    ctx.fillStyle = '#858585';
    ctx.fillRect(410, 40, 550, 280);

    ctx.fillStyle = '#999999';
    ctx.fillRect(600, 84, 120, 236);
    ctx.fillRect(724, 84, 120, 236);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(710, 196.9025, 5, 47.04);
    ctx.fillRect(729, 196.9025, 5, 47.04);

    ctx.fillStyle = '#666666';
    ctx.fillRect(246, 232, 5, 88);
    ctx.fillRect(333, 232, 5, 88);
    ctx.fillRect(246, 184, 92, 48);
    ctx.fillStyle = '#dddddd';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('매일 학교', 292, 208);

    return;
  }

  if (scene.id === 'school_board') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    const dishesDone = gameFlow.completed.has('dishes');
    ctx.fillStyle = '#888888';
    ctx.fillRect(177.75, 28.23, 604.5, 155.54);
    ctx.fillStyle = '#777777';
    ctx.fillRect(186, 36.48, 588, 139.04);

    ctx.fillStyle = dishesDone ? '#9aaf99' : '#777777';
    for (const deskX of [60, 240.75, 538.5, 719.25]) {
      ctx.fillRect(deskX, 216, 180.75, 11);
    }
    ctx.fillStyle = dishesDone ? '#a6bdc2' : '#999999';
    for (const deskX of [60, 240.75, 538.5, 719.25]) {
      ctx.fillRect(deskX + 14, 227, 11, 93);
      ctx.fillRect(deskX + 155.75, 227, 11, 93);
    }
    ctx.fillStyle = '#dedede';
    for (const deskX of [60, 240.75, 538.5, 719.25]) {
      const chairCenterX = deskX + 90.375;
      ctx.fillRect(chairCenterX - 25, 252, 50, 8);
      ctx.fillRect(chairCenterX - 21, 260, 7, 60);
      ctx.fillRect(chairCenterX + 14, 260, 7, 60);
      ctx.fillRect(deskX < 500 ? chairCenterX - 26 : chairCenterX + 18, 220, 8, 32);
    }
    const seatedClassmates = [[60, 1], [240.75, 1], [719.25, -1]];
    for (const [deskX, facing] of seatedClassmates) {
      ctx.save();
      ctx.translate(deskX + 90.375, 260);
      ctx.scale(facing * 3.8, 3.8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2.5, -33, 8.5, 11);
      ctx.fillRect(-2.5, -22, 4, 22);
      ctx.fillRect(0, -19, 3.3, 16);
      ctx.fillRect(-2.5, -3, 11, 4);
      ctx.fillRect(5, 0, 4, (GROUND_Y - 260) / 3.8);
      ctx.fillRect(5, (GROUND_Y - 260) / 3.8 - 2.5, 7, 2.5);
      ctx.restore();
    }
    return;
  }

  if (scene.id === 'street') {
    ctx.fillStyle = '#b5b5b5';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = '#dedede';
    ctx.fillRect(736, 40, 52, 16);
    ctx.fillRect(748, 30, 28, 12);
    ctx.fillRect(780, 46, 16, 10);
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
    ctx.fillRect(24, 36, 912, 284);
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
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(70, 110, 228, 118);
    ctx.fillRect(366, 110, 228, 118);
    ctx.fillRect(664, 110, 228, 118);
  }
}

function drawOutdoorForeground(ctx, scene) {
  const busVisible = busArrival.state !== 'waiting' &&
    (scene.id === 'bus_stop' || scene.id === busArrival.departureTarget);
  if (busVisible) {
    ctx.fillStyle = '#777777';
    ctx.fillRect(busArrival.x, 48, BUS_WIDTH, 272);
    ctx.fillStyle = '#dedede';
    for (let windowIndex = 0; windowIndex < 4; windowIndex++) {
      ctx.fillRect(busArrival.x + 46 + windowIndex * 153, 85, 124, 70);
    }
    ctx.fillStyle = '#484848';
    ctx.fillRect(busArrival.x + 66, 230, 90, 90);
    ctx.fillRect(busArrival.x + 541, 230, 90, 90);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(busArrival.x + 66 + (90 - 30) / 2, 230 + (90 - 30) / 2, 30, 30);
    ctx.fillRect(busArrival.x + 541 + (90 - 30) / 2, 230 + (90 - 30) / 2, 30, 30);
    ctx.fillStyle = '#dedede';
    ctx.fillRect(busArrival.x + 675, 203, 22, 32);
  }
  if (scene.id === 'home_front' && player.facing === -1) {
    ctx.fillStyle = '#858585';
    ctx.fillRect(0, 34, 75, 286);
  }
}

function drawSceneBackground(ctx, scene) {
  ctx.fillStyle = '#b5b5b5';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (scene.id === 'refrigerator') {
    drawRefrigeratorPuzzle(ctx);
  } else if (scene.id === 'bus') {
    ctx.fillStyle = '#969696';
    ctx.fillRect(0, 0, 960, 320);
    ctx.fillStyle = '#dedede';
    for (let windowIndex = 0; windowIndex < 4; windowIndex++) {
      const windowX = 36 + windowIndex * 180;
      ctx.save();
      ctx.beginPath();
      ctx.rect(windowX, 62, 150, 100);
      ctx.clip();
      ctx.fillStyle = '#dedede';
      ctx.fillRect(windowX, 62, 150, 100);
      ctx.fillStyle = '#b7b7b7';
      for (let buildingIndex = -1; buildingIndex < 15; buildingIndex++) {
        const buildingX = buildingIndex * 120 - busJourney.sceneryOffset;
        ctx.fillRect(buildingX, 112 - (buildingIndex % 3 + 1) * 10, 70, 70);
      }
      ctx.fillStyle = '#a4a4a4';
      ctx.fillRect(windowX, 150, 150, 12);
      ctx.restore();
    }
    ctx.fillStyle = '#555555';
    ctx.fillRect(372, 112, 18, 18);
    ctx.fillRect(733, 112, 18, 18);
    ctx.fillStyle = '#555555';
    for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
      const seatX = 56 + seatIndex * 180;
      ctx.fillRect(seatX, 177, 8, 71);
      ctx.fillRect(seatX, 248, 50, 16);
      ctx.fillRect(seatX, 264, 8, 56);
    }
    ctx.fillStyle = '#bdbdbd';
    ctx.fillRect(758, 58, 86, 262);
    ctx.fillRect(848, 58, 86, 262);
    ctx.fillStyle = '#777777';
    ctx.fillRect(758, 177, 176, 6);
  } else if (scene.id === 'home') {
    drawRoomFurniture(ctx);
  } else if (scene.id === 'living_room') {
    ctx.fillStyle = gameFlow.fridgeEver ? '#a9c6d6' : '#dedede';
    ctx.fillRect(0, 70, 111, 250);
    const dishesDone = gameFlow.completed.has('dishes');
    ctx.fillStyle = dishesDone ? '#9aaf99' : '#777777';
    ctx.fillRect(111, 70, 286, 66);
    ctx.fillRect(111, 202, 286, 118);
    ctx.fillStyle = dishesDone ? '#e4dfc9' : '#d8d8d8';
    ctx.fillRect(111, 190, 286, 12);
    ctx.fillStyle = dishesDone ? '#a6bdc2' : '#999999';
    ctx.fillRect(133, 187, 99, 5);
    ctx.fillRect(180, 165, 5, 22);
    ctx.fillRect(180, 165, 21, 5);
    ctx.fillRect(196, 165, 5, 10);
    ctx.fillRect(264, 190, 123, 5);
    if (gameFlow.mode === 'dialogue' && gameFlow.activityMotion === 'dishes') {
      ctx.fillStyle = '#b7dfe6';
      ctx.fillRect(197, 175, 3, 12);
      ctx.fillRect(191, 183 + Math.round(Math.sin(performance.now() / 100) * 2), 4, 3);
    }
    ctx.fillStyle = '#d2d2d2';
    ctx.fillRect(0, 174, 111, 5 / 3);
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(92, 130.7275, 5, 31.36);
    ctx.fillRect(92, 196.9025, 5, 47.04);
    ctx.fillStyle = '#6d6d6d';
    ctx.fillRect(111 + 286 / 3 - 5 / 6, 70, 5 / 3, 66);
    ctx.fillRect(111 + 286 * 2 / 3 - 5 / 6, 70, 5 / 3, 66);
    ctx.fillRect(111 + 286 / 4 - 5 / 6, 202, 5 / 3, 118);
    ctx.fillRect(111 + 286 / 2 - 5 / 6, 202, 5 / 3, 118);
    ctx.fillRect(254, 202 + 118 / 3 - 5 / 6, 143, 5 / 3);
    ctx.fillRect(254, 202 + 118 * 2 / 3 - 5 / 6, 143, 5 / 3);
    ctx.fillStyle = '#c9c9c9';
    ctx.fillRect(144.7, 128.5, 26.6, 2.5);
    ctx.fillRect(240.7, 128.5, 26.6, 2.5);
    ctx.fillRect(335.7, 128.5, 26.6, 2.5);
    ctx.fillRect(172, 247.49, 2.5, 23.52);
    ctx.fillRect(190.5, 247.49, 2.5, 23.52);
    ctx.fillRect(308.2, 214, 33.6, 2.5);
    ctx.fillRect(308.2, 253, 33.6, 2.5);
    ctx.fillRect(308.2, 292, 33.6, 2.5);
    ctx.fillStyle = '#dedede';
    ctx.fillRect(610, GROUND_Y - 112, 241, 18);
    ctx.fillRect(610, GROUND_Y - 94, 11, 94);
    ctx.fillRect(840, GROUND_Y - 94, 11, 94);
    ctx.fillRect(548, 177, 8, 79);
    ctx.fillRect(548, 248, 50, 8);
    ctx.fillRect(548, 256, 8, 64);
    ctx.fillRect(590, 256, 8, 64);
    ctx.fillRect(905, 177, 8, 79);
    ctx.fillRect(863, 248, 50, 8);
    ctx.fillRect(863, 256, 8, 64);
    ctx.fillRect(905, 256, 8, 64);
    ctx.fillStyle = '#999999';
    ctx.fillRect(712, 148, 42, 60);
    ctx.fillStyle = '#dedede';
    ctx.save();
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('씨리얼', 733, 182);
    ctx.restore();
    ctx.fillStyle = '#777777';
    ctx.beginPath();
    ctx.moveTo(642, GROUND_Y - 128);
    ctx.lineTo(684, GROUND_Y - 128);
    ctx.lineTo(678, GROUND_Y - 112);
    ctx.lineTo(648, GROUND_Y - 112);
    ctx.closePath();
    ctx.fill();
    if (gameFlow.breakfastBowl === 'placed') {
      ctx.fillStyle = gameFlow.breakfastEver ? '#87b2c2' : '#777777';
      ctx.beginPath();
      ctx.moveTo(784, GROUND_Y - 128);
      ctx.lineTo(826, GROUND_Y - 128);
      ctx.lineTo(820, GROUND_Y - 112);
      ctx.lineTo(790, GROUND_Y - 112);
      ctx.closePath();
      ctx.fill();
    }
  } else if (scene.id === 'elevator' || scene.id === 'floor1_elevator') {
    ctx.fillStyle = '#777777';
    ctx.font = '900 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(scene.id === 'elevator' ? '8층' : '1층', 480, 50);

    const rideElapsed = elevatorRide.startedAt === null
      ? -1
      : performance.now() - elevatorRide.startedAt;
    const arrivalElapsed = elevatorArrival.startedAt === null
      ? -1
      : performance.now() - elevatorArrival.startedAt;
    const openProgress = arrivalElapsed >= 0
      ? arrivalElapsed < 1100
        ? arrivalElapsed / 1100
        : arrivalElapsed < 2100
          ? 1
          : arrivalElapsed < 3200
            ? 1 - (arrivalElapsed - 2100) / 1100
            : 0
      : rideElapsed < 750
        ? 0
        : rideElapsed < 1850
          ? (rideElapsed - 750) / 1100
          : rideElapsed < 2850
            ? 1
            : rideElapsed < 3950
              ? 1 - (rideElapsed - 2850) / 1100
              : 0;
    if (openProgress > 0) {
      ctx.fillStyle = '#666666';
      ctx.fillRect(358, 84, 244, 236);
    }
    const doorWidth = 120 * (1 - openProgress);
    ctx.fillStyle = '#999999';
    if (doorWidth > 0) {
      ctx.fillRect(358, 84, doorWidth, 236);
      ctx.fillRect(602 - doorWidth, 84, doorWidth, 236);
    }
    ctx.fillStyle = rideElapsed >= 0 && scene.id === 'floor1_elevator' ? '#484848' : '#777777';
    ctx.fillRect(310, 191, 18, 18);
    ctx.fillStyle = rideElapsed >= 0 && scene.id === 'elevator' ? '#484848' : '#777777';
    ctx.fillRect(310, 213, 18, 18);
    ctx.fillStyle = '#999999';
    ctx.fillRect(779, 84, 120, 236);
    ctx.fillStyle = '#777777';
    ctx.fillRect(876, 216, 8, 8);
    ctx.fillStyle = '#858585';
    ctx.fillRect(791, 106, 96, 32);
    ctx.save();
    ctx.fillStyle = '#dddddd';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('계단', 839, 122);
    ctx.restore();
  } else if (scene.id === 'apartment_hallway') {
    for (const [doorX, unitNumber] of [[130, '887호'], [420, '888호'], [710, '889호']]) {
      ctx.fillStyle = '#999999';
      ctx.fillRect(doorX, 84, 120, 236);
      ctx.fillStyle = '#858585';
      ctx.fillRect(doorX + 12, 106, 96, 32);
      ctx.save();
      ctx.fillStyle = '#dddddd';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(unitNumber, doorX + 60, 128);
      ctx.fillStyle = '#777777';
      ctx.fillRect(doorX + 97, 216, 8, 8);
      ctx.restore();
    }
  } else {
    drawOutdoorBackground(ctx, scene);
  }
}

let showShortcutHelp = false;

function drawShortcutHelp(ctx) {
  ctx.save();
  ctx.fillStyle = 'rgba(25, 25, 25, 0.88)';
  ctx.fillRect(20, 16, 920, 180);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('맵 바로 이동', 36, 36);
  ctx.font = '13px sans-serif';
  const mapShortcuts = [
    '1 집', '2 부엌', '3 1층 엘리베이터', '4 아파트 현관', '5 버스 정류장',
    '6 버스 내부', '7 학교 교실', '8 바다', '9 학원', '0 냉장고 퍼즐',
  ];
  mapShortcuts.forEach((label, index) => {
    const column = Math.floor(index / 5);
    const row = index % 5;
    ctx.fillText(label, 36 + column * 190, 60 + row * 22);
  });
  ctx.fillStyle = '#bdbdbd';
  ctx.fillText('Shift 이동 속도 높이기', 430, 60);
  ctx.fillText('Q 부엌 식사 / 현관 출입 제한 건너뛰기', 430, 82);
  ctx.fillText('R 정류장: 버스 부르기 / 버스 안: 학교로 이동', 430, 104);
  ctx.fillText('0 냉장고 퍼즐 바로 이동', 430, 126);
  ctx.fillText('Tab 안내 닫기', 430, 148);
  ctx.restore();
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
  if (currentSceneId !== 'refrigerator' && !(currentSceneId === 'bus_stop' && busArrival.state === 'departing' && busArrival.departureTarget === null)) {
    player.draw(ctx);
    if (gameFlow.breakfastBowl === 'carried') {
      const bowlX = player.x + player.facing * 28;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(player.x, GROUND_Y - 95);
      ctx.lineTo(player.x + player.facing * 12, GROUND_Y - 77);
      ctx.lineTo(bowlX, GROUND_Y - 77);
      ctx.stroke();
      ctx.fillStyle = '#777777';
      ctx.beginPath();
      ctx.moveTo(bowlX - 18, GROUND_Y - 80);
      ctx.lineTo(bowlX + 18, GROUND_Y - 80);
      ctx.lineTo(bowlX + 13, GROUND_Y - 66);
      ctx.lineTo(bowlX - 13, GROUND_Y - 66);
      ctx.closePath();
      ctx.fill();
    }
  }
  drawOutdoorForeground(ctx, currentScene);
  drawNearbyActivityHighlight(ctx);

  // 4. Particle Effects
  updateAndDrawParticles(ctx);
  drawFlowOverlay(ctx);

  ctx.restore();

  // Screen Fade Transition
  sceneTransition.draw(ctx);
  if (showShortcutHelp) drawShortcutHelp(ctx);

  requestAnimationFrame(gameLoop);
}

// Keyboard Event Handlers (Strictly Keyboard-Only Controls)
window.addEventListener('keydown', (e) => {
  window.soundEngine.ensureResume();
  if (['monitorMenu', 'monitorTyping', 'monitorSuccess'].includes(gameFlow.mode)) {
    handleGameFlowKey(e);
    return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!e.repeat) showShortcutHelp = !showShortcutHelp;
    return;
  }
  if (!sceneTransition.active && /^[0-9]$/.test(e.key)) {
    e.preventDefault();
    if (e.repeat) return;
    const mapOrder = ['home', 'living_room', 'floor1_elevator', 'apartment_hallway', 'bus_stop', 'bus', 'school_board', 'sea', 'academy'];
    const targetScene = e.key === '0' ? 'refrigerator' : mapOrder[Number(e.key) - 1];
    if (targetScene) {
      const spawnPositions = { home: 680, living_room: 480, floor1_elevator: 480, apartment_hallway: 480, bus_stop: 350, bus: 100, school_board: 480, sea: 480, academy: 480, refrigerator: 55 };
      gameFlow.mode = null;
      gameFlow.dialogue = null;
      gameFlow.activityMotion = null;
      sceneTransition.start(targetScene, spawnPositions[targetScene]);
    }
    return;
  }
  if (!sceneTransition.active && (e.key === 'q' || e.key === 'Q') &&
      (currentSceneId === 'living_room' || currentSceneId === 'home_front' || currentSceneId === 'school_board')) {
    e.preventDefault();
    if (e.repeat) return;
    if (currentSceneId === 'living_room') {
      gameFlow.skipMealGate = true;
      if (gameFlow.mode === 'dialogue' && gameFlow.dialogue === '배가 고프다.') {
        gameFlow.dialogue = null;
        gameFlow.activityMotion = null;
        setFlowMode(null);
      }
    } else if (currentSceneId === 'home_front') {
      gameFlow.schoolAccessUnlocked = true;
      if (gameFlow.mode === 'dialogue' && gameFlow.dialogue === '학교에 가야 한다.') {
        gameFlow.dialogue = null;
        gameFlow.activityMotion = null;
        setFlowMode(null);
      }
    } else {
      gameFlow.schoolClassesAttended = 2;
      gameFlow.schoolClassStartedAt = null;
      gameFlow.dialogue = null;
      gameFlow.activityMotion = null;
      setFlowMode(null);
    }
    return;
  }
  if (!sceneTransition.active && (e.key === 'r' || e.key === 'R') && currentSceneId === 'bus_stop') {
    e.preventDefault();
    if (e.repeat) return;
    if (Math.abs(player.x - 53) < 82 && busArrival.state !== 'departing') {
      player.sitting = null;
      gameFlow.dialogue = null;
      gameFlow.activityMotion = null;
      setFlowMode(null);
      sceneTransition.start('street', 70);
      return;
    }
    if (gameFlow.schoolClassesAttended > 0) {
      gameFlow.dialogue = '학교 수업을 들은 뒤에는 버스를 탈 수 없다.';
      gameFlow.activityMotion = null;
      setFlowMode('dialogue');
      return;
    }
    if (busArrival.state === 'departing') {
      if (busArrival.departureTarget !== null) return;
      busArrival.x = currentScene.width;
      sceneTransition.start('bus', 100);
      return;
    }
    busArrival.state = 'stopped';
    busArrival.x = BUS_STOP_POSITION;
    busArrival.idleSince = null;
    gameFlow.dialogue = null;
    gameFlow.activityMotion = null;
    setFlowMode(null);
    updateGameFlow(0);
    return;
  }
  if (!sceneTransition.active && (e.key === 'r' || e.key === 'R') && currentSceneId === 'bus') {
    e.preventDefault();
    if (e.repeat) return;
    player.sitting = null;
    gameFlow.dialogue = null;
    gameFlow.activityMotion = null;
    setFlowMode(null);
    sceneTransition.start('school_field', 70);
    return;
  }
  if (currentSceneId === 'bus' && busJourney.state === 'stopped' && !busJourney.bellPressed) {
    busJourney.departAt = null;
  }
  if (busArrival.state === 'departing' &&
      (currentSceneId === 'bus_stop' || busArrival.departureTarget === currentSceneId)) {
    e.preventDefault();
    return;
  }
  if (currentSceneId === 'bus_stop' && busArrival.state === 'waiting') {
    busArrival.idleSince = null;
  }

  // Sound Mute Toggle with 'M' key
  if (e.key === 'm' || e.key === 'M') {
    window.soundEngine.toggleMute();
    return;
  }

  if (e.key === 'x' || e.key === 'X') {
    e.preventDefault();
    if (e.repeat) return;
    gameFlow.completed.clear();
    gameFlow.breakfastBowl = 'none';
    gameFlow.ateToday = false;
    gameFlow.skipMealGate = false;
    gameFlow.cerealEver = false;
    gameFlow.leftChairSat = false;
    gameFlow.fridgeUnlocked = false;
    gameFlow.breakfastEver = false;
    gameFlow.fridgeEver = false;
    gameFlow.dishesPrompted = false;
    busStopHint.firstSeatAt = null;
    busStopHint.shown = false;
    gameFlow.visitedSchool = false;
    gameFlow.schoolAccessUnlocked = false;
    gameFlow.schoolClassesAttended = 0;
    gameFlow.schoolBreakTalked = false;
    gameFlow.schoolClassStartedAt = null;
    gameFlow.day = 1;
    gameFlow.selectedEnding = null;
    gameFlow.finale = null;
    gameFlow.dialogue = null;
    gameFlow.typing = null;
    gameFlow.calmTime = 0;
    gameFlow.calmText = null;
    gameFlow.calmId = null;
    gameFlow.monitorTask = null;
    monitorTaskInput?.blur();
    if (monitorTaskInput) monitorTaskInput.value = '';
    setFlowMode(null);
    if (currentSceneId === 'refrigerator') sceneTransition.start('living_room', 100);
    updateGameFlow(0);
    return;
  }

  if (handleGameFlowKey(e)) return;
  if (gameFlow.mode) return;

  if (currentSceneId === 'bus' && busJourney.state === 'moving') {
    e.preventDefault();
    return;
  }

  if ((e.code === 'KeyK' || e.key === 'k' || e.key === 'K') && gameFlow.nearby?.kind === 'busBell') {
    e.preventDefault();
    if (e.repeat) return;
    const activity = gameFlow.nearby;
    gameFlow.nearby = null;
    interactWith(activity);
    return;
  }

  if ((e.code === 'Space' || e.key === ' ') && gameFlow.nearby?.kind === 'boardBus') {
    e.preventDefault();
    interactWith(gameFlow.nearby);
    gameFlow.nearby = null;
    return;
  }

  if ((e.code === 'Space' || e.key === ' ') && player.sitting) {
    e.preventDefault();
    if (gameFlow.nearby?.id === 'cat' || gameFlow.nearby?.kind === 'seatedTask') {
      const activity = gameFlow.nearby;
      gameFlow.nearby = null;
      interactWith(activity);
    } else {
      standPlayerUp();
    }
    return;
  }

  if ((e.code === 'Space' || e.key === ' ') && gameFlow.nearby) {
    e.preventDefault();
    if (gameFlow.nearby.kind === 'busBell') return;
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
  if (e.key === 'Shift') {
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
  if (e.key === 'Shift') {
    keys.speedBoost = false;
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
