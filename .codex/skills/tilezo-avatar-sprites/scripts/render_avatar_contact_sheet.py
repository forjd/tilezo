#!/usr/bin/env python3
"""Render a Tilezo avatar contact sheet from layered PNG assets.

This intentionally avoids third-party image libraries so it works in the repo's
default toolchain. It supports the RGBA PNG strips produced by Tilezo's avatar
asset pipeline.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
DEFAULT_APPEARANCE = {
    "skinTone": "#f2c097",
    "hairColor": "#7a4424",
    "shirtColor": "#2f5f7f",
    "pantsColor": "#d2c294",
    "shoesColor": "#5b4218",
}
DEFAULT_LAYER_IDS = {
    "body": "base",
    "shoes": "boots",
    "bottoms": "straight",
    "top": "crew",
    "face": "default",
    "hair": "short",
}
DRAW_ORDER = ["body", "shoes", "bottoms", "top", "face", "hair", "accessory"]


@dataclass(frozen=True)
class SheetFrame:
    label: str
    index: int


@dataclass
class RgbaImage:
    width: int
    height: int
    pixels: bytearray

    @classmethod
    def blank(cls, width: int, height: int, color: tuple[int, int, int, int]) -> RgbaImage:
        pixels = bytearray(width * height * 4)
        for y in range(height):
            for x in range(width):
                offset = (y * width + x) * 4
                pixels[offset : offset + 4] = bytes(color)
        return cls(width, height, pixels)

    def pixel(self, x: int, y: int) -> tuple[int, int, int, int]:
        offset = (y * self.width + x) * 4
        return tuple(self.pixels[offset : offset + 4])  # type: ignore[return-value]

    def set_pixel(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            return
        offset = (y * self.width + x) * 4
        self.pixels[offset : offset + 4] = bytes(color)

    def rect(self, x: int, y: int, width: int, height: int, color: tuple[int, int, int, int]) -> None:
        for py in range(y, y + height):
            for px in range(x, x + width):
                self.set_pixel(px, py, color)

    def alpha_over(self, x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            return

        sr, sg, sb, sa = color
        if sa == 0:
            return

        dr, dg, db, da = self.pixel(x, y)
        source_alpha = sa / 255
        target_alpha = da / 255
        output_alpha = source_alpha + target_alpha * (1 - source_alpha)

        if output_alpha <= 0:
            self.set_pixel(x, y, (0, 0, 0, 0))
            return

        out = (
            round((sr * source_alpha + dr * target_alpha * (1 - source_alpha)) / output_alpha),
            round((sg * source_alpha + dg * target_alpha * (1 - source_alpha)) / output_alpha),
            round((sb * source_alpha + db * target_alpha * (1 - source_alpha)) / output_alpha),
            round(output_alpha * 255),
        )
        self.set_pixel(x, y, out)

    def paste_scaled(self, image: RgbaImage, x: int, y: int, scale: int) -> None:
        for source_y in range(image.height):
            for source_x in range(image.width):
                color = image.pixel(source_x, source_y)
                for dy in range(scale):
                    for dx in range(scale):
                        self.alpha_over(x + source_x * scale + dx, y + source_y * scale + dy, color)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--scale", type=int, default=3)
    args = parser.parse_args()

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        sheet_frames = default_sheet_frames(manifest)
        contact_sheet = render_contact_sheet(args.manifest.parent, manifest, sheet_frames, args.scale)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        write_png(args.output, contact_sheet)
    except (OSError, ValueError, KeyError, TypeError, zlib.error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    frame_list = ", ".join(frame.label for frame in sheet_frames)
    print(f"ok: wrote {args.output} ({frame_list})")
    return 0


def default_sheet_frames(manifest: dict[str, Any]) -> list[SheetFrame]:
    directions = manifest["directions"]
    idle = manifest["animations"]["idle"]
    walk = manifest["animations"]["walk"]
    frames: list[SheetFrame] = []

    for direction_index, direction in enumerate(directions):
        frames.append(
            SheetFrame(
                label=f"idle {direction}",
                index=idle["start"] + direction_index * idle["framesPerDirection"],
            ),
        )

    walk_direction = "south-east" if "south-east" in directions else directions[0]
    walk_direction_index = directions.index(walk_direction)
    for step in range(walk["framesPerDirection"]):
        frames.append(
            SheetFrame(
                label=f"walk {walk_direction} {step + 1}",
                index=walk["start"] + walk_direction_index * walk["framesPerDirection"] + step,
            ),
        )

    return frames


def render_contact_sheet(
    avatar_root: Path,
    manifest: dict[str, Any],
    frames: list[SheetFrame],
    scale: int,
) -> RgbaImage:
    frame_width = manifest["frame"]["width"]
    frame_height = manifest["frame"]["height"]
    columns = min(5, len(frames))
    rows = (len(frames) + columns - 1) // columns
    gutter = 8
    cell_width = frame_width * scale
    cell_height = frame_height * scale
    sheet_width = columns * cell_width + (columns + 1) * gutter
    sheet_height = rows * cell_height + (rows + 1) * gutter
    sheet = RgbaImage.blank(sheet_width, sheet_height, (235, 232, 220, 255))
    selected_layers = select_layers(manifest)
    loaded_layers = [
        (layer, read_png(avatar_root / layer["src"]))
        for layer in selected_layers
    ]

    for cell_index, frame in enumerate(frames):
        x = gutter + (cell_index % columns) * (cell_width + gutter)
        y = gutter + (cell_index // columns) * (cell_height + gutter)
        sheet.rect(x - 1, y - 1, cell_width + 2, cell_height + 2, (96, 92, 84, 255))
        sheet.rect(x, y, cell_width, cell_height, (251, 250, 240, 255))
        draw_grid(sheet, x, y, cell_width, cell_height, scale)
        composite = compose_frame(loaded_layers, frame.index, frame_width, frame_height)
        sheet.paste_scaled(composite, x, y, scale)

    return sheet


def select_layers(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    layers_by_slot: dict[str, list[dict[str, Any]]] = {}
    for layer in manifest["layers"]:
        layers_by_slot.setdefault(layer["slot"], []).append(layer)

    selected: list[dict[str, Any]] = []
    for slot in DRAW_ORDER:
        slot_layers = layers_by_slot.get(slot, [])
        if not slot_layers:
            continue

        preferred_id = DEFAULT_LAYER_IDS.get(slot)
        selected.append(
            next((layer for layer in slot_layers if layer["id"] == preferred_id), slot_layers[0]),
        )

    return selected


def compose_frame(
    loaded_layers: list[tuple[dict[str, Any], RgbaImage]],
    frame_index: int,
    frame_width: int,
    frame_height: int,
) -> RgbaImage:
    output = RgbaImage.blank(frame_width, frame_height, (0, 0, 0, 0))

    for layer, image in loaded_layers:
        layer_frame = min(frame_index, layer["frames"] - 1)
        frame_x = layer_frame * frame_width
        tint = DEFAULT_APPEARANCE.get(layer.get("tint"))

        for y in range(frame_height):
            for x in range(frame_width):
                color = image.pixel(frame_x + x, y)
                if tint:
                    color = tint_color(color, tint)
                output.alpha_over(x, y, color)

    return output


def tint_color(color: tuple[int, int, int, int], hex_color: str) -> tuple[int, int, int, int]:
    r, g, b, a = color
    if a == 0:
        return color

    tint = parse_hex_color(hex_color)
    shade = max(r, g, b) / 255
    return (
        round(tint[0] * shade),
        round(tint[1] * shade),
        round(tint[2] * shade),
        a,
    )


def draw_grid(sheet: RgbaImage, x: int, y: int, width: int, height: int, scale: int) -> None:
    minor = 4 * scale
    major = 8 * scale

    for px in range(x, x + width, minor):
        color = (186, 181, 169, 130) if (px - x) % major == 0 else (204, 199, 187, 100)
        sheet.rect(px, y, 1, height, color)

    for py in range(y, y + height, minor):
        color = (186, 181, 169, 130) if (py - y) % major == 0 else (204, 199, 187, 100)
        sheet.rect(x, py, width, 1, color)


def parse_hex_color(value: str) -> tuple[int, int, int]:
    normalized = value.removeprefix("#")
    if len(normalized) != 6:
        raise ValueError(f"invalid hex color {value}")
    return (
        int(normalized[0:2], 16),
        int(normalized[2:4], 16),
        int(normalized[4:6], 16),
    )


def read_png(path: Path) -> RgbaImage:
    data = path.read_bytes()
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError(f"{path} is not a PNG")

    offset = len(PNG_SIGNATURE)
    width = height = color_type = bit_depth = interlace = None
    idat = bytearray()

    while offset < len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if width is None or height is None or bit_depth != 8 or interlace != 0:
        raise ValueError(f"{path} uses unsupported PNG settings")
    if color_type not in (2, 6):
        raise ValueError(f"{path} must be RGB or RGBA PNG")

    channels = 4 if color_type == 6 else 3
    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    rows: list[bytearray] = []
    cursor = 0

    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        row = bytearray(raw[cursor : cursor + stride])
        cursor += stride
        previous = rows[-1] if rows else bytearray(stride)
        rows.append(unfilter_row(filter_type, row, previous, channels))

    pixels = bytearray(width * height * 4)
    for y, row in enumerate(rows):
        for x in range(width):
            source = (x * channels)
            target = (y * width + x) * 4
            pixels[target] = row[source]
            pixels[target + 1] = row[source + 1]
            pixels[target + 2] = row[source + 2]
            pixels[target + 3] = row[source + 3] if channels == 4 else 255

    return RgbaImage(width, height, pixels)


def unfilter_row(filter_type: int, row: bytearray, previous: bytearray, bpp: int) -> bytearray:
    output = bytearray(row)

    for index, value in enumerate(row):
        left = output[index - bpp] if index >= bpp else 0
        up = previous[index]
        up_left = previous[index - bpp] if index >= bpp else 0

        if filter_type == 0:
            output[index] = value
        elif filter_type == 1:
            output[index] = (value + left) & 0xFF
        elif filter_type == 2:
            output[index] = (value + up) & 0xFF
        elif filter_type == 3:
            output[index] = (value + ((left + up) // 2)) & 0xFF
        elif filter_type == 4:
            output[index] = (value + paeth(left, up, up_left)) & 0xFF
        else:
            raise ValueError(f"unsupported PNG filter {filter_type}")

    return output


def paeth(left: int, up: int, up_left: int) -> int:
    estimate = left + up - up_left
    distance_left = abs(estimate - left)
    distance_up = abs(estimate - up)
    distance_up_left = abs(estimate - up_left)

    if distance_left <= distance_up and distance_left <= distance_up_left:
        return left
    if distance_up <= distance_up_left:
        return up
    return up_left


def write_png(path: Path, image: RgbaImage) -> None:
    raw = bytearray()
    for y in range(image.height):
        raw.append(0)
        start = y * image.width * 4
        raw.extend(image.pixels[start : start + image.width * 4])

    path.write_bytes(
        b"".join(
            [
                PNG_SIGNATURE,
                png_chunk(b"IHDR", struct.pack(">IIBBBBB", image.width, image.height, 8, 6, 0, 0, 0)),
                png_chunk(b"IDAT", zlib.compress(bytes(raw))),
                png_chunk(b"IEND", b""),
            ],
        ),
    )


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", checksum)


if __name__ == "__main__":
    raise SystemExit(main())
