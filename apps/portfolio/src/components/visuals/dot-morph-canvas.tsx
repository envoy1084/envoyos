// oxlint-disable unicorn/prefer-add-event-listener promise/always-return
import { useEffect, useRef } from "react";

import * as THREE from "three";

type DotMorphCanvasProps = {
  sources: DotMorphSource[];
};

type DotMorphSource =
  | string
  | URL
  | {
      src?: string;
    };

type RawTargetSet = {
  colors: number[];
  positions: number[];
};

type TargetSet = {
  colors: Float32Array;
  positions: Float32Array;
};

type PreparedTargets = {
  count: number;
  sets: TargetSet[];
};

type Ripple = {
  startedAt: number;
  x: number;
  y: number;
};

// Keep the effect tunable from one place. The implementation below is intentionally
// simple: sample source images into dots, tint brightness, and morph with a noise delay.
const DOT_MORPH_CONFIG = {
  frame: {
    aspectRatio: "15 / 4",
    background: "var(--app-bg, #08090a)",
    border: "var(--line-card, #252629)",
    radius: "8px",
    insetHighlight: "#ffffff0a",
  },
  images: {
    maxSources: 3,
    fitMode: "cover",
    sampleStep: 4,
    alphaThreshold: 16 / 255,
    brightnessThreshold: 90 / 255,
    luminanceWeight: 0.2,
    maxChannelWeight: 0.8,
  },
  particles: {
    maxCount: 12000,
    pointSize: 2,
  },
  timing: {
    holdMs: 6000,
    morphMs: 800,
    morphWindow: 0.42,
  },
  renderer: {
    clearColor: "#08090a",
    maxDevicePixelRatio: 2,
    powerPreference: "high-performance",
  },
  colors: {
    baseBrightness: 0.64,
    tint: "var(--content-secondary, #b6baca)",
    spotlight: "var(--content-secondary, #e2e3e5)",
    ripple: "var(--content-secondary, #e2e3e5)",
  },
  interaction: {
    hoverLerp: 0.16,
    lightRadius: 96,
    lightStrength: 0.28,
  },
  ripple: {
    maxCount: 8,
    durationMs: 1100,
    intervalMs: 900,
    speed: 260,
    width: 28,
    brightness: 0.58,
  },
  fallbackShape: {
    radiusX: 0.38,
    radiusY: 0.34,
  },
} as const;

function resolveCssColor(color: string) {
  const variableMatch = color.match(/^var\((--[a-z0-9-]+)(?:,\s*([^)]+))?\)$/i);

  if (!variableMatch) {
    return color;
  }

  const [, variableName, fallback] = variableMatch;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName!)
    .trim();

  return value || fallback?.trim() || color;
}

function createColorVector(color: string) {
  const resolvedColor = new THREE.Color(resolveCssColor(color));

  return new THREE.Vector3(resolvedColor.r, resolvedColor.g, resolvedColor.b);
}

function resolveMorphSource(source: DotMorphSource) {
  if (typeof source === "string") {
    return source;
  }

  if (source instanceof URL) {
    return source.toString();
  }

  return source.src ?? "";
}

