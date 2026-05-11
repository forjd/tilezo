import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

type Direction = "south" | "south-east" | "east" | "north-east" | "north";
type AnimationState = "idle" | "walk";
type LayerId =
  | "body/base"
  | "shoes/boots"
  | "shoes/sneakers"
  | "bottoms/straight"
  | "bottoms/wide"
  | "tops/crew"
  | "tops/hoodie"
  | "face/default"
  | "hair/short"
  | "hair/side-part"
  | "hair/bob";

type FrameDescriptor = {
  state: AnimationState;
  direction: Direction;
  step: number;
};

type Point = {
  x: number;
  y: number;
};

type Color = [number, number, number, number];

const FRAME_WIDTH = 64;
const FRAME_HEIGHT = 96;
const DIRECTIONS = ["south", "south-east", "east", "north-east", "north"] as const;
const FRAME_DESCRIPTORS = createFrameDescriptors();
const TOTAL_FRAMES = FRAME_DESCRIPTORS.length;
const LAYERS: Array<{
  slot: string;
  id: string;
  tint?: string;
  src: string;
  layerId: LayerId;
}> = [
  {
    slot: "body",
    id: "base",
    tint: "skinTone",
    src: "layers/body/base.png",
    layerId: "body/base",
  },
  {
    slot: "shoes",
    id: "boots",
    tint: "shoesColor",
    src: "layers/shoes/boots.png",
    layerId: "shoes/boots",
  },
  {
    slot: "shoes",
    id: "sneakers",
    tint: "shoesColor",
    src: "layers/shoes/sneakers.png",
    layerId: "shoes/sneakers",
  },
  {
    slot: "bottoms",
    id: "straight",
    tint: "pantsColor",
    src: "layers/bottoms/straight.png",
    layerId: "bottoms/straight",
  },
  {
    slot: "bottoms",
    id: "wide",
    tint: "pantsColor",
    src: "layers/bottoms/wide.png",
    layerId: "bottoms/wide",
  },
  {
    slot: "top",
    id: "crew",
    tint: "shirtColor",
    src: "layers/tops/crew.png",
    layerId: "tops/crew",
  },
  {
    slot: "top",
    id: "hoodie",
    tint: "shirtColor",
    src: "layers/tops/hoodie.png",
    layerId: "tops/hoodie",
  },
  {
    slot: "face",
    id: "default",
    src: "layers/face/default.png",
    layerId: "face/default",
  },
  {
    slot: "hair",
    id: "short",
    tint: "hairColor",
    src: "layers/hair/short.png",
    layerId: "hair/short",
  },
  {
    slot: "hair",
    id: "side-part",
    tint: "hairColor",
    src: "layers/hair/side-part.png",
    layerId: "hair/side-part",
  },
  {
    slot: "hair",
    id: "bob",
    tint: "hairColor",
    src: "layers/hair/bob.png",
    layerId: "hair/bob",
  },
];

const SHADE = {
  outline: [30, 34, 34, 255] as Color,
  deep: [74, 74, 70, 255] as Color,
  shadow: [128, 128, 120, 255] as Color,
  base: [214, 214, 202, 255] as Color,
  light: [248, 248, 232, 255] as Color,
};

const FACE = {
  dark: [32, 36, 38, 255] as Color,
  brow: [70, 48, 36, 255] as Color,
  blush: [172, 91, 80, 210] as Color,
  lip: [116, 57, 53, 255] as Color,
};

const TRANSPARENT = [0, 0, 0, 0] as Color;

function main(): void {
  const assetUrls: Record<string, string> = {};

  for (const layer of LAYERS) {
    const canvas = new PixelCanvas(FRAME_WIDTH * TOTAL_FRAMES, FRAME_HEIGHT);

    for (const [frameIndex, descriptor] of FRAME_DESCRIPTORS.entries()) {
      const frame = canvas.frame(frameIndex);
      drawLayer(frame, layer.layerId, descriptor);
    }

    const png = encodePng(canvas.width, canvas.height, canvas.pixels);
    const outputPath = `assets/avatars/${layer.src}`;
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, png);
    assetUrls[layer.src] = `data:image/png;base64,${png.toString("base64")}`;
  }

  writeFileSync(
    "assets/avatars/avatar-manifest.json",
    `${JSON.stringify(createManifest(), null, 2)}\n`,
  );
  writeFileSync("assets/avatars/avatar-asset-urls.json", `${JSON.stringify(assetUrls, null, 2)}\n`);
}

