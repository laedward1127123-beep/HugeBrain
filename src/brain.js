import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// A proper rotation preserves handedness: RAS right +X, superior +Y, anterior -Z.
function toViewer(values) {
  const output = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 3) {
    output[i] = values[i];
    output[i + 1] = values[i + 2];
    output[i + 2] = -values[i + 1];
  }
  return output;
}

function smoothNormals(positions, indices, supplied) {
  if (supplied) return toViewer(supplied);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal").array.slice();
  geometry.dispose();
  return normals;
}

function parcelEdges(indices, labels) {
  const adjacent = new Map(),
    result = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]],
      label = labels[i / 3];
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge],
        b = triangle[(edge + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!adjacent.has(key)) adjacent.set(key, label);
      else if (adjacent.get(key) !== label) result.push(a, b);
    }
  }
  return result;
}

export class BrainViewer {
  constructor(container, { onSelect, onHover, onReady, onError }) {
    this.container = container;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.meshes = [];
    this.counts = {};
    this.selected = null;
    this.hovered = null;
    this.hemisphere = "both";
    this.surface = "pial";
    this.view = "lateral";
    this.disposed = false;
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch (error) {
      onError(error);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "可旋转的 Destrieux a2009s 三维大脑，拖动旋转，点击选择脑区",
    );
    this.renderer.domElement.setAttribute("role", "img");
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.enablePan = false;
    this.controls.minDistance = 150;
    this.controls.maxDistance = 900;
    this.controls.rotateSpeed = 0.65;
    this.scene.add(new THREE.AmbientLight(0xdeddf7, 1.7));
    for (const [color, strength, position] of [
      [0xffffff, 3.5, [-150, 240, -260]],
      [0xc2bdff, 2, [160, -100, -80]],
      [0xffffff, 2.7, [30, 30, 180]],
    ]) {
      const light = new THREE.DirectionalLight(color, strength);
      light.position.set(...position);
      this.scene.add(light);
    }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    let down;
    this.renderer.domElement.addEventListener("pointerdown", (event) => {
      down = [event.clientX, event.clientY];
    });
    this.renderer.domElement.addEventListener("pointerup", (event) => {
      if (
        down &&
        Math.hypot(event.clientX - down[0], event.clientY - down[1]) < 5
      ) {
        const id = this.pick(event);
        if (id) onSelect(id);
      }
      down = null;
    });
    this.renderer.domElement.addEventListener("pointermove", (event) => {
      const id = this.pick(event);
      if (id !== this.hovered) {
        this.hovered = id;
        this.paint();
      }
      this.renderer.domElement.style.cursor = id ? "pointer" : "grab";
      onHover(id, event);
    });
    this.renderer.domElement.addEventListener("pointerleave", () => {
      this.hovered = null;
      this.paint();
      onHover(null);
    });
    this.setView("lateral");
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
    this.abortController = new AbortController();
    fetch("/data/atlas.json", { signal: this.abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error("脑图谱资源加载失败");
        return response.json();
      })
      .then((atlas) => {
        if (!this.disposed) {
          this.load(atlas);
          onReady(atlas);
        }
      })
      .catch((error) => {
        if (!this.disposed) onError(error);
      });
  }

