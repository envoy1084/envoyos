// oxlint-disable unicorn/prefer-add-event-listener no-unmodified-loop-condition promise/always-return
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

type Ripple = {
  x: number;
  y: number;
  startedAt: number;
};

type RawTarget = {
  x: number;
  y: number;
  depth: number;
  shade: number;
};

type TargetSet = {
  positions: Float32Array;
  depths: Float32Array;
  shades: Float32Array;
};

type PairedTarget = {
  positions: Float32Array;
  depths: Float32Array;
  shades: Float32Array;
};

// Edit this object to tune the whole effect without touching the shader/runtime code.
const DOT_MORPH_CONFIG = {
  frame: {
    aspectRatio: "15 / 4",
    background: "var(--app-bg, #08090a)",
    border: "var(--line-card, #252629)",
    radius: "var(--radius-surface, 10px)",
    insetHighlight: "#ffffff0a",
  },
  images: {
    maxSources: 3,
    fitScale: 1,
    depthBase: 0.38,
    alphaDepthWeight: 0.34,
    luminanceDepthWeight: 0.28,
    shadeFloor: 0.2,
    sourceShadeWeight: 0.34,
    sourceAlphaShadeWeight: 0.38,
    sourceEdgeWeight: 0.08,
    sampleRadius: 2,
    sampleMaxAlphaWeight: 0.58,
    sampleAverageAlphaWeight: 0.42,
    visibilityAlphaFloor: 0.22,
  },
  particles: {
    // Lower gap + higher max = more dots. Keep max under ~12k unless you test on low-end devices.
    gap: 2.85,
    minCount: 2800,
    maxCount: 9000,
    targetDensityMultiplier: 1.04,
    maskThreshold: 0.1,
    depthFloor: 0.18,
    rowStagger: 0.5,
    gridJitter: 0.22,
    duplicateJitter: 0.18,
    zDepth: 6,
    pointSize: 2.5,
    pointDepthScale: [0.86, 1.12],
  },
  matching: {
    bucketSize: 28,
    maxBucketRing: 14,
  },
  timing: {
    holdMs: 6000,
    morphMs: 800,
    stagger: 0.03,
    activeRange: 0.97,
    delayMultiplier: 7,
    delayModulo: 47,
  },
  interaction: {
    hoverLerp: 0.14,
  },
  fallbackShape: {
    radiusX: 0.38,
    radiusY: 0.34,
    depthFalloff: 0.42,
  },
  renderer: {
    clearColor: "#08090a",
    maxDevicePixelRatio: 2,
    powerPreference: "high-performance",
  },
  colors: {
    shadow: "var(--line-control, #2f3031)",
    mid: "var(--content-quaternary, #555557)",
    ridge: "var(--content-tertiary, #939496)",
    highlight: "var(--content-secondary, #e2e3e5)",
    depthTint: "var(--content-tertiary, #939496)",
    spotlight: "var(--content-secondary, #e2e3e5)",
    ripple: "var(--content-secondary, #e2e3e5)",
  },
  shading: {
    sourceWeight: 0.52,
    depthWeight: 0.34,
    lightWeight: 0.13,
    contourWeight: 0.04,
    grainWeight: 0.07,
    lightOrigin: [-0.42, -0.54],
    lightFalloff: 1.15,
    contourFalloff: 1.1,
    ridgeMix: 0.58,
    depthTintMix: 0,
    midStops: [0.16, 0.56],
    ridgeStops: [0.46, 0.82],
    highlightStops: [0.76, 1],
  },
  shape: {
    minVisibleDepth: 0.12,
    radius: [0.4, 0.52],
    shadeRadiusBoost: 0.014,
    circleEdge: 0.055,
    discardBelow: 0.01,
    alphaBase: 0.24,
    alphaDepth: 0.55,
    alphaShade: 0.2,
    alphaRange: [0.28, 0.9],
  },
  spotlight: {
    radius: 230,
    colorMix: 0.34,
    radiusBoost: 0.028,
    alphaBoost: 0.22,
  },
  ripple: {
    maxCount: 4,
    durationMs: 1750,
    intervalMs: 2000,
    speed: 360,
    width: 58,
    colorMix: 0.58,
    radiusBoost: 0.045,
    alphaBoost: 0.48,
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
  attribute vec3 aTargetPosition;
  attribute float aDepth;
  attribute float aTargetDepth;
  attribute float aShade;
  attribute float aTargetShade;
  attribute float aDelay;

  varying vec2 vScreen;
  varying float vDepth;
  varying float vShade;

  uniform vec2 uViewport;
  uniform float uMorph;
  uniform float uPointSize;

  float easeOutQuint(float value) {
    float inverse = 1.0 - value;
    return 1.0 - inverse * inverse * inverse * inverse * inverse;
  }

  void main() {
    float delayedMorph = clamp(
      (uMorph - aDelay * ${DOT_MORPH_CONFIG.timing.stagger.toFixed(4)}) /
        ${DOT_MORPH_CONFIG.timing.activeRange.toFixed(4)},
      0.0,
      1.0
    );
    float morph = easeOutQuint(delayedMorph);
    vec3 morphedPosition = mix(position, aTargetPosition, morph);

    vDepth = mix(aDepth, aTargetDepth, morph);
    vShade = mix(aShade, aTargetShade, morph);
    vScreen = vec2(
      morphedPosition.x + uViewport.x * 0.5,
      uViewport.y * 0.5 - morphedPosition.y
    );

    gl_Position = projectionMatrix * modelViewMatrix * vec4(morphedPosition, 1.0);
    gl_PointSize = uPointSize * mix(
      ${DOT_MORPH_CONFIG.particles.pointDepthScale[0].toFixed(4)},
      ${DOT_MORPH_CONFIG.particles.pointDepthScale[1].toFixed(4)},
      clamp(vDepth, 0.0, 1.0)
    );
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vScreen;
  varying float vDepth;
  varying float vShade;

  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uHover;
  uniform vec4 uRipples[${DOT_MORPH_CONFIG.ripple.maxCount}];
  uniform vec3 uColorShadow;
  uniform vec3 uColorMid;
  uniform vec3 uColorRidge;
  uniform vec3 uColorHighlight;
  uniform vec3 uColorDepthTint;
  uniform vec3 uColorSpotlight;
  uniform vec3 uColorRipple;

  vec3 depthColor(float depth, float shade) {
    vec3 shadow = uColorShadow;
    vec3 mid = uColorMid;
    vec3 ridge = uColorRidge;
    vec3 highlight = uColorHighlight;
    vec3 color = mix(
      shadow,
      mid,
      smoothstep(
        ${DOT_MORPH_CONFIG.shading.midStops[0].toFixed(4)},
        ${DOT_MORPH_CONFIG.shading.midStops[1].toFixed(4)},
        shade
      )
    );

    color = mix(
      color,
      ridge,
      smoothstep(
        ${DOT_MORPH_CONFIG.shading.ridgeStops[0].toFixed(4)},
        ${DOT_MORPH_CONFIG.shading.ridgeStops[1].toFixed(4)},
        shade
      ) * ${DOT_MORPH_CONFIG.shading.ridgeMix.toFixed(4)}
    );
    color = mix(
      color,
      highlight,
      smoothstep(
        ${DOT_MORPH_CONFIG.shading.highlightStops[0].toFixed(4)},
        ${DOT_MORPH_CONFIG.shading.highlightStops[1].toFixed(4)},
        shade
      )
    );
    color = mix(
      color,
      uColorDepthTint,
      depth * ${DOT_MORPH_CONFIG.shading.depthTintMix.toFixed(4)}
    );

    return color;
  }

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float pointDistance = length(point);

    float pointerDistance = distance(vScreen, uPointer);
    float spotlight = max(0.0, 1.0 - pointerDistance / ${DOT_MORPH_CONFIG.spotlight.radius.toFixed(4)}) * uHover;
    float ripple = 0.0;

    for (int index = 0; index < ${DOT_MORPH_CONFIG.ripple.maxCount}; index++) {
      vec4 item = uRipples[index];
      float rippleEnabled = item.w;
      float age = max(0.0, uTime - item.z);
      float fade = clamp(1.0 - age / ${(DOT_MORPH_CONFIG.ripple.durationMs / 1000).toFixed(4)}, 0.0, 1.0);
      float waveRadius = age * ${DOT_MORPH_CONFIG.ripple.speed.toFixed(4)};
      float waveDistance = abs(distance(vScreen, item.xy) - waveRadius);
      float wave = max(0.0, 1.0 - waveDistance / ${DOT_MORPH_CONFIG.ripple.width.toFixed(4)});
      ripple += wave * fade * rippleEnabled;
    }

    ripple = clamp(ripple, 0.0, 1.0);

    float visibleDepth = clamp(vDepth, ${DOT_MORPH_CONFIG.shape.minVisibleDepth.toFixed(4)}, 1.0);
    float visibleShade = clamp(vShade, 0.0, 1.0);
    float radius = mix(
      ${DOT_MORPH_CONFIG.shape.radius[0].toFixed(4)},
      ${DOT_MORPH_CONFIG.shape.radius[1].toFixed(4)},
      visibleDepth
    );
    radius += visibleShade * ${DOT_MORPH_CONFIG.shape.shadeRadiusBoost.toFixed(4)};
    radius += spotlight * ${DOT_MORPH_CONFIG.spotlight.radiusBoost.toFixed(4)};
    radius += ripple * ${DOT_MORPH_CONFIG.ripple.radiusBoost.toFixed(4)};

    float circle = smoothstep(radius, radius - ${DOT_MORPH_CONFIG.shape.circleEdge.toFixed(4)}, pointDistance);
    if (circle <= ${DOT_MORPH_CONFIG.shape.discardBelow.toFixed(4)}) {
      discard;
    }

    vec3 color = depthColor(visibleDepth, visibleShade);
    color = mix(
      color,
      uColorSpotlight,
      spotlight * ${DOT_MORPH_CONFIG.spotlight.colorMix.toFixed(4)}
    );
    color = mix(
      color,
      uColorRipple,
      ripple * ${DOT_MORPH_CONFIG.ripple.colorMix.toFixed(4)}
    );

    float alpha =
      ${DOT_MORPH_CONFIG.shape.alphaBase.toFixed(4)} +
      visibleDepth * ${DOT_MORPH_CONFIG.shape.alphaDepth.toFixed(4)} +
      visibleShade * ${DOT_MORPH_CONFIG.shape.alphaShade.toFixed(4)};
    alpha += spotlight * ${DOT_MORPH_CONFIG.spotlight.alphaBoost.toFixed(4)};
    alpha += ripple * ${DOT_MORPH_CONFIG.ripple.alphaBoost.toFixed(4)};
    alpha = clamp(
      alpha,
      ${DOT_MORPH_CONFIG.shape.alphaRange[0].toFixed(4)},
      ${DOT_MORPH_CONFIG.shape.alphaRange[1].toFixed(4)}
    ) * circle;

    gl_FragColor = vec4(color, alpha);
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

function createFallbackRawTargets(width: number, height: number) {
  const targets: RawTarget[] = [];
  const columns = Math.max(
    1,
    Math.floor(width / DOT_MORPH_CONFIG.particles.gap),
  );
  const rows = Math.max(1, Math.floor(height / DOT_MORPH_CONFIG.particles.gap));
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width * DOT_MORPH_CONFIG.fallbackShape.radiusX;
  const radiusY = height * DOT_MORPH_CONFIG.fallbackShape.radiusY;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = (column + 0.5) * DOT_MORPH_CONFIG.particles.gap;
      const y = (row + 0.5) * DOT_MORPH_CONFIG.particles.gap;
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      const distance = normalizedX * normalizedX + normalizedY * normalizedY;

      if (distance <= 1) {
        const depth =
          1 - distance * DOT_MORPH_CONFIG.fallbackShape.depthFalloff;

        targets.push({
          x,
          y,
          depth,
          shade: depth,
        });
      }
    }
  }

  return targets;
}

function readMaskTargets(
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return createFallbackRawTargets(width, height);
  }

  const pixelWidth = Math.max(1, Math.round(width));
  const pixelHeight = Math.max(1, Math.round(height));
  const naturalWidth = image.naturalWidth || image.width || pixelWidth;
  const naturalHeight = image.naturalHeight || image.height || pixelHeight;
  const scale =
    Math.min(pixelWidth / naturalWidth, pixelHeight / naturalHeight) *
    DOT_MORPH_CONFIG.images.fitScale;
  const drawWidth = naturalWidth * scale;
  const drawHeight = naturalHeight * scale;
  const drawX = (pixelWidth - drawWidth) / 2;
  const drawY = (pixelHeight - drawHeight) / 2;
  const targets: RawTarget[] = [];

  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  try {
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  } catch {
    return createFallbackRawTargets(width, height);
  }

  let data: Uint8ClampedArray;

  try {
    data = context.getImageData(0, 0, pixelWidth, pixelHeight).data;
  } catch {
    return createFallbackRawTargets(width, height);
  }
  const getLuminance = (x: number, y: number) => {
    const pixelIndex =
      (Math.min(pixelHeight - 1, Math.max(0, y)) * pixelWidth +
        Math.min(pixelWidth - 1, Math.max(0, x))) *
      4;

    return (
      (data[pixelIndex]! * 0.299 +
        data[pixelIndex + 1]! * 0.587 +
        data[pixelIndex + 2]! * 0.114) /
      255
    );
  };
  const getAlpha = (x: number, y: number) => {
    const pixelIndex =
      (Math.min(pixelHeight - 1, Math.max(0, y)) * pixelWidth +
        Math.min(pixelWidth - 1, Math.max(0, x))) *
      4;

    return data[pixelIndex + 3]! / 255;
  };
  const getAlphaCoverage = (x: number, y: number, radius: number) => {
    let max = 0;
    let total = 0;
    let count = 0;

    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        const alpha = getAlpha(x + xOffset, y + yOffset);

        max = Math.max(max, alpha);
        total += alpha;
        count += 1;
      }
    }

    return { average: total / count, max };
  };
  const getAverageLuminance = (x: number, y: number, radius: number) => {
    let total = 0;
    let count = 0;

    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        total += getLuminance(x + xOffset, y + yOffset);
        count += 1;
      }
    }

    return total / count;
  };
  const columns = Math.max(
    1,
    Math.floor(pixelWidth / DOT_MORPH_CONFIG.particles.gap),
  );
  const rows = Math.max(
    1,
    Math.floor(pixelHeight / DOT_MORPH_CONFIG.particles.gap),
  );
  const offsetX =
    (pixelWidth - (columns - 1) * DOT_MORPH_CONFIG.particles.gap) / 2;
  const offsetY =
    (pixelHeight - (rows - 1) * DOT_MORPH_CONFIG.particles.gap) / 2;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const rowOffset =
        row % 2 === 0
          ? 0
          : DOT_MORPH_CONFIG.particles.gap *
            DOT_MORPH_CONFIG.particles.rowStagger;
      const x = Math.min(
        pixelWidth - 1,
        Math.max(
          0,
          Math.round(
            offsetX + column * DOT_MORPH_CONFIG.particles.gap + rowOffset,
          ),
        ),
      );
      const y = Math.min(
        pixelHeight - 1,
        Math.max(0, Math.round(offsetY + row * DOT_MORPH_CONFIG.particles.gap)),
      );
      const pixelIndex = (y * pixelWidth + x) * 4;
      const centerAlpha = data[pixelIndex + 3]! / 255;
      const alphaCoverage = getAlphaCoverage(
        x,
        y,
        DOT_MORPH_CONFIG.images.sampleRadius,
      );
      const maskAlpha = Math.max(centerAlpha, alphaCoverage.max);
      const alpha = Math.max(
        centerAlpha,
        alphaCoverage.max * DOT_MORPH_CONFIG.images.sampleMaxAlphaWeight +
          alphaCoverage.average *
            DOT_MORPH_CONFIG.images.sampleAverageAlphaWeight,
      );
      const visibleAlpha = Math.max(
        alpha,
        DOT_MORPH_CONFIG.images.visibilityAlphaFloor,
      );
      const luminance = getAverageLuminance(x, y, 2);
      const edgeContrast = Math.min(
        1,
        (Math.abs(getLuminance(x + 2, y) - getLuminance(x - 2, y)) +
          Math.abs(getLuminance(x, y + 2) - getLuminance(x, y - 2))) *
          0.75,
      );
      const sourceDepth =
        DOT_MORPH_CONFIG.images.depthBase +
        visibleAlpha * DOT_MORPH_CONFIG.images.alphaDepthWeight +
        luminance * DOT_MORPH_CONFIG.images.luminanceDepthWeight;

      if (maskAlpha > DOT_MORPH_CONFIG.particles.maskThreshold) {
        const alphaShade = Math.min(
          1,
          Math.max(
            0,
            (visibleAlpha - DOT_MORPH_CONFIG.particles.maskThreshold) /
              (1 - DOT_MORPH_CONFIG.particles.maskThreshold),
          ),
        );
        const depth = Math.min(
          1,
          Math.max(
            DOT_MORPH_CONFIG.particles.depthFloor,
            sourceDepth * (0.74 + alphaShade * 0.26),
          ),
        );
        const shade = Math.min(
          1,
          Math.max(
            0,
            DOT_MORPH_CONFIG.images.shadeFloor +
              luminance * DOT_MORPH_CONFIG.images.sourceShadeWeight +
              alphaShade * DOT_MORPH_CONFIG.images.sourceAlphaShadeWeight +
              edgeContrast * DOT_MORPH_CONFIG.images.sourceEdgeWeight,
          ),
        );

        targets.push({
          x,
          y,
          depth,
          shade,
        });
      }
    }
  }

  return targets.length > 0 ? targets : createFallbackRawTargets(width, height);
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createTargetSet(
  rawTargets: RawTarget[],
  count: number,
  width: number,
  height: number,
  seed: number,
) {
  const positions = new Float32Array(count * 3);
  const depths = new Float32Array(count);
  const shades = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const rawIndex = Math.min(
      rawTargets.length - 1,
      Math.floor((index / count) * rawTargets.length),
    );
    const target = rawTargets[rawIndex]!;
    const repeated = rawTargets.length < count;
    const gridJitterX =
      (seededUnit(seed * 71 + index * 31) - 0.5) *
      DOT_MORPH_CONFIG.particles.gap *
      DOT_MORPH_CONFIG.particles.gridJitter;
    const gridJitterY =
      (seededUnit(seed * 89 + index * 37) - 0.5) *
      DOT_MORPH_CONFIG.particles.gap *
      DOT_MORPH_CONFIG.particles.gridJitter;
    const jitterX = repeated
      ? (seededUnit(seed * 101 + index * 13) - 0.5) *
        DOT_MORPH_CONFIG.particles.gap *
        DOT_MORPH_CONFIG.particles.duplicateJitter
      : 0;
    const jitterY = repeated
      ? (seededUnit(seed * 127 + index * 17) - 0.5) *
        DOT_MORPH_CONFIG.particles.gap *
        DOT_MORPH_CONFIG.particles.duplicateJitter
      : 0;
    const x = Math.min(width, Math.max(0, target.x + gridJitterX + jitterX));
    const y = Math.min(height, Math.max(0, target.y + gridJitterY + jitterY));
    const normalizedX = x / width - 0.5;
    const normalizedY = y / height - 0.5;
    const [lightOriginX, lightOriginY] = DOT_MORPH_CONFIG.shading.lightOrigin;
    const lightFalloff = Math.max(
      0,
      1 -
        Math.sqrt(
          (normalizedX - lightOriginX) * (normalizedX - lightOriginX) +
            (normalizedY - lightOriginY) * (normalizedY - lightOriginY),
        ) *
          DOT_MORPH_CONFIG.shading.lightFalloff,
    );
    const contour =
      1 -
      Math.min(
        1,
        Math.abs(normalizedY) * DOT_MORPH_CONFIG.shading.contourFalloff,
      );
    const grain = seededUnit(seed * 191 + index * 23);
    const shade = Math.min(
      1,
      Math.max(
        0,
        target.shade * DOT_MORPH_CONFIG.shading.sourceWeight +
          target.depth * DOT_MORPH_CONFIG.shading.depthWeight +
          lightFalloff * DOT_MORPH_CONFIG.shading.lightWeight +
          contour * DOT_MORPH_CONFIG.shading.contourWeight +
          grain * DOT_MORPH_CONFIG.shading.grainWeight,
      ),
    );

    positions[index * 3] = x - width / 2;
    positions[index * 3 + 1] = height / 2 - y;
    positions[index * 3 + 2] =
      (target.depth - 0.5) * DOT_MORPH_CONFIG.particles.zDepth;
    depths[index] = target.depth;
    shades[index] = shade;
  }

  return { positions, depths, shades };
}