function createManifest(): object {
  return {
    frame: {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      anchorX: 32,
      anchorY: 84,
    },
    states: ["idle", "walk"],
    directions: DIRECTIONS,
    animations: {
      idle: {
        start: 0,
        framesPerDirection: 1,
        frameDuration: 0.5,
      },
      walk: {
        start: DIRECTIONS.length,
        framesPerDirection: 4,
        frameDuration: 0.12,
      },
    },
    layers: LAYERS.map(({ slot, id, tint, src }) => ({
      slot,
      id,
      ...(tint ? { tint } : {}),
      src,
      frames: TOTAL_FRAMES,
    })),
  };
}

function createFrameDescriptors(): FrameDescriptor[] {
  return [
    ...DIRECTIONS.map((direction) => ({ state: "idle" as const, direction, step: 0 })),
    ...DIRECTIONS.flatMap((direction) =>
      [0, 1, 2, 3].map((step) => ({ state: "walk" as const, direction, step })),
    ),
  ];
}

function drawLayer(canvas: FrameCanvas, layerId: LayerId, descriptor: FrameDescriptor): void {
  const pose = createPose(descriptor);

  switch (layerId) {
    case "body/base":
      drawBody(canvas, pose);
      return;
    case "shoes/boots":
      drawShoes(canvas, pose, "boots");
      return;
    case "shoes/sneakers":
      drawShoes(canvas, pose, "sneakers");
      return;
    case "bottoms/straight":
      drawBottoms(canvas, pose, "straight");
      return;
    case "bottoms/wide":
      drawBottoms(canvas, pose, "wide");
      return;
    case "tops/crew":
      drawTop(canvas, pose, "crew");
      return;
    case "tops/hoodie":
      drawTop(canvas, pose, "hoodie");
      return;
    case "face/default":
      drawFace(canvas, pose);
      return;
    case "hair/short":
      drawHair(canvas, pose, "short");
      return;
    case "hair/side-part":
      drawHair(canvas, pose, "side-part");
      return;
    case "hair/bob":
      drawHair(canvas, pose, "bob");
      return;
  }
}

function createPose({ direction, state, step }: FrameDescriptor) {
  const walk = state === "walk";
  const cycle = walk ? ([0, 1, 0, -1][step] ?? 0) : 0;
  const bob = walk ? ([0, -1, 0, -1][step] ?? 0) : 0;
  const directionShift = {
    south: 0,
    "south-east": 2,
    east: 4,
    "north-east": 2,
    north: 0,
  }[direction];
  const head = {
    x: 32 + directionShift + (direction === "south-east" ? 1 : 0),
    y: 29 + bob,
    width: direction === "east" ? 16 : direction.includes("east") ? 19 : 20,
    height: direction.includes("east") ? 24 : 23,
  };
  const torso = {
    x: 32 + Math.round(directionShift / 2) + (direction === "south-east" ? 1 : 0),
    y: 56 + bob,
    width: direction === "east" ? 14 : direction.includes("east") ? 18 : 19,
    height: 26,
  };
  const feet = footPositions(direction, cycle);

  return {
    bob,
    cycle,
    direction,
    feet,
    hands: handPositions(direction, cycle, bob),
    head,
    torso,
    visibleFace: direction === "south" || direction === "south-east" || direction === "east",
  };
}

function footPositions(direction: Direction, cycle: number): [Point, Point] {
  switch (direction) {
    case "south":
      return [
        { x: 28 - cycle, y: 83 + Math.max(cycle, 0) },
        { x: 36 + cycle, y: 83 + Math.max(-cycle, 0) },
      ];
    case "south-east":
      return [
        { x: 30 + cycle, y: 82 + Math.max(cycle, 0) },
        { x: 38 - cycle, y: 83 + Math.max(-cycle, 0) },
      ];
    case "east":
      return [
        { x: 33 + cycle * 2, y: 82 + Math.max(cycle, 0) },
        { x: 39 - cycle, y: 83 + Math.max(-cycle, 0) },
      ];
    case "north-east":
      return [
        { x: 30 + cycle, y: 83 + Math.max(cycle, 0) },
        { x: 38 - cycle, y: 82 + Math.max(-cycle, 0) },
      ];
    case "north":
      return [
        { x: 28 - cycle, y: 83 + Math.max(cycle, 0) },
        { x: 36 + cycle, y: 83 + Math.max(-cycle, 0) },
      ];
  }
}

