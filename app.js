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
const ikInputs = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'].map((axis) => document.getElementById(`ik${axis}`));
const ikOutputs = ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'].map((axis) => document.getElementById(`ik${axis}Value`));
const ikStatus = document.getElementById('ikStatus');
const solveIKButton = document.getElementById('solveIK');
const readTCPButton = document.getElementById('readTCP');

const poses = {
  home: [-20, -70, 85, -105, -90, 15],
  reach: [12, -38, 58, -108, -90, 0],
  print: [46, -82, 112, -120, -90, 55],
};

const radians = (degrees) => THREE.MathUtils.degToRad(degrees);
let autoMotion = false;
let autoStart = 0;

function initRobotLab() {
  if (!container || jointInputs.some((input) => !input) || ikInputs.some((input) => !input)) return;

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
  trailGeometry.setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  scene.add(trail);
  const trailPoints = [];
  const worldTCP = new THREE.Vector3();
  const previousTCP = new THREE.Vector3(Infinity, Infinity, Infinity);
  const poseEuler = new THREE.Euler(0, 0, 0, 'XYZ');

  function readPose() {
    scene.updateMatrixWorld(true);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    toolTip.getWorldPosition(position);
    toolTip.getWorldQuaternion(quaternion);
    return { position, quaternion };
  }

  function orientationVector(targetQuaternion, currentQuaternion) {
    const delta = targetQuaternion.clone().multiply(currentQuaternion.clone().invert());
    if (delta.w < 0) delta.multiplyScalar(-1);
    const vector = new THREE.Vector3(delta.x, delta.y, delta.z);
    const sine = vector.length();
    if (sine < 1e-8) return vector.multiplyScalar(2);
    const angle = 2 * Math.atan2(sine, Math.max(-1, Math.min(1, delta.w)));
    return vector.multiplyScalar(angle / sine);
  }

  function setJointTransforms(values) {
    joints[0].rotation.y = radians(values[0]);
    // UR joint signs are mapped to the visual model's local axes.
    joints[1].rotation.z = radians(-values[1]);
    joints[2].rotation.z = radians(-values[2]);
    joints[3].rotation.z = radians(-values[3]);
    joints[4].rotation.y = radians(values[4]);
    joints[5].rotation.x = radians(values[5]);
  }

  function setIKOutput(values) {
    const units = [' mm', ' mm', ' mm', '°', '°', '°'];
    ikOutputs.forEach((output, index) => {
      if (output) output.textContent = `${Math.round(values[index]).toString().padStart(3, '0')}${units[index]}`;
    });
  }

  function setIKTargetFromPose(pose) {
    poseEuler.setFromQuaternion(pose.quaternion, 'XYZ');
    const values = [
      pose.position.x * 1000,
      pose.position.z * 1000,
      pose.position.y * 1000,
      THREE.MathUtils.radToDeg(poseEuler.x),
      THREE.MathUtils.radToDeg(poseEuler.y),
      THREE.MathUtils.radToDeg(poseEuler.z),
    ];
    values.forEach((value, index) => { ikInputs[index].value = Math.round(value); });
    setIKOutput(values);
  }

  function targetPoseFromInputs() {
    const values = ikInputs.map((input) => Number(input.value));
    const euler = new THREE.Euler(
      radians(values[3]),
      radians(values[4]),
      radians(values[5]),
      'XYZ'
    );
    return {
      position: new THREE.Vector3(values[0] / 1000, values[2] / 1000, values[1] / 1000),
      quaternion: new THREE.Quaternion().setFromEuler(euler),
      values,
    };
  }

  function updateTCP(addTrailPoint = true, syncIKTarget = false) {
    const pose = readPose();
    worldTCP.copy(pose.position);
    tcpPosition.textContent = [
      `X ${Math.round(worldTCP.x * 1000)}`,
      `Y ${Math.round(worldTCP.z * 1000)}`,
      `Z ${Math.round(worldTCP.y * 1000)}`,
    ].join(' · ');

    if (syncIKTarget) setIKTargetFromPose(pose);

    if (addTrailPoint && worldTCP.distanceTo(previousTCP) > 0.004) {
      trailPoints.push(worldTCP.clone());
      if (trailPoints.length > 140) trailPoints.shift();
      trailGeometry.setFromPoints(trailPoints);
      trailGeometry.setDrawRange(0, trailPoints.length);
      previousTCP.copy(worldTCP);
    }
  }

  function clearTrail() {
    trailPoints.length = 0;
    trailGeometry.setDrawRange(0, 0);
    previousTCP.set(Infinity, Infinity, Infinity);
  }

  function applyJointValues(values, addTrailPoint = true, syncIKTarget = false) {
    values.forEach((value, index) => {
      jointInputs[index].value = Math.round(value);
      document.getElementById(`j${index + 1}Value`).textContent = `${Math.round(value)}°`;
    });
    setJointTransforms(values);
    updateTCP(addTrailPoint, syncIKTarget);
  }

  function currentValues() {
    return jointInputs.map((input) => Number(input.value));
  }

  function solveLinearSystem(matrix, vector) {
    const size = vector.length;
    const augmented = matrix.map((row, index) => [...row, vector[index]]);
    for (let column = 0; column < size; column += 1) {
      let pivot = column;
      for (let row = column + 1; row < size; row += 1) {
        if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
      }
      if (Math.abs(augmented[pivot][column]) < 1e-10) return Array(size).fill(0);
      [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
      for (let row = column + 1; row < size; row += 1) {
        const factor = augmented[row][column] / augmented[column][column];
        for (let value = column; value <= size; value += 1) {
          augmented[row][value] -= factor * augmented[column][value];
        }
      }
    }
    const solution = Array(size).fill(0);
    for (let row = size - 1; row >= 0; row -= 1) {
      let sum = augmented[row][size];
      for (let column = row + 1; column < size; column += 1) sum -= augmented[row][column] * solution[column];
      solution[row] = sum / augmented[row][row];
    }
    return solution;
  }

  function dampedJointStep(jacobian, error, damping = 0.004) {
    const size = 6;
    const normal = Array.from({ length: size }, () => Array(size).fill(0));
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        for (let index = 0; index < size; index += 1) normal[row][column] += jacobian[row][index] * jacobian[column][index];
        if (row === column) normal[row][column] += damping * damping;
      }
    }
    const y = solveLinearSystem(normal, error);
    return Array.from({ length: size }, (_, column) => {
      let value = 0;
      for (let row = 0; row < size; row += 1) value += jacobian[row][column] * y[row];
      return value;
    });
  }

  function solveIK(target) {
    const lower = -180;
    const upper = 180;
    const deltaDegrees = 0.8;
    let solution = currentValues();
    let best = solution.slice();
    let bestMetric = Infinity;
    let bestPositionError = Infinity;
    let bestOrientationError = Infinity;
    const orientationWeight = 0.08;

    for (let iteration = 0; iteration < 140; iteration += 1) {
      setJointTransforms(solution);
      const pose = readPose();
      const positionError = target.position.clone().sub(pose.position);
      const rotationError = orientationVector(target.quaternion, pose.quaternion);
      const metric = positionError.length() + rotationError.length() * orientationWeight;
      if (metric < bestMetric) {
        bestMetric = metric;
        best = solution.slice();
        bestPositionError = positionError.length();
        bestOrientationError = rotationError.length();
      }
      if (positionError.length() < 0.004 && rotationError.length() < radians(4)) break;

      const error = [
        positionError.x,
        positionError.y,
        positionError.z,
        rotationError.x * orientationWeight,
        rotationError.y * orientationWeight,
        rotationError.z * orientationWeight,
      ];
      const jacobian = Array.from({ length: 6 }, () => Array(6).fill(0));
      for (let joint = 0; joint < 6; joint += 1) {
        const probe = solution.slice();
        probe[joint] = Math.min(upper, probe[joint] + deltaDegrees);
        const actualDelta = probe[joint] - solution[joint];
        if (actualDelta === 0) continue;
        setJointTransforms(probe);
        const probePose = readPose();
        const probeRotation = orientationVector(probePose.quaternion, pose.quaternion);
        jacobian[0][joint] = (probePose.position.x - pose.position.x) / actualDelta;
        jacobian[1][joint] = (probePose.position.y - pose.position.y) / actualDelta;
        jacobian[2][joint] = (probePose.position.z - pose.position.z) / actualDelta;
        jacobian[3][joint] = (probeRotation.x / actualDelta) * orientationWeight;
        jacobian[4][joint] = (probeRotation.y / actualDelta) * orientationWeight;
        jacobian[5][joint] = (probeRotation.z / actualDelta) * orientationWeight;
      }
      const step = dampedJointStep(jacobian, error);
      solution = solution.map((value, index) => Math.max(lower, Math.min(upper, value + step[index] * 0.82)));
    }
    setJointTransforms(best);
    return { values: best, positionError: bestPositionError, orientationError: bestOrientationError };
  }

  function setIKStatus(message) {
    if (ikStatus) ikStatus.textContent = message;
  }

  function stopAuto() {
    autoMotion = false;
    autoButton?.setAttribute('aria-pressed', 'false');
    if (autoButton) autoButton.textContent = 'Auto Motion';
  }

  jointInputs.forEach((input) => {
    input.addEventListener('input', () => {
      stopAuto();
      applyJointValues(currentValues(), true, true);
      setIKStatus('Manual joint control');
    });
  });

  ikInputs.forEach((input, index) => {
    input.addEventListener('input', () => {
      const values = ikInputs.map((item) => Number(item.value));
      setIKOutput(values);
      setIKStatus(index < 3 ? 'Position target' : 'Orientation target');
    });
  });

  solveIKButton?.addEventListener('click', () => {
    stopAuto();
    const target = targetPoseFromInputs();
    const result = solveIK(target);
    clearTrail();
    applyJointValues(result.values, true, false);
    const positionMillimetres = Math.round(result.positionError * 1000);
    const orientationDegrees = Math.round(THREE.MathUtils.radToDeg(result.orientationError));
    const quality = positionMillimetres <= 8 ? 'Solved' : 'Approximate';
    setIKStatus(`${quality} · ${positionMillimetres} mm / ${orientationDegrees}°`);
  });

  readTCPButton?.addEventListener('click', () => {
    setIKTargetFromPose(readPose());
    setIKStatus('TCP loaded');
  });

  document.querySelectorAll('[data-pose]').forEach((button) => {
    button.addEventListener('click', () => {
      stopAuto();
      clearTrail();
      applyJointValues(poses[button.dataset.pose], true, true);
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
  applyJointValues(currentValues(), false, true);

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
