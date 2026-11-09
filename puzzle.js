const refrigeratorPuzzle = {
  boardX: 358,
  boardY: 38,
  cellSize: 244 / 6,
  pieces: [],
  dragging: null,
  finishing: false,
};

function resetRefrigeratorPuzzle() {
  const colors = ['#b8c6ba', '#d3b6a3', '#b6c4d2', '#dfcf9e', '#c5b5c2', '#b8cec9'];
  refrigeratorPuzzle.pieces = [];
  for (let groupIndex = 0; groupIndex < 6; groupIndex++) {
    const column = groupIndex % 2;
    const row = Math.floor(groupIndex / 2);
    const targetX = refrigeratorPuzzle.boardX + column * 3 * refrigeratorPuzzle.cellSize;
    const targetY = refrigeratorPuzzle.boardY + row * 2 * refrigeratorPuzzle.cellSize;
    const sourceRow = Math.floor(groupIndex / 3);
    const sourceColumn = groupIndex % 3;
    refrigeratorPuzzle.pieces.push(
      { cells: [[0, 0], [0, 1], [1, 1]], targetX, targetY, x: 28 + sourceColumn * 109, y: 42 + sourceRow * 148, color: colors[groupIndex] },
      { cells: [[0, 0], [1, 0], [1, 1]], targetX: targetX + refrigeratorPuzzle.cellSize, targetY, x: 640 + sourceColumn * 105, y: 42 + sourceRow * 148, color: colors[(groupIndex + 3) % colors.length] },
    );
  }
  for (const piece of refrigeratorPuzzle.pieces) {
    piece.startX = piece.x;
    piece.startY = piece.y;
    piece.placed = false;
  }
  refrigeratorPuzzle.dragging = null;
  refrigeratorPuzzle.finishing = false;
}

function drawPuzzlePiece(context, piece, positionX, positionY, fillColor, strokeColor) {
  const cellSize = refrigeratorPuzzle.cellSize;
  const hasCell = (column, row) => piece.cells.some(cell => cell[0] === column && cell[1] === row);
  context.fillStyle = fillColor;
  for (const [column, row] of piece.cells) {
    context.fillRect(positionX + column * cellSize, positionY + row * cellSize, cellSize, cellSize);
  }
  context.strokeStyle = strokeColor;
  context.lineWidth = 2;
  context.beginPath();
  for (const [column, row] of piece.cells) {
    const left = positionX + column * cellSize;
    const top = positionY + row * cellSize;
    if (!hasCell(column, row - 1)) { context.moveTo(left, top); context.lineTo(left + cellSize, top); }
    if (!hasCell(column + 1, row)) { context.moveTo(left + cellSize, top); context.lineTo(left + cellSize, top + cellSize); }
    if (!hasCell(column, row + 1)) { context.moveTo(left, top + cellSize); context.lineTo(left + cellSize, top + cellSize); }
    if (!hasCell(column - 1, row)) { context.moveTo(left, top); context.lineTo(left, top + cellSize); }
  }
  context.stroke();
}

function drawRefrigeratorPuzzle(context) {
  context.fillStyle = '#b5b5b5';
  context.fillRect(0, 0, 960, 320);
  context.fillStyle = '#777777';
  context.fillRect(refrigeratorPuzzle.boardX, refrigeratorPuzzle.boardY, 244, 244);
  for (const piece of refrigeratorPuzzle.pieces) {
    drawPuzzlePiece(context, piece, piece.targetX, piece.targetY, '#969696', '#777777');
  }
  for (const piece of refrigeratorPuzzle.pieces) {
    if (piece !== refrigeratorPuzzle.dragging?.piece) drawPuzzlePiece(context, piece, piece.x, piece.y, piece.color, '#555555');
  }
  if (refrigeratorPuzzle.dragging) {
    const piece = refrigeratorPuzzle.dragging.piece;
    drawPuzzlePiece(context, piece, piece.x, piece.y, piece.color, '#555555');
  }
}

function puzzlePointerPosition(event) {
  const rectangle = canvas.getBoundingClientRect();
  return { x: (event.clientX - rectangle.left) * canvas.width / rectangle.width, y: (event.clientY - rectangle.top) * canvas.height / rectangle.height };
}

document.addEventListener('pointerdown', event => {
  if (event.target !== canvas || currentSceneId !== 'refrigerator' || sceneTransition.active || refrigeratorPuzzle.finishing || event.button !== 0) return;
  window.soundEngine.ensureResume();
  const position = puzzlePointerPosition(event);
  const piece = [...refrigeratorPuzzle.pieces].reverse().find(candidate => !candidate.placed && candidate.cells.some(([column, row]) => {
    const left = candidate.x + column * refrigeratorPuzzle.cellSize;
    const top = candidate.y + row * refrigeratorPuzzle.cellSize;
    return position.x >= left && position.x < left + refrigeratorPuzzle.cellSize && position.y >= top && position.y < top + refrigeratorPuzzle.cellSize;
  }));
  if (!piece) return;
  refrigeratorPuzzle.dragging = { piece, offsetX: position.x - piece.x, offsetY: position.y - piece.y, pointerId: event.pointerId };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointermove', event => {
  const drag = refrigeratorPuzzle.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const position = puzzlePointerPosition(event);
  drag.piece.x = position.x - drag.offsetX;
  drag.piece.y = position.y - drag.offsetY;
  event.preventDefault();
});

function finishPuzzleDrag(event, cancelled = false) {
  const drag = refrigeratorPuzzle.dragging;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const piece = drag.piece;
  refrigeratorPuzzle.dragging = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (!cancelled && Math.hypot(piece.x - piece.targetX, piece.y - piece.targetY) <= 16) {
    piece.x = piece.targetX;
    piece.y = piece.targetY;
    piece.placed = true;
    window.soundEngine.playPuzzleSound();
    if (refrigeratorPuzzle.pieces.every(candidate => candidate.placed)) {
      refrigeratorPuzzle.finishing = true;
      window.soundEngine.playPuzzleSound(true);
      gameFlow.completed.add('breakfast_prepared');
      gameFlow.fridgeEver = true;
      gameFlow.breakfastBowl = 'carried';
      window.setTimeout(() => {
        if (currentSceneId === 'refrigerator' && refrigeratorPuzzle.finishing) sceneTransition.start('living_room', 120);
      }, 700);
    }
  } else {
    piece.x = piece.startX;
    piece.y = piece.startY;
  }
}

canvas.addEventListener('pointerup', event => finishPuzzleDrag(event));
canvas.addEventListener('pointercancel', event => finishPuzzleDrag(event, true));