function handPositions(direction: Direction, cycle: number, bob: number): [Point, Point] {
  switch (direction) {
    case "east":
      return [
        { x: 30 - cycle, y: 66 + bob },
        { x: 42 + cycle, y: 65 + bob },
      ];
    case "south-east":
      return [
        { x: 24 - cycle, y: 66 + bob },
        { x: 42 + cycle, y: 66 + bob },
      ];
    case "north-east":
      return [
        { x: 25 - cycle, y: 65 + bob },
        { x: 41 + cycle, y: 65 + bob },
      ];
    case "north":
      return [
        { x: 25 - cycle, y: 65 + bob },
        { x: 39 + cycle, y: 65 + bob },
      ];
    case "south":
      return [
        { x: 23 - cycle, y: 66 + bob },
        { x: 41 + cycle, y: 66 + bob },
      ];
  }
}

function drawBody(canvas: FrameCanvas, pose: ReturnType<typeof createPose>): void {
  const { head, hands, direction } = pose;
  const headLeft = head.x - Math.floor(head.width / 2);
  const headTop = head.y - Math.floor(head.height / 2);
  const backView = direction === "north" || direction === "north-east";
  const angledFront = direction === "south-east" || direction === "east";

  if (direction !== "east") {
    canvas.roundRect(headLeft - 2, head.y - 1, 3, 5, 2, SHADE.outline);
    canvas.roundRect(headLeft - 1, head.y, 2, 3, 1, SHADE.shadow);

    if (!backView && direction !== "south-east") {
      canvas.roundRect(headLeft + head.width - 1, head.y - 1, 3, 5, 2, SHADE.outline);
      canvas.roundRect(headLeft + head.width - 1, head.y, 2, 3, 1, SHADE.shadow);
    }
  } else {
    canvas.roundRect(headLeft + head.width - 1, head.y - 1, 3, 5, 2, SHADE.outline);
    canvas.roundRect(headLeft + head.width - 1, head.y, 2, 3, 1, SHADE.shadow);
  }

  canvas.roundRect(headLeft, headTop, head.width, head.height, 6, SHADE.outline);
  canvas.roundRect(headLeft + 1, headTop + 1, head.width - 2, head.height - 2, 5, SHADE.base);
  canvas.rect(headLeft + 3, headTop + 3, 5, 4, SHADE.light);
  canvas.rect(headLeft + head.width - 4, headTop + 4, 2, head.height - 8, SHADE.shadow);

  if (angledFront && !backView) {
    const noseX = headLeft + head.width - 1;
    canvas.rect(noseX, head.y - 2, 3, 5, SHADE.outline);
    canvas.rect(noseX, head.y - 1, 2, 3, SHADE.base);
    canvas.pixel(noseX + 1, head.y, SHADE.light);
    canvas.rect(headLeft + 2, headTop + 5, 3, head.height - 9, SHADE.shadow);
  }

  canvas.rect(head.x - 4, headTop + head.height - 1, 8, 7, SHADE.outline);
  canvas.rect(head.x - 3, headTop + head.height - 1, 6, 6, SHADE.shadow);

  for (const hand of hands) {
    canvas.roundRect(hand.x - 3, hand.y - 4, 6, 7, 2, SHADE.outline);
    canvas.roundRect(hand.x - 2, hand.y - 3, 4, 5, 2, SHADE.base);
    canvas.pixel(hand.x - 1, hand.y - 3, SHADE.light);
  }
}

