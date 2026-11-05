import {
  ACESFilmicToneMapping, CanvasTexture, Color, DirectionalLight,
  Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, QuadraticBezierCurve3, RingGeometry,
  Scene, SphereGeometry, SRGBColorSpace, TubeGeometry, Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { meltShape } from './session.ts';
import { IceGeometry } from './ice-geometry.ts';

export function createIceScene(container: HTMLElement, onFailure: () => void) {
  const mobile = window.matchMedia('(max-width: 640px)').matches;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x10191e, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.append(renderer.domElement);

  const scene = new Scene();
  scene.fog = new Fog(0x10191e, 11, 21);
  const camera = new PerspectiveCamera(31, 1, 0.1, 40);
  camera.position.set(4.4, 3.1, 7.5);
  camera.lookAt(0, 0.75, 0);

  // Local studio lighting: no remote HDR, models, textures, or API calls.
  const room = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.75;
  room.dispose();
  pmrem.dispose();
  const sky = new HemisphereLight(0xc8e8f5, 0x1a2630, 2);
  const key = new DirectionalLight(0xf2faff, 3.4);
  key.position.set(-3, 7, 4);
  const rim = new DirectionalLight(0xa4cddf, 2.8);
  rim.position.set(3, 3, -4);
  scene.add(sky, key, rim);

  const floor = new Mesh(new PlaneGeometry(70, 70), new MeshBasicMaterial({ color: 0x10191e, toneMapped: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.045;
  scene.add(floor);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const context = shadowCanvas.getContext('2d')!;
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(0,0,0,0.7)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadowTexture = new CanvasTexture(shadowCanvas);
  const shadow = new Mesh(new PlaneGeometry(4, 3), new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0.7 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.025;
  scene.add(shadow);

  const ice = new Group();
  ice.rotation.set(0.025, -0.3, -0.045);
  scene.add(ice);
  const geometry = new IceGeometry(mobile ? 22 : 30);
  const material = new MeshPhysicalMaterial({
    color: 0xcce8f1, roughness: 0.1, metalness: 0,
    transmission: 0.82, thickness: 1.6, ior: 1.31,
    attenuationColor: new Color(0x96ccdf), attenuationDistance: 4,
    clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.25,
  });
  const cube = new Mesh(geometry, material);
  ice.add(cube);

  const bubbleGeometry = new SphereGeometry(1, 8, 6);
  const bubbleMaterial = new MeshPhysicalMaterial({ color: 0x96b7c5, roughness: 0.15, metalness: 0.4 });
  for (let i = 0; i < 19; i++) {
    const bubble = new Mesh(bubbleGeometry, bubbleMaterial);
    bubble.position.set(Math.sin(i * 17.4) * 0.64, Math.sin(i * 9.7) * 0.7, Math.cos(i * 5.2) * 0.61);
    const size = 0.003 + ((Math.sin(i * 6.7) + 1) / 2) * 0.009;
    bubble.scale.set(size, size * 1.5, size);
    ice.add(bubble);
  }
  const frost = new Mesh(new SphereGeometry(0.52, 20, 14), new MeshStandardMaterial({ color: 0xd7e8eb, transparent: true, opacity: 0.075, roughness: 1, depthWrite: false }));
  frost.scale.set(0.65, 1.4, 0.7);
  frost.rotation.z = 0.4;
  ice.add(frost);
  const fractureMaterial = new MeshBasicMaterial({ color: 0xe6f4f8, transparent: true, opacity: 0.11, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const path = new QuadraticBezierCurve3(
      new Vector3(-0.62 + i * 0.17, -0.55, -0.25 + i * 0.15),
      new Vector3(0.1, 0.05, 0.4 - i * 0.1),
      new Vector3(0.45 - i * 0.2, 0.72, 0.15),
    );
    ice.add(new Mesh(new TubeGeometry(path, 12, 0.0035, 3, false), fractureMaterial));
  }

  const waterMaterial = new MeshPhysicalMaterial({ color: 0x80a6b5, roughness: 0.09, transmission: 0.65, thickness: 0.08, ior: 1.333, transparent: true, opacity: 0.72, metalness: 0.05, envMapIntensity: 0.65, depthWrite: false });
  const water = new Mesh(new SphereGeometry(1, 64, 16), waterMaterial);
  water.position.set(0.12, 0, 0.1);
  water.rotation.y = 0.3;
  scene.add(water);
  const edgeMaterial = new MeshBasicMaterial({ color: 0xa1c1ca, transparent: true, opacity: 0.07, depthWrite: false });
  const waterEdge = new Mesh(new RingGeometry(0.992, 1, 80), edgeMaterial);
  waterEdge.rotation.x = -Math.PI / 2;
  waterEdge.position.copy(water.position);
  waterEdge.position.y = 0.012;
  scene.add(waterEdge);

  let disposed = false;
  let failed = false;
  let lastProgress = -1;
  let requested = 0;
  function draw() {
    requested = 0;
    if (disposed || failed || document.hidden) return;
    try { renderer.render(scene, camera); }
    catch { failed = true; onFailure(); }
  }
  function requestDraw() { if (!requested && !disposed && !failed) requested = requestAnimationFrame(draw); }
  function update(progress: number) {
    const p = Math.max(0, Math.min(1, progress));
    if (Math.abs(lastProgress - p) < 0.00001) return;
    const shape = meltShape(p);
    geometry.updateMelt(p);
    lastProgress = p;
    ice.visible = p < 1;
    ice.scale.set(shape.scale, shape.scale * (1 - p * 0.15), shape.scale);
    ice.position.y = shape.scale * (1 - p * 0.15) + 0.015;
    const radius = 1.05 + shape.water * 1.25;
    water.scale.set(radius, 0.018 + p * 0.015, radius * 0.76);
    waterEdge.scale.set(radius, radius * 0.76, 1);
    shadow.scale.setScalar(Math.max(0.1, shape.scale));
    requestDraw();
  }
  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height || disposed) return;
    // CSS owns layout; stale pixel inline widths must not overflow on resize.
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.set(4.4, 3.1, width < 460 ? 9.7 : 7.5);
    camera.lookAt(0, 0.75, 0);
    camera.updateProjectionMatrix();
    requestDraw();
  }
  function contextLost(event: Event) { event.preventDefault(); failed = true; onFailure(); }
  function visible() { if (!document.hidden) requestDraw(); }
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  document.addEventListener('visibilitychange', visible);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  update(0);

  return {
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(requested);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visible);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      const geometries = new Set<import('three').BufferGeometry>();
      const materials = new Set<import('three').Material>();
      scene.traverse(object => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry);
          for (const mat of Array.isArray(object.material) ? object.material : [object.material]) materials.add(mat);
        }
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      shadowTexture.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