  load(atlas) {
    this.atlas = atlas;
    for (const hemi of ["lh", "rh"]) {
      const source = atlas.hemispheres[hemi];
      const pial = toViewer(source.positions),
        inflated = source.inflated ? toViewer(source.inflated) : pial;
      const pialNormals = smoothNormals(pial, source.indices, source.normals);
      const inflatedNormals = smoothNormals(
        inflated,
        source.indices,
        source.inflated_normals,
      );
      const labels = [];
      for (let i = 0; i < source.indices.length; i += 3) {
        const [a, b, c] = source.indices
          .slice(i, i + 3)
          .map((index) => source.labels[index]);
        labels.push(a === b || a === c ? a : b === c ? b : a);
      }
      const vertexSource = source.indices,
        geometry = new THREE.BufferGeometry();
      for (const name of ["position", "normal", "color"]) {
        geometry.setAttribute(
          name,
          new THREE.BufferAttribute(
            new Float32Array(vertexSource.length * 3),
            3,
          ),
        );
      }
      const material = new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.32,
        metalness: 0.1,
        clearcoat: 0.8,
        clearcoatRoughness: 0.26,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.userData = {
        hemi,
        labels,
        vertexSource,
        pial,
        inflated,
        pialNormals,
        inflatedNormals,
        sulc: source.sulc || [],
        valid: new Set(
          atlas.regions
            .filter((region) => region.hemisphere === hemi)
            .map((region) => region.label_index),
        ),
      };
      this.group.add(mesh);
      this.meshes.push(mesh);
      // Shared edges of differently colored faces trace the displayed parcels.
      const edges = parcelEdges(source.indices, labels),
        lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(edges.length * 3), 3),
      );
      const lines = new THREE.LineSegments(
        lineGeometry,
        new THREE.LineBasicMaterial({
          color: 0x6c668e,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      );
      lines.userData = { edges, mesh };
      this.group.add(lines);
      mesh.userData.lines = lines;
      mesh.visible = this.hemisphere === "both" || this.hemisphere === hemi;
      lines.visible = mesh.visible;
    }
    this.setSurface(this.surface);
    this.setView(this.view);
    this.paint();
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height || !this.renderer) return;
    this.camera.aspect = width / height;
    // Leave a little more room for the region annotation on wide layouts.
    this.camera.setViewOffset(
      width,
      height,
      width >= 600 ? -width * 0.04 : 0,
      height * 0.04,
      width,
      height,
    );
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    if (this.meshes.length) this.frameVisible();
  }

  // Fit actual visible vertices, not an oversized oblique bounding-box projection.
  frameVisible(
    direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize(),
  ) {
    const box = new THREE.Box3();
    for (const mesh of this.meshes) {
      if (mesh.visible)
        box.union(mesh.geometry.boundingBox.clone().translate(mesh.position));
    }
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    this.group.position.copy(center).negate();
    if (direction.lengthSq() < 0.5) direction.set(-1, 0.2, -0.4).normalize();
    const right = new THREE.Vector3()
      .crossVectors(this.camera.up, direction)
      .normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanVertical = tangent * 0.78,
      tanHorizontal = tangent * this.camera.aspect * 0.9;
    let distance = 1;
    for (const mesh of this.meshes) {
      if (!mesh.visible) continue;
      const coords =
        this.surface === "inflated"
          ? mesh.userData.inflated
          : mesh.userData.pial;
      for (let i = 0; i < coords.length; i += 3) {
        const x = coords[i] + mesh.position.x - center.x;
        const y = coords[i + 1] + mesh.position.y - center.y;
        const z = coords[i + 2] + mesh.position.z - center.z;
        const depth = x * direction.x + y * direction.y + z * direction.z;
        distance = Math.max(
          distance,
          depth +
            Math.abs(x * right.x + y * right.y + z * right.z) / tanHorizontal,
          depth + Math.abs(x * up.x + y * up.y + z * up.z) / tanVertical,
        );
      }
    }
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = Math.max(75, distance * 0.45);
    this.controls.maxDistance = Math.max(650, distance * 2.6);
    this.camera.position.copy(direction).multiplyScalar(distance);
    this.camera.far = Math.max(2000, distance * 4);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.enableDamping = damping;
    this.camera.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.meshes.filter((mesh) => mesh.visible),
    )[0];
    if (!hit) return null;
    const { labels, valid, hemi } = hit.object.userData,
      label = labels[hit.faceIndex];
    return valid.has(label) ? `${hemi}_${label}` : null;
  }

  setView(view) {
    this.view = view;
    const right = this.hemisphere === "rh";
    const directions = {
      lateral: [right ? 370 : -370, 70, -165],
      medial: [right ? -370 : 370, 35, 0],
      top: [0, 440, 12],
      front: [0, 35, -440],
      back: [0, 35, 440],
    };
    const direction = new THREE.Vector3(
      ...(directions[view] || directions.lateral),
    ).normalize();
    if (this.meshes.length) this.frameVisible(direction);
    else {
      this.camera.position.copy(direction).multiplyScalar(440);
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
  }

  setHemisphere(hemi) {
    this.hemisphere = ["lh", "rh"].includes(hemi) ? hemi : "both";
    for (const mesh of this.meshes) {
      mesh.visible =
        this.hemisphere === "both" || mesh.userData.hemi === this.hemisphere;
      mesh.userData.lines.visible = mesh.visible;
    }
    this.hovered = null;
    this.onHover?.(null);
    this.setView(this.view);
    this.paint();
  }

  setSurface(value) {
    this.surface = value === "inflated" ? "inflated" : "pial";
    for (const mesh of this.meshes) {
      const data = mesh.userData,
        coords = this.surface === "inflated" ? data.inflated : data.pial;
      const normals =
        this.surface === "inflated" ? data.inflatedNormals : data.pialNormals;
      const positions = mesh.geometry.getAttribute("position"),
        normalAttribute = mesh.geometry.getAttribute("normal");
      data.vertexSource.forEach((vertex, index) => {
        positions.setXYZ(
          index,
          coords[vertex * 3],
          coords[vertex * 3 + 1],
          coords[vertex * 3 + 2],
        );
        normalAttribute.setXYZ(
          index,
          normals[vertex * 3],
          normals[vertex * 3 + 1],
          normals[vertex * 3 + 2],
        );
      });
      positions.needsUpdate = true;
      normalAttribute.needsUpdate = true;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
      // Inflated source hemispheres are individually centered: separate their
      // display meshes with an 8 mm gap, preserving the original atlas values.
      mesh.position.x =
        this.surface === "inflated"
          ? data.hemi === "lh"
            ? -4 - mesh.geometry.boundingBox.max.x
            : 4 - mesh.geometry.boundingBox.min.x
          : 0;
      data.lines.position.copy(mesh.position);
      const linePositions = data.lines.geometry.getAttribute("position");
      data.lines.userData.edges.forEach((vertex, index) => {
        const offset = vertex * 3;
        linePositions.setXYZ(
          index,
          coords[offset] + normals[offset] * 0.12,
          coords[offset + 1] + normals[offset + 1] * 0.12,
          coords[offset + 2] + normals[offset + 2] * 0.12,
        );
      });
      linePositions.needsUpdate = true;
      data.lines.geometry.computeBoundingSphere();
    }
    if (this.meshes.length) this.frameVisible();
  }

  setHeatmap(counts) {
    this.counts = counts;
    this.paint();
  }
  select(id) {
    this.selected = id;
    this.paint();
  }

  paint() {
    const max = Math.max(1, ...Object.values(this.counts));
    const base = new THREE.Color("#d8d4e4"),
      low = new THREE.Color("#b6a3db"),
      high = new THREE.Color("#7753be");
    const selected = new THREE.Color("#a7bdf5"),
      hover = new THREE.Color("#c4b1ec");
    const color = new THREE.Color(),
      shaded = new THREE.Color();
    for (const mesh of this.meshes) {
      const data = mesh.userData,
        colors = mesh.geometry.getAttribute("color");
      for (let face = 0; face < data.labels.length; face++) {
        const id = `${data.hemi}_${data.labels[face]}`;
        color.copy(base);
        if (this.counts[id])
          color
            .copy(low)
            .lerp(high, (this.counts[id] - 1) / Math.max(1, max - 1));
        if (id === this.selected) color.copy(selected);
        if (id === this.hovered) color.lerp(hover, 0.5);
        if (!data.valid.has(data.labels[face])) color.set("#b3aebf");
        for (let vertex = 0; vertex < 3; vertex++) {
          const index = face * 3 + vertex,
            sulc = data.sulc[data.vertexSource[index]] || 0;
          shaded
            .copy(color)
            .multiplyScalar(1 - Math.max(-0.8, Math.min(0.8, sulc)) * 0.16);
          colors.setXYZ(index, shaded.r, shaded.g, shaded.b);
        }
      }
      colors.needsUpdate = true;
    }
  }

  zoom(factor) {
    this.camera.position.multiplyScalar(factor);
    this.controls.update();
  }

  dispose() {
    this.disposed = true;
    this.abortController?.abort();
    this.renderer?.setAnimationLoop(null);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.userData.lines.geometry.dispose();
      mesh.userData.lines.material.dispose();
    }
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
  }
}