function drawTop(
  canvas: FrameCanvas,
  pose: ReturnType<typeof createPose>,
  style: "crew" | "hoodie",
): void {
  const { torso, direction } = pose;
  const half = Math.round(torso.width / 2);
  const shoulder = torso.y - 12;
  const hem = torso.y + 13;
  const skew = direction.includes("east") ? 2 : 0;
  const shoulderLeft = torso.x - half - 2;
  const shoulderRight = torso.x + half + 2 + skew;
  const waistLeft = torso.x - half + 1 + skew;
  const waistRight = torso.x + half + skew;

  canvas.poly(
    [
      { x: shoulderLeft, y: shoulder + 3 },
      { x: torso.x - half, y: shoulder },
      { x: shoulderRight - 3, y: shoulder },
      { x: shoulderRight, y: shoulder + 4 },
      { x: waistRight, y: hem },
      { x: waistLeft, y: hem },
    ],
    SHADE.outline,
  );
  canvas.poly(
    [
      { x: shoulderLeft + 2, y: shoulder + 4 },
      { x: torso.x - half + 1, y: shoulder + 2 },
      { x: shoulderRight - 4, y: shoulder + 2 },
      { x: shoulderRight - 2, y: shoulder + 5 },
      { x: waistRight - 1, y: hem - 2 },
      { x: waistLeft + 1, y: hem - 2 },
    ],
    SHADE.base,
  );
  canvas.poly(
    [
      { x: shoulderRight - 6, y: shoulder + 3 },
      { x: shoulderRight - 3, y: shoulder + 5 },
      { x: waistRight - 1, y: hem - 2 },
      { x: waistRight - 5, y: hem - 2 },
    ],
    SHADE.shadow,
  );
  canvas.rect(torso.x - half + 3, shoulder + 5, 3, 13, SHADE.light);
  canvas.line(torso.x - half + 2, shoulder + 6, torso.x - half + 2, hem - 5, SHADE.deep);
  canvas.rect(waistLeft + 1, hem - 1, waistRight - waistLeft - 2, 2, SHADE.deep);

  drawSleeve(canvas, { x: shoulderLeft + 3, y: shoulder + 4 }, -1, style);
  drawSleeve(canvas, { x: shoulderRight - 3, y: shoulder + 4 }, 1, style);

  if (style === "hoodie") {
    canvas.roundRect(torso.x - half + 1, shoulder, torso.width - 2, 8, 4, SHADE.outline);
    canvas.roundRect(torso.x - half + 3, shoulder + 1, torso.width - 6, 6, 3, SHADE.shadow);
    canvas.rect(torso.x - 6, torso.y + 4, 12, 7, SHADE.outline);
    canvas.rect(torso.x - 5, torso.y + 5, 10, 5, SHADE.shadow);
    canvas.pixel(torso.x - 2, shoulder + 4, SHADE.light);
    canvas.pixel(torso.x + 2, shoulder + 4, SHADE.light);
  } else {
    canvas.rect(torso.x - 5, shoulder + 1, 10, 3, SHADE.outline);
    canvas.rect(torso.x - 3, shoulder + 1, 6, 2, SHADE.deep);
  }
}

function drawSleeve(
  canvas: FrameCanvas,
  shoulder: Point,
  side: -1 | 1,
  style: "crew" | "hoodie",
): void {
  const cuff = style === "hoodie" ? SHADE.deep : SHADE.shadow;

  canvas.poly(
    [
      { x: shoulder.x, y: shoulder.y - 2 },
      { x: shoulder.x + side * 5, y: shoulder.y },
      { x: shoulder.x + side * 4, y: shoulder.y + 17 },
      { x: shoulder.x - side * 1, y: shoulder.y + 16 },
    ],
    SHADE.outline,
  );
  canvas.poly(
    [
      { x: shoulder.x, y: shoulder.y },
      { x: shoulder.x + side * 3, y: shoulder.y + 1 },
      { x: shoulder.x + side * 3, y: shoulder.y + 14 },
      { x: shoulder.x, y: shoulder.y + 13 },
    ],
    SHADE.base,
  );
  canvas.rect(shoulder.x + side * 2 - (side < 0 ? 4 : 0), shoulder.y + 14, 4, 3, cuff);
}