const vertexShader = `
  precision highp float;

  attribute vec2 aPositionFrom;
  attribute vec2 aPositionTo;
  attribute vec3 aColorFrom;
  attribute vec3 aColorTo;

  varying vec3 vColor;

  uniform float uDpr;
  uniform float uMorph;
  uniform float uPointSize;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uHover;
  uniform vec3 uTint;
  uniform vec3 uSpotlightColor;
  uniform vec3 uRippleColor;
  uniform vec4 uRipples[${DOT_MORPH_CONFIG.ripple.maxCount}];

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 eased = local * local * (3.0 - 2.0 * local);

    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));

    return mix(mix(a, b, eased.x), mix(c, d, eased.x), eased.y);
  }

  float easeOutCubic(float value) {
    float inverse = 1.0 - value;
    return 1.0 - inverse * inverse * inverse;
  }

  void main() {
    vec2 noisePosition = mix(aPositionFrom, aPositionTo, uMorph);
    float noise = valueNoise(noisePosition * 0.012);
    float delay = (1.0 - ${DOT_MORPH_CONFIG.timing.morphWindow.toFixed(4)}) * noise;
    float localMorph = clamp(
      (uMorph - delay) / ${DOT_MORPH_CONFIG.timing.morphWindow.toFixed(4)},
      0.0,
      1.0
    );
    float morph = easeOutCubic(localMorph);
    vec2 position = mix(aPositionFrom, aPositionTo, morph);
    vec3 sourceColor = mix(aColorFrom, aColorTo, morph);
    float brightness = dot(sourceColor, vec3(0.299, 0.587, 0.114));
    vec3 color = brightness * uTint * ${DOT_MORPH_CONFIG.colors.baseBrightness.toFixed(4)};

    float spotlight = smoothstep(
      ${DOT_MORPH_CONFIG.interaction.lightRadius.toFixed(4)},
      0.0,
      distance(position, uPointer)
    ) * uHover;
    color += uSpotlightColor * spotlight * ${DOT_MORPH_CONFIG.interaction.lightStrength.toFixed(4)};

    float ripple = 0.0;
    for (int index = 0; index < ${DOT_MORPH_CONFIG.ripple.maxCount}; index++) {
      vec4 item = uRipples[index];
      float enabled = item.w;
      float age = max(0.0, uTime - item.z);
      float waveRadius = age * ${DOT_MORPH_CONFIG.ripple.speed.toFixed(4)};
      float ringDistance = distance(position, item.xy) - waveRadius;
      float ring = exp(-pow(ringDistance / ${DOT_MORPH_CONFIG.ripple.width.toFixed(4)}, 2.0));
      float life = clamp(1.0 - age / ${(DOT_MORPH_CONFIG.ripple.durationMs / 1000).toFixed(4)}, 0.0, 1.0);
      ripple += ring * life * enabled;
    }
    color += uRippleColor * ripple * ${DOT_MORPH_CONFIG.ripple.brightness.toFixed(4)};

    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 0.0, 1.0);
    gl_PointSize = uPointSize * uDpr;
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec3 vColor;

  void main() {
    float pointDistance = distance(gl_PointCoord, vec2(0.5));
    float alpha = smoothstep(0.5, 0.44, pointDistance);

    if (alpha <= 0.01) {
      discard;
    }

    gl_FragColor = vec4(vColor, alpha);
  }
`;

function loadMaskImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Unable to load morph image: ${source}`));
    image.src = source;
  });
}

function createFallbackTargets(width: number, height: number) {
  const targets: RawTargetSet = {
    colors: [],
    positions: [],
  };
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * DOT_MORPH_CONFIG.fallbackShape.radiusX;
  const radiusY = height * DOT_MORPH_CONFIG.fallbackShape.radiusY;

  for (let y = 0; y < height; y += DOT_MORPH_CONFIG.images.sampleStep) {
    for (let x = 0; x < width; x += DOT_MORPH_CONFIG.images.sampleStep) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      const distance = normalizedX * normalizedX + normalizedY * normalizedY;

      if (distance <= 1) {
        targets.positions.push(x - width / 2, height / 2 - y);
        targets.colors.push(0.72, 0.74, 0.8);
      }
    }
  }

  return targets;
}

function sampleImageTargets(
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return createFallbackTargets(width, height);
  }

  const pixelWidth = Math.max(1, Math.round(width));
  const pixelHeight = Math.max(1, Math.round(height));
  const naturalWidth = image.naturalWidth || image.width || pixelWidth;
  const naturalHeight = image.naturalHeight || image.height || pixelHeight;
  const coverScale = Math.max(
    pixelWidth / naturalWidth,
    pixelHeight / naturalHeight,
  );
  const containScale = Math.min(
    pixelWidth / naturalWidth,
    pixelHeight / naturalHeight,
  );
  const scale =
    DOT_MORPH_CONFIG.images.fitMode === "cover" ? coverScale : containScale;
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  const drawX = (pixelWidth - drawWidth) / 2;
  const drawY = (pixelHeight - drawHeight) / 2;

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  try {
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  } catch {
    return createFallbackTargets(width, height);
  }

  let data: Uint8ClampedArray;

  try {
    data = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
  } catch {
    return createFallbackTargets(width, height);
  }

  const targets: RawTargetSet = {
    colors: [],
    positions: [],
  };

  for (let y = 0; y < pixelHeight; y += DOT_MORPH_CONFIG.images.sampleStep) {
    for (let x = 0; x < pixelWidth; x += DOT_MORPH_CONFIG.images.sampleStep) {
      const pixelIndex = (y * pixelWidth + x) * 4;
      const red = data[pixelIndex]! / 255;
      const green = data[pixelIndex + 1]! / 255;
      const blue = data[pixelIndex + 2]! / 255;
      const alpha = data[pixelIndex + 3]! / 255;
      const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
      const maxChannel = Math.max(red, green, blue);
      const brightness =
        luminance * DOT_MORPH_CONFIG.images.luminanceWeight +
        maxChannel * DOT_MORPH_CONFIG.images.maxChannelWeight;

      if (
        alpha > DOT_MORPH_CONFIG.images.alphaThreshold &&
        brightness > DOT_MORPH_CONFIG.images.brightnessThreshold
      ) {
        targets.positions.push(x - pixelWidth / 2, pixelHeight / 2 - y);
        targets.colors.push(red, green, blue);
      }
    }
  }

  return targets.positions.length > 0
    ? targets
    : createFallbackTargets(width, height);
}

function normalizeTargetSet(rawTarget: RawTargetSet, count: number) {
  const sourceCount = rawTarget.positions.length / 2;
  const positions = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    const sourceIndex = sourceCount > 0 ? index % sourceCount : 0;

    positions[index * 2] = rawTarget.positions[sourceIndex * 2] ?? 0;
    positions[index * 2 + 1] = rawTarget.positions[sourceIndex * 2 + 1] ?? 0;
    colors[index * 3] = rawTarget.colors[sourceIndex * 3] ?? 0.72;
    colors[index * 3 + 1] = rawTarget.colors[sourceIndex * 3 + 1] ?? 0.74;
    colors[index * 3 + 2] = rawTarget.colors[sourceIndex * 3 + 2] ?? 0.8;
  }

  return { colors, positions };
}

function createPreparedTargets(
  images: HTMLImageElement[],
  width: number,
  height: number,
) {
  const rawTargets = images.map((image) =>
    sampleImageTargets(image, width, height),
  );
  const count = Math.min(
    DOT_MORPH_CONFIG.particles.maxCount,
    Math.max(...rawTargets.map((target) => target.positions.length / 2)),
  );

  return {
    count,
    sets: rawTargets.map((target) => normalizeTargetSet(target, count)),
  };
}

function createPositionAttribute(positions: Float32Array) {
  const positionAttribute = new Float32Array((positions.length / 2) * 3);

  for (let index = 0; index < positions.length / 2; index += 1) {
    positionAttribute[index * 3] = positions[index * 2]!;
    positionAttribute[index * 3 + 1] = positions[index * 2 + 1]!;
    positionAttribute[index * 3 + 2] = 0;
  }

  return positionAttribute;
}

function setGeometryPair(
  geometry: THREE.BufferGeometry,
  preparedTargets: PreparedTargets,
  fromIndex: number,
  toIndex: number,
) {
  const from = preparedTargets.sets[fromIndex]!;
  const to = preparedTargets.sets[toIndex] ?? from;

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(createPositionAttribute(from.positions), 3),
  );
  geometry.setAttribute(
    "aPositionFrom",
    new THREE.BufferAttribute(from.positions, 2),
  );
  geometry.setAttribute(
    "aPositionTo",
    new THREE.BufferAttribute(to.positions, 2),
  );
  geometry.setAttribute(
    "aColorFrom",
    new THREE.BufferAttribute(from.colors, 3),
  );
  geometry.setAttribute("aColorTo", new THREE.BufferAttribute(to.colors, 3));
  geometry.computeBoundingSphere();
}

function createCamera(width: number, height: number) {
  const camera = new THREE.OrthographicCamera(
    -width / 2,
    width / 2,
    height / 2,
    -height / 2,
    -10,
    10,
  );

  camera.position.z = 1;

  return camera;
}

export default function DotMorphCanvas({ sources }: DotMorphCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const pointerRef = useRef(new THREE.Vector2(100000, 100000));
  const reducedMotionRef = useRef(false);
  const visibleRef = useRef(true);

  useEffect(() => {
    const mount = mountRef.current;
    const resolvedSources = sources
      .map(resolveMorphSource)
      .filter(Boolean)
      .slice(0, DOT_MORPH_CONFIG.images.maxSources);

    if (!mount || resolvedSources.length === 0) {
      return;
    }

    let animationFrame = 0;
    let camera = createCamera(1, 1);
    let currentIndex = 0;
    let disposed = false;
    let geometry: THREE.BufferGeometry | null = null;
    let height = 0;
    let lastRippleAt = 0;
    let loadedImages: HTMLImageElement[] = [];
    let morphStartedAt = performance.now();
    let nextIndex = Math.min(1, resolvedSources.length - 1);
    let points: THREE.Points | null = null;
    let preparedTargets: PreparedTargets | null = null;
    let ripples: Ripple[] = [];
    let width = 0;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: DOT_MORPH_CONFIG.renderer.powerPreference,
      });
    } catch {
      return;
    }

    renderer.setClearColor(
      resolveCssColor(DOT_MORPH_CONFIG.renderer.clearColor),
      1,
    );
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const uniforms = {
      uDpr: { value: 1 },
      uHover: { value: 0 },
      uMorph: { value: 0 },
      uPointSize: { value: DOT_MORPH_CONFIG.particles.pointSize },
      uPointer: { value: pointerRef.current },
      uRippleColor: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.ripple),
      },
      uRipples: {
        value: Array.from(
          { length: DOT_MORPH_CONFIG.ripple.maxCount },
          () => new THREE.Vector4(0, 0, -100, 0),
        ),
      },
      uSpotlightColor: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.spotlight),
      },
      uTime: { value: 0 },
      uTint: { value: createColorVector(DOT_MORPH_CONFIG.colors.tint) },
    };
    const material = new THREE.ShaderMaterial({
      blending: THREE.NormalBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader,
      transparent: true,
      uniforms,
      vertexShader,
    });

    const rebuildTargets = () => {
      if (width <= 0 || height <= 0 || loadedImages.length === 0) {
        return;
      }

      preparedTargets = createPreparedTargets(loadedImages, width, height);
      currentIndex %= preparedTargets.sets.length;
      nextIndex =
        preparedTargets.sets.length > 1
          ? (currentIndex + 1) % preparedTargets.sets.length
          : currentIndex;
      morphStartedAt = performance.now();
      uniforms.uMorph.value = 0;

      if (!geometry) {
        geometry = new THREE.BufferGeometry();
      }

      setGeometryPair(geometry, preparedTargets, currentIndex, nextIndex);

      if (!points) {
        points = new THREE.Points(geometry, material);
        points.frustumCulled = false;
        scene.add(points);
      }
    };

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        DOT_MORPH_CONFIG.renderer.maxDevicePixelRatio,
      );

      width = rect.width;
      height = rect.height;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      camera = createCamera(width, height);
      uniforms.uDpr.value = dpr;
      rebuildTargets();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = motionMedia.matches;

    const updateMotionPreference = () => {
      reducedMotionRef.current = motionMedia.matches;
    };

    motionMedia.addEventListener("change", updateMotionPreference);

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visibleRef.current = Boolean(entry?.isIntersecting);
    });

    intersectionObserver.observe(mount);

    Promise.all(resolvedSources.map((source) => loadMaskImage(source)))
      .then((images) => {
        if (disposed) {
          return;
        }

        loadedImages = images;
        rebuildTargets();
      })
      .catch(() => {
        loadedImages = [];
      });

    const pushRipple = (time = performance.now()) => {
      const pointer = pointerRef.current;
      const x = Number.isFinite(pointer.x) ? pointer.x : 0;
      const y = Number.isFinite(pointer.y) ? pointer.y : 0;

      ripples.push({ x, y, startedAt: time / 1000 });
      ripples = ripples.slice(-DOT_MORPH_CONFIG.ripple.maxCount);
      lastRippleAt = time;
    };

    const updatePointer = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();

      pointerRef.current.set(
        event.clientX - rect.left - rect.width / 2,
        rect.height / 2 - (event.clientY - rect.top),
      );
      uniforms.uPointer.value = pointerRef.current;
    };

    const onPointerEnter = (event: PointerEvent) => {
      hoverRef.current = true;
      updatePointer(event);
      pushRipple();
    };

    const onPointerMove = (event: PointerEvent) => {
      updatePointer(event);
    };

    const onPointerDown = (event: PointerEvent) => {
      hoverRef.current = true;
      updatePointer(event);
      pushRipple();
    };

    const onPointerLeave = () => {
      hoverRef.current = false;
      pointerRef.current.set(100000, 100000);
      uniforms.uPointer.value = pointerRef.current;
    };

    mount.addEventListener("pointerenter", onPointerEnter);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointerleave", onPointerLeave);

    const render = (time: number) => {
      const seconds = time / 1000;
      const deltaSinceRipple = time - lastRippleAt;
      uniforms.uTime.value = seconds;
      uniforms.uHover.value = THREE.MathUtils.lerp(
        uniforms.uHover.value,
        hoverRef.current ? 1 : 0,
        DOT_MORPH_CONFIG.interaction.hoverLerp,
      );

      if (
        hoverRef.current &&
        !reducedMotionRef.current &&
        deltaSinceRipple > DOT_MORPH_CONFIG.ripple.intervalMs
      ) {
        pushRipple(time);
      }

      ripples = ripples.filter(
        (ripple) =>
          seconds - ripple.startedAt <
          DOT_MORPH_CONFIG.ripple.durationMs / 1000,
      );

      const rippleUniforms = uniforms.uRipples.value;
      for (
        let index = 0;
        index < DOT_MORPH_CONFIG.ripple.maxCount;
        index += 1
      ) {
        const ripple = ripples[index];

        if (ripple) {
          rippleUniforms[index]!.set(ripple.x, ripple.y, ripple.startedAt, 1);
        } else {
          rippleUniforms[index]!.set(0, 0, -100, 0);
        }
      }

      if (preparedTargets && !reducedMotionRef.current) {
        const elapsed = time - morphStartedAt;
        const cycleMs =
          DOT_MORPH_CONFIG.timing.holdMs + DOT_MORPH_CONFIG.timing.morphMs;

        if (
          visibleRef.current &&
          elapsed > cycleMs &&
          preparedTargets.sets.length > 1 &&
          geometry
        ) {
          currentIndex = nextIndex;
          nextIndex = (nextIndex + 1) % preparedTargets.sets.length;
          setGeometryPair(geometry, preparedTargets, currentIndex, nextIndex);
          morphStartedAt = time;
          uniforms.uMorph.value = 0;
        } else {
          uniforms.uMorph.value = Math.max(
            0,
            Math.min(
              1,
              (elapsed - DOT_MORPH_CONFIG.timing.holdMs) /
                DOT_MORPH_CONFIG.timing.morphMs,
            ),
          );
        }
      }

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionMedia.removeEventListener("change", updateMotionPreference);
      mount.removeEventListener("pointerenter", onPointerEnter);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerdown", onPointerDown);
      mount.removeEventListener("pointerleave", onPointerLeave);
      geometry?.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [sources]);

  return (
    <div
      className="shadow-card relative overflow-hidden border"
      style={{
        backgroundColor: DOT_MORPH_CONFIG.frame.background,
        borderColor: DOT_MORPH_CONFIG.frame.border,
        borderRadius: DOT_MORPH_CONFIG.frame.radius,
      }}
    >
      <div
        ref={mountRef}
        className="w-full [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full"
        style={{ aspectRatio: DOT_MORPH_CONFIG.frame.aspectRatio }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: "inherit",
          boxShadow: `inset 0 1px 0 ${DOT_MORPH_CONFIG.frame.insetHighlight}`,
        }}
      />
    </div>
  );
}
