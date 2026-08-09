document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
  });
});

const jointInputs = Array.from({ length: 6 }, (_, index) =>
  document.getElementById(`j${index + 1}`)
);

const armPath = document.getElementById('armPath');
const armBack = document.getElementById('armBack');
const jointNodes = document.getElementById('jointNodes');
const jointLabels = document.getElementById('jointLabels');
const toolHead = document.getElementById('toolHead');
const targetMark = document.getElementById('targetMark');
const tcpPosition = document.getElementById('tcpPosition');
const autoButton = document.getElementById('autoMotion');

const poses = {
  home: [20, 35, -45, 55, 10, 0],
  reach: [-18, 8, -12, 18, -20, 35],
  print: [42, -28, 72, -58, 38, -90],
};

let autoFrame = 0;
let autoStart = 0;

const radians = (degrees) => (degrees * Math.PI) / 180;

function project(point) {
  return {
    x: 150 + point.x * 0.88 - point.y * 0.46,
    y: 356 - point.z + point.y * 0.22,
  };
}

function robotPoints(values) {
  const [j1, j2, j3, j4, j5] = values.map(radians);
  const yaw = j1;
  const lengths = [110, 98, 62, 42];
  const points3d = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 58 }];
  let radial = 0;
  let height = 58;
  let pitch = j2;

  [j2, j3, j4, j5].forEach((angle, index) => {
    if (index > 0) pitch += angle;
    radial += lengths[index] * Math.cos(pitch);
    height += lengths[index] * Math.sin(pitch);
    points3d.push({
      x: radial * Math.cos(yaw),
      y: radial * Math.sin(yaw),
      z: height,
    });
  });

  const toolLength = 28;
  radial += toolLength * Math.cos(pitch);
  height += toolLength * Math.sin(pitch);
  const tip = {
    x: radial * Math.cos(yaw),
    y: radial * Math.sin(yaw),
    z: height,
  };
  points3d.push(tip);

  return { points3d, points2d: points3d.map(project), tip, pitch };
}

function renderRobot() {
  if (!armPath) return;
  const values = jointInputs.map((input, index) => {
    const value = Number(input.value);
    document.getElementById(`j${index + 1}Value`).textContent = `${value}°`;
    return value;
  });

  const { points3d, points2d, tip, pitch } = robotPoints(values);
  const pathData = points2d.map((point, index) =>
    `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
  ).join(' ');

  armPath.setAttribute('d', pathData);
  armBack.setAttribute('d', pathData);

  jointNodes.innerHTML = points2d.slice(0, 6).map((point, index) => `
    <g transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})">
      <circle class="joint-node" r="${index === 0 ? 15 : 11}" />
      <circle class="joint-node-core" r="3.2" />
    </g>
  `).join('');

  jointLabels.innerHTML = points2d.slice(0, 6).map((point, index) => `
    <text x="${(point.x + 15).toFixed(1)}" y="${(point.y - 13).toFixed(1)}">J${index + 1}</text>
  `).join('');

  const tip2d = points2d.at(-1);
  toolHead.setAttribute('transform',
    `translate(${tip2d.x.toFixed(1)} ${tip2d.y.toFixed(1)}) rotate(${(-pitch * 180 / Math.PI + values[5]).toFixed(1)})`
  );
  targetMark.setAttribute('transform', `translate(${tip2d.x.toFixed(1)} ${tip2d.y.toFixed(1)})`);
  tcpPosition.textContent =
    `X ${Math.round(tip.x).toString().padStart(3, '0')} · Y ${Math.round(tip.y).toString().padStart(3, '0')} · Z ${Math.round(tip.z).toString().padStart(3, '0')}`;
}

function setPose(values) {
  jointInputs.forEach((input, index) => {
    input.value = values[index];
  });
  renderRobot();
}

function stopAuto() {
  cancelAnimationFrame(autoFrame);
  autoFrame = 0;
  autoButton?.setAttribute('aria-pressed', 'false');
  if (autoButton) autoButton.textContent = 'Auto Motion';
}

function animateRobot(timestamp) {
  if (!autoStart) autoStart = timestamp;
  const t = (timestamp - autoStart) / 1000;
  const values = [
    28 * Math.sin(t * .58),
    24 + 28 * Math.sin(t * .74),
    -32 + 42 * Math.sin(t * .91 + 1.2),
    35 + 55 * Math.sin(t * 1.05 + 2.1),
    30 * Math.sin(t * 1.22 + .6),
    150 * Math.sin(t * .86),
  ];
  setPose(values.map(Math.round));
  autoFrame = requestAnimationFrame(animateRobot);
}

jointInputs.forEach((input) => input?.addEventListener('input', () => {
  stopAuto();
  renderRobot();
}));

document.querySelectorAll('[data-pose]').forEach((button) => {
  button.addEventListener('click', () => {
    stopAuto();
    setPose(poses[button.dataset.pose]);
  });
});

autoButton?.addEventListener('click', () => {
  if (autoFrame) {
    stopAuto();
    return;
  }
  autoStart = 0;
  autoButton.setAttribute('aria-pressed', 'true');
  autoButton.textContent = 'Stop Motion';
  autoFrame = requestAnimationFrame(animateRobot);
});

renderRobot();