function createTargetSets(
  images: HTMLImageElement[],
  width: number,
  height: number,
) {
  const rawSets = images.map((image) => readMaskTargets(image, width, height));
  const largestTargetCount = Math.max(
    ...rawSets.map((targets) => targets.length),
  );
  const count = Math.min(
    DOT_MORPH_CONFIG.particles.maxCount,
    Math.max(
      DOT_MORPH_CONFIG.particles.minCount,
      Math.ceil(
        largestTargetCount * DOT_MORPH_CONFIG.particles.targetDensityMultiplier,
      ),
    ),
  );

  return rawSets.map((rawTargets, index) =>
    createTargetSet(rawTargets, count, width, height, index + 1),
  );
}

function getBucketKey(bucketX: number, bucketY: number) {
  return `${bucketX}:${bucketY}`;
}

function createSpatialOrder(target: TargetSet) {
  const count = target.depths.length;

  return Array.from({ length: count }, (_, index) => index).toSorted(
    (left, right) => {
      const leftX = target.positions[left * 3]!;
      const rightX = target.positions[right * 3]!;
      const leftY = target.positions[left * 3 + 1]!;
      const rightY = target.positions[right * 3 + 1]!;

      return leftY === rightY ? leftX - rightX : rightY - leftY;
    },
  );
}