function drawBottoms(
  canvas: FrameCanvas,
  pose: ReturnType<typeof createPose>,
  style: "straight" | "wide",
): void {
  const waistY = pose.torso.y + 11;
  const cuffY = Math.max(...pose.feet.map((foot) => foot.y)) - 5;
  const topOuter = style === "wide" ? 9 : 8;
  const bottomOuter = style === "wide" ? 5 : 4;

  for (const [index, foot] of pose.feet.entries()) {
    const side = index === 0 ? -1 : 1;
    const outerTop = pose.torso.x + side * topOuter;
    const innerTop = pose.torso.x + side * 1;
    const outerCuff = foot.x + side * bottomOuter;
    const innerCuff = foot.x - side * 2;
    const outline =
      side < 0
        ? [
            { x: outerTop, y: waistY },
            { x: innerTop, y: waistY },
            { x: innerCuff, y: cuffY },
            { x: outerCuff, y: cuffY },
          ]
        : [
            { x: innerTop, y: waistY },
            { x: outerTop, y: waistY },
            { x: outerCuff, y: cuffY },
            { x: innerCuff, y: cuffY },
          ];
    const fill =
      side < 0
        ? [
            { x: outerTop + 1, y: waistY + 1 },
            { x: innerTop - 1, y: waistY + 1 },
            { x: innerCuff - 1, y: cuffY - 1 },
            { x: outerCuff + 1, y: cuffY - 1 },
          ]
        : [
            { x: innerTop + 1, y: waistY + 1 },
            { x: outerTop - 1, y: waistY + 1 },
            { x: outerCuff - 1, y: cuffY - 1 },
            { x: innerCuff + 1, y: cuffY - 1 },
          ];

    canvas.poly(outline, SHADE.outline);
    canvas.poly(fill, index === 0 ? SHADE.base : SHADE.shadow);
    canvas.line(innerTop, waistY + 2, innerCuff, cuffY - 2, SHADE.deep);
    canvas.line(outerTop - side * 2, waistY + 4, outerCuff - side, cuffY - 2, SHADE.light);
  }

  canvas.rect(pose.torso.x - 8, waistY - 1, 16, 3, SHADE.outline);
  canvas.rect(pose.torso.x - 7, waistY, 14, 1, SHADE.deep);
}

function drawShoes(
  canvas: FrameCanvas,
  pose: ReturnType<typeof createPose>,
  style: "boots" | "sneakers",
): void {
  for (const [index, foot] of pose.feet.entries()) {
    const width = style === "boots" ? 7 : 8;
    const height = style === "boots" ? 5 : 4;
    const color = index === 0 ? SHADE.base : SHADE.shadow;
    const side = index === 0 ? -1 : 1;

    canvas.roundRect(
      foot.x - Math.round(width / 2) + side,
      foot.y - height,
      width,
      height,
      2,
      SHADE.outline,
    );
    canvas.roundRect(
      foot.x - Math.round(width / 2) + 1 + side,
      foot.y - height + 1,
      width - 2,
      height - 1,
      2,
      color,
    );

    if (style === "boots") {
      canvas.rect(foot.x - 3 + side, foot.y - 8, 6, 4, SHADE.outline);
      canvas.rect(foot.x - 2 + side, foot.y - 7, 4, 3, color);
    } else {
      canvas.rect(foot.x - Math.round(width / 2) + 2 + side, foot.y - 3, width - 3, 1, SHADE.light);
    }
  }
}

function drawFace(canvas: FrameCanvas, pose: ReturnType<typeof createPose>): void {
  if (!pose.visibleFace) {
    return;
  }

  const { direction, head } = pose;

  if (direction === "east") {
    canvas.rect(head.x + 1, head.y - 3, 2, 2, FACE.dark);
    canvas.rect(head.x, head.y - 6, 5, 1, FACE.brow);
    canvas.pixel(head.x + 7, head.y + 1, FACE.dark);
    canvas.rect(head.x + 1, head.y + 6, 4, 1, FACE.lip);
    canvas.pixel(head.x + 4, head.y + 3, FACE.blush);
    return;
  }

  if (direction === "south-east") {
    canvas.rect(head.x - 3, head.y - 3, 2, 2, FACE.dark);
    canvas.rect(head.x + 4, head.y - 3, 2, 2, FACE.dark);
    canvas.rect(head.x - 4, head.y - 6, 4, 1, FACE.brow);
    canvas.rect(head.x + 3, head.y - 6, 4, 1, FACE.brow);
    canvas.pixel(head.x + 7, head.y + 1, FACE.dark);
    canvas.rect(head.x + 1, head.y + 7, 5, 1, FACE.lip);
    canvas.pixel(head.x - 6, head.y + 3, FACE.blush);
    return;
  }

  canvas.rect(head.x - 5, head.y - 3, 2, 2, FACE.dark);
  canvas.rect(head.x + 4, head.y - 3, 2, 2, FACE.dark);
  canvas.rect(head.x - 6, head.y - 6, 5, 1, FACE.brow);
  canvas.rect(head.x + 3, head.y - 6, 5, 1, FACE.brow);
  canvas.pixel(head.x, head.y + 1, FACE.dark);
  canvas.pixel(head.x + 1, head.y + 2, FACE.dark);
  canvas.rect(head.x - 3, head.y + 7, 7, 1, FACE.lip);
  canvas.pixel(head.x - 7, head.y + 3, FACE.blush);
  canvas.pixel(head.x + 7, head.y + 3, FACE.blush);
}

