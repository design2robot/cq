import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (event) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
  });
});

const container = document.getElementById('robotCanvas');
const fallback = document.getElementById('webglFallback');
const tcpPosition = document.getElementById('tcpPosition');
const autoButton = document.getElementById('autoMotion');
const jointInputs = Array.from({ length: 6 }, (_, index) =>
  document.getElementById(`j${index + 1}`)
);

const poses = {
  home: [-20, -70, 85, -105, -90, 15],
  reach: [12, -38, 58, -108, -90, 0],
  print: [46, -82, 112, -120, -90, 55],
};

const radians = (degrees) => THREE.MathUtils.degToRad(degrees);
let autoMotion = false;
let autoStart = 0;

function initRobotLab() {
  if (!container || jointInputs.some((input) => !input)) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f0e9);
  scene.fog = new THREE.Fog(0xf2f0e9, 2.4, 4.2);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10);
  camera.position.set(1.08, 0.82, 1.12);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.prepend(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.target.set(0.18, 0.36, 0);
  controls.minDistance = 0.58;
  controls.maxDistance = 2.7;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xaaa69d, 2.3));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
  keyLight.position.set(1.2, 2.1, 1.4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -1.4;
  keyLight.shadow.camera.right = 1.4;
  keyLight.shadow.camera.top = 1.4;
  keyLight.shadow.camera.bottom = -1.4;
  scene.add(keyLight);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xe5e2da,
    roughness: 0.92,
    metalness: 0,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.08, 80), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.004;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(2.16, 24, 0x8f8e88, 0xc9c7bf);
  grid.position.y = 0.001;
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  scene.add(grid);

  const axis = new THREE.AxesHelper(0.18);
  axis.position.set(-0.76, 0.008, 0.72);
  scene.add(axis);

  const aluminum = new THREE.MeshStandardMaterial({
    color: 0xd9dbd8,
    metalness: 0.45,
    roughness: 0.32,
  });
  const urBlue = new THREE.MeshStandardMaterial({
    color: 0x55a9c7,
    metalness: 0.12,
    roughness: 0.34,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x292d2d,
    metalness: 0.18,
    roughness: 0.48,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xbb3f28,
    metalness: 0.1,
    roughness: 0.4,
  });

  const shadowMeshes = [];
  const track = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shadowMeshes.push(mesh);
    return mesh;
  };

  const cylinder = (radius, length, material, radialSegments = 32) =>
    track(new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, radialSegments),
      material
    ));

  function jointHousing(group, axisName, radius = 0.062, width = 0.105) {
    const housing = cylinder(radius, width, aluminum);
    if (axisName === 'z') housing.rotation.x = Math.PI / 2;
    if (axisName === 'x') housing.rotation.z = Math.PI / 2;
    group.add(housing);

    [-1, 1].forEach((side) => {
      const collar = cylinder(radius * 1.035, width * 0.13, urBlue);
      if (axisName === 'z') {
        collar.rotation.x = Math.PI / 2;
        collar.position.z = side * width * 0.52;
      } else if (axisName === 'x') {
        collar.rotation.z = Math.PI / 2;
        collar.position.x = side * width * 0.52;
      } else {
        collar.position.y = side * width * 0.52;
      }
      group.add(collar);
    });
  }

  function armLink(group, length, radius = 0.047) {
    const link = cylinder(radius, length, aluminum);
    link.rotation.z = -Math.PI / 2;
    link.position.x = length / 2;
    group.add(link);

    const spine = cylinder(radius * 0.43, length * 0.9, dark, 24);
    spine.rotation.z = -Math.PI / 2;
    spine.position.set(length / 2, radius * 0.83, 0);
    group.add(spine);
  }

  // Classic UR5 dimensions in metres: d1, a2, a3, d4, d5, d6.
  const dimensions = [0.089159, 0.425, 0.39225, 0.10915, 0.09465, 0.0823];
  const [d1, a2, a3, d4, d5, d6] = dimensions;

  const ur5 = new THREE.Group();
  ur5.position.set(-0.18, 0, 0);
  scene.add(ur5);

  const basePlate = cylinder(0.104, 0.025, dark);
  basePlate.position.y = 0.0125;
  ur5.add(basePlate);
  const base = cylinder(0.075, d1, aluminum);
  base.position.y = d1 / 2 + 0.025;
  ur5.add(base);
  const baseRing = cylinder(0.082, 0.022, urBlue);
  baseRing.position.y = d1 + 0.026;
  ur5.add(baseRing);

  const joints = [];
  const j1 = new THREE.Group();
  j1.position.y = d1 + 0.04;
  jointHousing(j1, 'y', 0.073, 0.092);
  ur5.add(j1);
  joints.push(j1);

  const shoulderOffset = new THREE.Group();
  shoulderOffset.position.y = 0.055;
  j1.add(shoulderOffset);
  const j2 = new THREE.Group();
  jointHousing(j2, 'z', 0.069, 0.112);
  shoulderOffset.add(j2);
  joints.push(j2);
  armLink(j2, a2, 0.052);

  const j3 = new THREE.Group();
  j3.position.x = a2;
  jointHousing(j3, 'z', 0.064, 0.108);
  j2.add(j3);
  joints.push(j3);
  armLink(j3, a3, 0.045);

  const j4 = new THREE.Group();
  j4.position.x = a3;
  jointHousing(j4, 'z', 0.057, 0.102);
  j3.add(j4);
  joints.push(j4);
  armLink(j4, d4, 0.039);

  const j5 = new THREE.Group();
  j5.position.x = d4;
  jointHousing(j5, 'y', 0.051, 0.09);
  j4.add(j5);
  joints.push(j5);
  armLink(j5, d5, 0.034);

  const j6 = new THREE.Group();
  j6.position.x = d5;
  jointHousing(j6, 'x', 0.045, 0.073);
  j5.add(j6);
  joints.push(j6);

  const flange = cylinder(0.048, 0.025, dark);
  flange.rotation.z = Math.PI / 2;
  flange.position.x = 0.032;
  j6.add(flange);
  const tool = cylinder(0.026, d6, aluminum, 24);
  tool.rotation.z = Math.PI / 2;
  tool.position.x = 0.025 + d6 / 2;
  j6.add(tool);

  const toolTip = new THREE.Group();
  toolTip.position.x = 0.025 + d6;
  const tip = cylinder(0.012, 0.032, accent, 20);
  tip.rotation.z = Math.PI / 2;
  tip.position.x = 0.016;
  toolTip.add(tip);
  j6.add(toolTip);

  const tcpRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.025, 0.0022, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xbb3f28 })
  );
  tcpRing.rotation.y = Math.PI / 2;
  tcpRing.position.x = 0.038;
  toolTip.add(tcpRing);

  const trailMaterial = new THREE.LineBasicMaterial({
    color: 0xbb3f28,
    transparent: true,
    opacity: 0.68,
  });
  const trailGeometry = new THREE.BufferGeometry();
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  scene.add(trail);
  const trailPoints = [];
  const worldTCP = new THREE.Vector3();
  const previousTCP = new THREE.Vector3(Infinity, Infinity, Infinity);

  function updateTCP(addTrailPoint = true) {
    scene.updateMatrixWorld(true);
    toolTip.getWorldPosition(worldTCP);
    tcpPosition.textContent = [
      `X ${Math.round(worldTCP.x * 1000)}`,
      `Y ${Math.round(worldTCP.z * 1000)}`,
      `Z ${Math.round(worldTCP.y * 1000)}`,
    ].join(' · ');

    if (addTrailPoint && worldTCP.distanceTo(previousTCP) > 0.004) {
      trailPoints.push(worldTCP.clone());
      if (trailPoints.length > 140) trailPoints.shift();
      trailGeometry.setFromPoints(trailPoints);
      previousTCP.copy(worldTCP);
    }
  }

  function applyJointValues(values, addTrailPoint = true) {
    values.forEach((value, index) => {
      jointInputs[index].value = Math.round(value);
      document.getElementById(`j${index + 1}Value`).textContent = `${Math.round(value)}°`;
    });
    joints[0].rotation.y = radians(values[0]);
    // UR joint signs are mapped to the visual model's local axes.
    joints[1].rotation.z = radians(-values[1]);
    joints[2].rotation.z = radians(-values[2]);
    joints[3].rotation.z = radians(-values[3]);
    joints[4].rotation.y = radians(values[4]);
    joints[5].rotation.x = radians(values[5]);
    updateTCP(addTrailPoint);
  }

  function currentValues() {
    return jointInputs.map((input) => Number(input.value));
  }

  function stopAuto() {
    autoMotion = false;
    autoButton?.setAttribute('aria-pressed', 'false');
    if (autoButton) autoButton.textContent = 'Auto Motion';
  }

  jointInputs.forEach((input) => {
    input.addEventListener('input', () => {
      stopAuto();
      applyJointValues(currentValues());
    });
  });

  document.querySelectorAll('[data-pose]').forEach((button) => {
    button.addEventListener('click', () => {
      stopAuto();
      trailPoints.length = 0;
      trailGeometry.setFromPoints(trailPoints);
      previousTCP.set(Infinity, Infinity, Infinity);
      applyJointValues(poses[button.dataset.pose]);
    });
  });

  autoButton?.addEventListener('click', () => {
    if (autoMotion) {
      stopAuto();
      return;
    }
    autoMotion = true;
    autoStart = performance.now();
    autoButton.setAttribute('aria-pressed', 'true');
    autoButton.textContent = 'Stop Motion';
  });

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);
  resize();
  applyJointValues(currentValues(), false);

  renderer.setAnimationLoop((time) => {
    if (autoMotion) {
      const t = (time - autoStart) / 1000;
      applyJointValues([
        -10 + 48 * Math.sin(t * 0.42),
        -72 + 20 * Math.sin(t * 0.58 + 0.5),
        88 + 30 * Math.sin(t * 0.64 + 1.7),
        -100 + 36 * Math.sin(t * 0.76 + 2.3),
        -88 + 32 * Math.sin(t * 0.52 + 0.9),
        80 * Math.sin(t * 0.92),
      ]);
    }
    controls.update();
    renderer.render(scene, camera);
  });

  window.addEventListener('beforeunload', () => {
    renderer.setAnimationLoop(null);
    shadowMeshes.forEach((mesh) => mesh.geometry.dispose());
    renderer.dispose();
  });
}

try {
  initRobotLab();
} catch (error) {
  console.error('Unable to initialize the UR5 3D simulator.', error);
  if (fallback) {
    fallback.hidden = false;
    fallback.textContent = '当前浏览器无法启动 3D 视图，请尝试更新浏览器或开启硬件加速。';
  }
}