function createPairedTarget(current: TargetSet, next: TargetSet): PairedTarget {
  const count = current.depths.length;
  const bucketSize = DOT_MORPH_CONFIG.matching.bucketSize;
  const buckets = new Map<string, number[]>();
  const used = new Uint8Array(count);
  const positions = new Float32Array(count * 3);
  const depths = new Float32Array(count);
  const shades = new Float32Array(count);
  const currentOrder = createSpatialOrder(current);

  for (let index = 0; index < count; index += 1) {
    const x = next.positions[index * 3]!;
    const y = next.positions[index * 3 + 1]!;
    const bucketX = Math.floor(x / bucketSize);
    const bucketY = Math.floor(y / bucketSize);
    const key = getBucketKey(bucketX, bucketY);
    const bucket = buckets.get(key);

    if (bucket) {
      bucket.push(index);
    } else {
      buckets.set(key, [index]);
    }
  }

  const findNearestUnused = (currentIndex: number) => {
    const x = current.positions[currentIndex * 3]!;
    const y = current.positions[currentIndex * 3 + 1]!;
    const bucketX = Math.floor(x / bucketSize);
    const bucketY = Math.floor(y / bucketSize);
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    const visitBucket = (xBucket: number, yBucket: number) => {
      const bucket = buckets.get(getBucketKey(xBucket, yBucket));

      if (!bucket) {
        return;
      }

      for (const candidateIndex of bucket) {
        if (used[candidateIndex]) {
          continue;
        }

        const targetX = next.positions[candidateIndex * 3]!;
        const targetY = next.positions[candidateIndex * 3 + 1]!;
        const deltaX = targetX - x;
        const deltaY = targetY - y;
        const distance = deltaX * deltaX + deltaY * deltaY;

        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = candidateIndex;
        }
      }
    };

    for (
      let ring = 0;
      ring <= DOT_MORPH_CONFIG.matching.maxBucketRing && bestIndex === -1;
      ring += 1
    ) {
      for (let xOffset = -ring; xOffset <= ring; xOffset += 1) {
        visitBucket(bucketX + xOffset, bucketY - ring);

        if (ring > 0) {
          visitBucket(bucketX + xOffset, bucketY + ring);
        }
      }

      for (let yOffset = -ring + 1; yOffset <= ring - 1; yOffset += 1) {
        visitBucket(bucketX - ring, bucketY + yOffset);

        if (ring > 0) {
          visitBucket(bucketX + ring, bucketY + yOffset);
        }
      }
    }

    if (bestIndex !== -1) {
      return bestIndex;
    }

    for (let index = 0; index < count; index += 1) {
      if (used[index]) {
        continue;
      }

      const targetX = next.positions[index * 3]!;
      const targetY = next.positions[index * 3 + 1]!;
      const deltaX = targetX - x;
      const deltaY = targetY - y;
      const distance = deltaX * deltaX + deltaY * deltaY;

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex !== -1) {
      return bestIndex;
    }

    for (let index = 0; index < count; index += 1) {
      if (!used[index]) {
        return index;
      }
    }

    return 0;
  };

  for (const currentIndex of currentOrder) {
    const nextIndex = findNearestUnused(currentIndex);

    used[nextIndex] = 1;
    positions[currentIndex * 3] = next.positions[nextIndex * 3]!;
    positions[currentIndex * 3 + 1] = next.positions[nextIndex * 3 + 1]!;
    positions[currentIndex * 3 + 2] = next.positions[nextIndex * 3 + 2]!;
    depths[currentIndex] = next.depths[nextIndex]!;
    shades[currentIndex] = next.shades[nextIndex]!;
  }

  return { positions, depths, shades };
}

