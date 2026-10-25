// Lớp vẽ bản đồ Summoner's Rift 3D (model rift.glb, xem data/map3d/README.md) bằng three.js.
// Toạ độ mô phỏng (0..200) đổi sang model (-96..96) bằng toModel; camera nghiêng kiểu LMHT, nhìn từ phía nam.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { toModel, type Vec } from "../../engine/src/index.ts";

const PITCH = (56 * Math.PI) / 180;
const GRID = 96;

/**
 * Tải model: thử file .glb; nơi không phục vụ được .glb (ví dụ trang artifact) thì đọc bản base64 `<url>.b64.txt`.
 */
async function fetchModel(url: string): Promise<ArrayBuffer> {
  try {
    const r = await fetch(url);
    if (r.ok && !(r.headers.get("content-type") ?? "").includes("text/html")) return await r.arrayBuffer();
  } catch {
    /* thử bản base64 */
  }
  const r = await fetch(`${url}.b64.txt`);
  if (!r.ok) throw new Error(`Không tải được bản đồ 3D (${r.status})`);
  const bin = atob((await r.text()).trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export class Rift3D {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, 1, 600);
  private nodes = new Map<string, THREE.Object3D>();
  private heights = new Float32Array(GRID * GRID);
  private target = new THREE.Vector3();
  distance = 95;
  ready = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene.background = new THREE.Color(0x0d1221);
    this.scene.fog = new THREE.Fog(0x0d1221, 260, 520);
    this.scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x4a4030, 1.9));
    const sun = new THREE.DirectionalLight(0xffeccc, 2.6);
    sun.position.set(-70, 120, 50);
    this.scene.add(sun);
  }

  async load(url: string) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(await fetchModel(url), "");
    this.scene.add(gltf.scene);
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (o.name) this.nodes.set(o.name, o);
    });
    this.buildHeights(gltf.scene.getObjectByName("Terrain"));
    this.ready = true;
  }

  /** Bảng độ cao mặt đất (lấy từ đỉnh lưới Terrain) để đặt nhân vật đúng cao độ */
  private buildHeights(terrain?: THREE.Object3D) {
    const sum = new Float32Array(GRID * GRID);
    const cnt = new Uint16Array(GRID * GRID);
    const v = new THREE.Vector3();
    terrain?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const pos = mesh.geometry?.getAttribute("position");
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const gx = Math.floor(((v.x + 96) / 192) * GRID);
        const gz = Math.floor(((v.z + 96) / 192) * GRID);
        if (gx < 0 || gz < 0 || gx >= GRID || gz >= GRID) continue;
        sum[gz * GRID + gx] += v.y;
        cnt[gz * GRID + gx]++;
      }
    });
    for (let i = 0; i < sum.length; i++) this.heights[i] = cnt[i] ? sum[i] / cnt[i] : 0;
  }

  heightAt(mx: number, mz: number) {
    const gx = Math.max(0, Math.min(GRID - 1, Math.floor(((mx + 96) / 192) * GRID)));
    const gz = Math.max(0, Math.min(GRID - 1, Math.floor(((mz + 96) / 192) * GRID)));
    return Math.max(-0.5, this.heights[gz * GRID + gx]);
  }

  setVisible(node: string, visible: boolean) {
    const n = this.nodes.get(node);
    if (n && n.visible !== visible) n.visible = visible;
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Camera nhìn vào điểm mô phỏng `at` */
  lookAt(at: Vec) {
    const m = toModel(at);
    this.target.set(m.x, this.heightAt(m.x, m.z), m.z);
    this.camera.position.set(m.x, this.target.y + this.distance * Math.sin(PITCH), m.z + this.distance * Math.cos(PITCH));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Chiếu điểm mô phỏng (nâng `lift` đơn vị model) lên màn hình; scale = số px cho 1 đơn vị model tại đó */
  project(at: Vec, lift: number, w: number, h: number) {
    const m = toModel(at);
    const p = new THREE.Vector3(m.x, this.heightAt(m.x, m.z) + lift, m.z);
    const dist = p.distanceTo(this.camera.position);
    p.project(this.camera);
    const scale = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360) * dist);
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, scale, visible: p.z < 1 };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
