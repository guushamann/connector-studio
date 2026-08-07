import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';

interface ViewerProps {
  mesh: THREE.Mesh | null;
  sticks: THREE.Group | null;
  showSticks: boolean;
}

export function Viewer({ mesh, sticks, showSticks }: ViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    holder: THREE.Group;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14171c);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      5000,
    );
    camera.position.set(140, 110, 140);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x30363f, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(80, 140, 60);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xaac4ff, 0.7);
    fill.position.set(-90, 40, -70);
    scene.add(fill);

    const grid = new THREE.GridHelper(400, 40, 0x2c333d, 0x1f242c);
    scene.add(grid);

    const holder = new THREE.Group();
    scene.add(holder);

    worldRef.current = { scene, camera, controls, holder };

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    ro.observe(container);

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    world.holder.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    world.holder.clear();
    if (!mesh) return;

    mesh.material = new THREE.MeshStandardMaterial({
      color: 0xff8c42,
      roughness: 0.55,
      metalness: 0.05,
    });
    world.holder.add(mesh);
    if (sticks && showSticks) world.holder.add(sticks);

    // Frame the object.
    mesh.geometry.computeBoundingSphere();
    const sphere = mesh.geometry.boundingSphere;
    if (sphere) {
      const r = Math.max(sphere.radius, 20);
      const target = sphere.center.clone();
      world.controls.target.copy(target);
      const dir = new THREE.Vector3(1, 0.8, 1).normalize();
      world.camera.position.copy(target.clone().addScaledVector(dir, r * 3.2));
      world.camera.near = r / 100;
      world.camera.far = r * 40;
      world.camera.updateProjectionMatrix();
    }
  }, [mesh, sticks, showSticks]);

  return <div ref={containerRef} className="viewer" />;
}