function createMorphDelays(current: TargetSet, pairedNext: PairedTarget) {
  const count = current.depths.length;
  const delays = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const deltaX =
      pairedNext.positions[index * 3]! - current.positions[index * 3]!;
    const deltaY =
      pairedNext.positions[index * 3 + 1]! - current.positions[index * 3 + 1]!;
    const distance = Math.min(
      1,
      Math.sqrt(deltaX * deltaX + deltaY * deltaY) / 180,
    );
    const seededDelay =
      ((index * DOT_MORPH_CONFIG.timing.delayMultiplier) %
        DOT_MORPH_CONFIG.timing.delayModulo) /
      DOT_MORPH_CONFIG.timing.delayModulo;

    delays[index] = distance * 0.64 + seededDelay * 0.36;
  }

  return delays;
}

function createGeometry(
  targets: TargetSet[],
  currentIndex: number,
  nextIndex: number,
) {
  const current = targets[currentIndex]!;
  const next = targets[nextIndex] ?? current;
  const pairedNext = createPairedTarget(current, next);
  const delays = createMorphDelays(current, pairedNext);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(current.positions, 3),
  );
  geometry.setAttribute(
    "aTargetPosition",
    new THREE.BufferAttribute(pairedNext.positions, 3),
  );
  geometry.setAttribute("aDepth", new THREE.BufferAttribute(current.depths, 1));
  geometry.setAttribute(
    "aTargetDepth",
    new THREE.BufferAttribute(pairedNext.depths, 1),
  );
  geometry.setAttribute("aShade", new THREE.BufferAttribute(current.shades, 1));
  geometry.setAttribute(
    "aTargetShade",
    new THREE.BufferAttribute(pairedNext.shades, 1),
  );
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delays, 1));

  return geometry;
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
  const pointerRef = useRef(new THREE.Vector2(-10000, -10000));
  const hoverRef = useRef(false);
  const visibleRef = useRef(true);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    const resolvedSources = sources.map(resolveMorphSource).filter(Boolean);

    if (!mount || resolvedSources.length === 0) {
      return;
    }

    let width = 0;
    let height = 0;
    let geometry: THREE.BufferGeometry | null = null;
    let points: THREE.Points | null = null;
    let camera = createCamera(1, 1);
    let animationFrame = 0;
    let disposed = false;
    let currentIndex = 0;
    let nextIndex = Math.min(1, resolvedSources.length - 1);
    let phaseStartedAt = performance.now();
    let lastRippleAt = 0;
    let ripples: Ripple[] = [];
    let maskImages: HTMLImageElement[] = [];
    let targetSets: TargetSet[] = [];
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
      uViewport: { value: new THREE.Vector2(1, 1) },
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uPointer: { value: pointerRef.current },
      uHover: { value: 0 },
      uPointSize: { value: Number(DOT_MORPH_CONFIG.particles.pointSize) },
      uRipples: {
        value: Array.from(
          { length: DOT_MORPH_CONFIG.ripple.maxCount },
          () => new THREE.Vector4(0, 0, -100, 0),
        ),
      },
      uColorShadow: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.shadow),
      },
      uColorMid: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.mid),
      },
      uColorRidge: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.ridge),
      },
      uColorHighlight: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.highlight),
      },
      uColorDepthTint: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.depthTint),
      },
      uColorSpotlight: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.spotlight),
      },
      uColorRipple: {
        value: createColorVector(DOT_MORPH_CONFIG.colors.ripple),
      },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const syncGeometryTargets = () => {
      if (!geometry || targetSets.length === 0) {
        return;
      }

      const current = targetSets[currentIndex]!;
      const next = targetSets[nextIndex] ?? current;
      const pairedNext = createPairedTarget(current, next);
      const delays = createMorphDelays(current, pairedNext);

      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(current.positions, 3),
      );
      geometry.setAttribute(
        "aTargetPosition",
        new THREE.BufferAttribute(pairedNext.positions, 3),
      );
      geometry.setAttribute(
        "aDepth",
        new THREE.BufferAttribute(current.depths, 1),
      );
      geometry.setAttribute(
        "aTargetDepth",
        new THREE.BufferAttribute(pairedNext.depths, 1),
      );
      geometry.setAttribute(
        "aShade",
        new THREE.BufferAttribute(current.shades, 1),
      );
      geometry.setAttribute(
        "aTargetShade",
        new THREE.BufferAttribute(pairedNext.shades, 1),
      );
      geometry.setAttribute("aDelay", new THREE.BufferAttribute(delays, 1));
      geometry.computeBoundingSphere();
    };

    const rebuildGeometry = () => {
      if (width <= 0 || height <= 0 || maskImages.length === 0) {
        return;
      }

      if (points) {
        scene.remove(points);
      }

      targetSets = createTargetSets(maskImages, width, height);
      currentIndex %= targetSets.length;
      nextIndex =
        targetSets.length > 1
          ? (currentIndex + 1) % targetSets.length
          : currentIndex;
      phaseStartedAt = performance.now();
      uniforms.uMorph.value = 0;
      geometry?.dispose();
      geometry = createGeometry(targetSets, currentIndex, nextIndex);
      points = new THREE.Points(geometry, material);
      scene.add(points);
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
      uniforms.uPointSize.value = DOT_MORPH_CONFIG.particles.pointSize * dpr;
      uniforms.uViewport.value.set(width, height);
      rebuildGeometry();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = media.matches;

    const updateMotionPreference = () => {
      reducedMotionRef.current = media.matches;
    };

    media.addEventListener("change", updateMotionPreference);

    const observer = new IntersectionObserver(([entry]) => {
      visibleRef.current = Boolean(entry?.isIntersecting);
    });

    observer.observe(mount);

    const pushRipple = (time = performance.now()) => {
      const pointer = pointerRef.current;
      const x = pointer.x > -999 ? pointer.x : width / 2;
      const y = pointer.y > -999 ? pointer.y : height / 2;

      ripples.push({ x, y, startedAt: time / 1000 });
      ripples = ripples.slice(-DOT_MORPH_CONFIG.ripple.maxCount);
      lastRippleAt = time;
    };

    const updatePointer = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      pointerRef.current.set(
        event.clientX - rect.left,
        event.clientY - rect.top,
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
      pointerRef.current.set(-10000, -10000);
      uniforms.uPointer.value = pointerRef.current;
    };

    mount.addEventListener("pointerenter", onPointerEnter);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointerleave", onPointerLeave);

    Promise.all(
      resolvedSources
        .slice(0, DOT_MORPH_CONFIG.images.maxSources)
        .map((source) => loadMaskImage(source)),
    )
      .then((images) => {
        if (disposed) {
          return;
        }

        maskImages = images;
        rebuildGeometry();
      })
      .catch(() => {
        maskImages = [];
      });

    const render = (time: number) => {
      const seconds = time / 1000;
      uniforms.uTime.value = seconds;

      if (
        hoverRef.current &&
        !reducedMotionRef.current &&
        time - lastRippleAt > DOT_MORPH_CONFIG.ripple.intervalMs
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

      const elapsed = reducedMotionRef.current
        ? DOT_MORPH_CONFIG.timing.holdMs + DOT_MORPH_CONFIG.timing.morphMs
        : time - phaseStartedAt;
      uniforms.uHover.value = THREE.MathUtils.lerp(
        uniforms.uHover.value,
        hoverRef.current ? 1 : 0,
        DOT_MORPH_CONFIG.interaction.hoverLerp,
      );

      if (
        visibleRef.current &&
        !reducedMotionRef.current &&
        elapsed >
          DOT_MORPH_CONFIG.timing.holdMs + DOT_MORPH_CONFIG.timing.morphMs &&
        targetSets.length > 1
      ) {
        currentIndex = nextIndex;
        nextIndex = (nextIndex + 1) % targetSets.length;
        syncGeometryTargets();
        uniforms.uMorph.value = 0;
        phaseStartedAt = time;
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

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };

    animationFrame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      observer.disconnect();
      media.removeEventListener("change", updateMotionPreference);
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