function drawHair(
  canvas: FrameCanvas,
  pose: ReturnType<typeof createPose>,
  style: "short" | "side-part" | "bob",
): void {
  const { direction, head } = pose;
  const backView = direction === "north" || direction === "north-east";
  const profile = direction === "east";
  const half = Math.ceil(head.width / 2);

  canvas.roundRect(head.x - half - 1, head.y - 14, head.width + 2, 12, 5, SHADE.outline);
  canvas.roundRect(head.x - half + 1, head.y - 13, head.width - 2, 9, 4, SHADE.base);
  canvas.rect(head.x - half + 1, head.y - 8, profile ? 12 : head.width - 2, 6, SHADE.outline);
  canvas.rect(head.x - half + 2, head.y - 8, profile ? 10 : head.width - 4, 4, SHADE.base);

  if (style === "short") {
    canvas.poly(
      [
        { x: head.x - half + 1, y: head.y - 13 },
        { x: head.x + half - 2, y: head.y - 12 },
        { x: head.x + half + (profile ? 1 : 0), y: head.y - 7 },
        { x: head.x + 3, y: head.y - 3 },
        { x: head.x - half + 1, y: head.y - 4 },
      ],
      SHADE.base,
    );
    canvas.rect(head.x - half + 3, head.y - 15, 4, 2, SHADE.outline);
    canvas.rect(head.x - 1, head.y - 16, 5, 2, SHADE.outline);
    canvas.line(head.x - half + 4, head.y - 12, head.x + half - 3, head.y - 10, SHADE.light);
    if (!backView) {
      canvas.rect(head.x - half + 1, head.y - 3, 5, 5, SHADE.shadow);
      canvas.rect(head.x + 2, head.y - 4, 5, 3, SHADE.shadow);
    }
    return;
  }

  if (style === "side-part") {
    canvas.rect(head.x - half - 2, head.y - 9, profile ? 15 : head.width + 3, 7, SHADE.outline);
    canvas.rect(head.x - half, head.y - 9, profile ? 12 : head.width - 1, 5, SHADE.base);
    canvas.poly(
      [
        { x: head.x - 4, y: head.y - 13 },
        { x: head.x + half, y: head.y - 8 },
        { x: head.x + 4, y: head.y - 2 },
        { x: head.x - half + 1, y: head.y - 4 },
      ],
      SHADE.light,
    );
    canvas.rect(head.x + half - 3, head.y - 2, 5, 9, SHADE.outline);
    canvas.rect(head.x + half - 3, head.y - 1, 3, 7, SHADE.shadow);
    return;
  }

  canvas.rect(head.x - half - 2, head.y - 8, profile ? 14 : head.width + 4, 8, SHADE.outline);
  canvas.rect(head.x - half, head.y - 8, profile ? 11 : head.width, 6, SHADE.base);
  canvas.roundRect(head.x - half - 3, head.y - 2, 6, 17, 3, SHADE.outline);
  canvas.roundRect(head.x - half - 1, head.y - 1, 3, 14, 2, SHADE.shadow);

  if (!profile) {
    canvas.roundRect(head.x + half - 2, head.y - 2, 6, 16, 3, SHADE.outline);
    canvas.roundRect(head.x + half - 1, head.y - 1, 3, 13, 2, SHADE.shadow);
  }

  canvas.line(head.x - half + 3, head.y - 12, head.x + half - 4, head.y - 10, SHADE.light);
}

class PixelCanvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height * 4);
  }

  frame(index: number): FrameCanvas {
    return new FrameCanvas(this, index * FRAME_WIDTH);
  }
}

class FrameCanvas {
  constructor(
    private readonly canvas: PixelCanvas,
    private readonly offsetX: number,
  ) {}

  pixel(x: number, y: number, color: Color): void {
    const px = Math.round(x) + this.offsetX;
    const py = Math.round(y);

    if (px < this.offsetX || px >= this.offsetX + FRAME_WIDTH || py < 0 || py >= FRAME_HEIGHT) {
      return;
    }

    const index = (py * this.canvas.width + px) * 4;
    const sourceAlpha = color[3] / 255;
    const targetAlpha = this.canvas.pixels[index + 3] / 255;
    const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

    if (outputAlpha <= 0) {
      this.canvas.pixels.set(TRANSPARENT, index);
      return;
    }

    this.canvas.pixels[index] = Math.round(
      (color[0] * sourceAlpha + this.canvas.pixels[index] * targetAlpha * (1 - sourceAlpha)) /
        outputAlpha,
    );
    this.canvas.pixels[index + 1] = Math.round(
      (color[1] * sourceAlpha + this.canvas.pixels[index + 1] * targetAlpha * (1 - sourceAlpha)) /
        outputAlpha,
    );
    this.canvas.pixels[index + 2] = Math.round(
      (color[2] * sourceAlpha + this.canvas.pixels[index + 2] * targetAlpha * (1 - sourceAlpha)) /
        outputAlpha,
    );
    this.canvas.pixels[index + 3] = Math.round(outputAlpha * 255);
  }

  rect(x: number, y: number, width: number, height: number, color: Color): void {
    for (let py = Math.round(y); py < Math.round(y + height); py += 1) {
      for (let px = Math.round(x); px < Math.round(x + width); px += 1) {
        this.pixel(px, py, color);
      }
    }
  }

  roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: Color,
  ): void {
    const left = Math.round(x);
    const top = Math.round(y);
    const right = Math.round(x + width - 1);
    const bottom = Math.round(y + height - 1);

    for (let py = top; py <= bottom; py += 1) {
      for (let px = left; px <= right; px += 1) {
        const dx =
          px < left + radius ? left + radius - px : px > right - radius ? px - (right - radius) : 0;
        const dy =
          py < top + radius ? top + radius - py : py > bottom - radius ? py - (bottom - radius) : 0;

        if (dx * dx + dy * dy <= radius * radius) {
          this.pixel(px, py, color);
        }
      }
    }
  }

  ellipse(cx: number, cy: number, radiusX: number, radiusY: number, color: Color): void {
    for (let y = Math.floor(cy - radiusY); y <= Math.ceil(cy + radiusY); y += 1) {
      for (let x = Math.floor(cx - radiusX); x <= Math.ceil(cx + radiusX); x += 1) {
        const dx = (x - cx) / radiusX;
        const dy = (y - cy) / radiusY;

        if (dx * dx + dy * dy <= 1) {
          this.pixel(x, y, color);
        }
      }
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Color): void {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

    for (let step = 0; step <= steps; step += 1) {
      const amount = steps === 0 ? 0 : step / steps;
      this.pixel(Math.round(x1 + (x2 - x1) * amount), Math.round(y1 + (y2 - y1) * amount), color);
    }
  }

  poly(points: Point[], color: Color): void {
    const minY = Math.floor(Math.min(...points.map((point) => point.y)));
    const maxY = Math.ceil(Math.max(...points.map((point) => point.y)));

    for (let y = minY; y <= maxY; y += 1) {
      const intersections: number[] = [];

      for (const [index, point] of points.entries()) {
        const next = points[(index + 1) % points.length];

        if (!next || point.y === next.y) {
          continue;
        }

        const top = point.y < next.y ? point : next;
        const bottom = point.y < next.y ? next : point;

        if (y < top.y || y >= bottom.y) {
          continue;
        }

        intersections.push(top.x + ((y - top.y) / (bottom.y - top.y)) * (bottom.x - top.x));
      }

      intersections.sort((a, b) => a - b);

      for (let index = 0; index < intersections.length; index += 2) {
        const start = intersections[index];
        const end = intersections[index + 1];

        if (start === undefined || end === undefined) {
          continue;
        }

        for (let x = Math.ceil(start); x <= Math.floor(end); x += 1) {
          this.pixel(x, y, color);
        }
      }
    }
  }
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const rowSize = width * 4 + 1;
  const raw = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * rowSize] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * rowSize + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", createIhdr(width, height)),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createIhdr(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

main();
