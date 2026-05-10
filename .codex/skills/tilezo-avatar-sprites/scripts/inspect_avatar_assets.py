#!/usr/bin/env python3
"""Validate the basic structure and PNG dimensions for a Tilezo avatar manifest."""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path
from typing import Any


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: inspect_avatar_assets.py <assets/avatars/avatar-manifest.json>", file=sys.stderr)
        return 2

    manifest_path = Path(sys.argv[1]).resolve()
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"error: cannot read manifest: {error}", file=sys.stderr)
        return 1

    errors = validate_manifest(manifest_path, manifest)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    layer_count = len(manifest["layers"])
    print(f"ok: validated {layer_count} avatar layer asset(s)")
    return 0


def validate_manifest(manifest_path: Path, manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    avatar_root = manifest_path.parent
    frame = manifest.get("frame")
    layers = manifest.get("layers")

    if not isinstance(frame, dict):
        return ["manifest.frame must be an object"]
    if not isinstance(layers, list) or not layers:
        return ["manifest.layers must be a non-empty array"]

    frame_width = positive_int(frame.get("width"))
    frame_height = positive_int(frame.get("height"))
    if frame_width is None:
        errors.append("frame.width must be a positive integer")
    if frame_height is None:
        errors.append("frame.height must be a positive integer")
    if frame_width is None or frame_height is None:
        return errors

    for index, layer in enumerate(layers):
        if not isinstance(layer, dict):
            errors.append(f"layers[{index}] must be an object")
            continue

        layer_id = layer.get("id", f"#{index}")
        src = layer.get("src")
        frames = positive_int(layer.get("frames"))

        if not isinstance(src, str) or not src:
            errors.append(f"layer {layer_id} must declare src")
            continue
        if frames is None:
            errors.append(f"layer {layer_id} must declare positive integer frames")
            continue

        image_path = avatar_root / src
        if not image_path.exists():
            errors.append(f"layer {layer_id} missing file {image_path}")
            continue
        if image_path.suffix.lower() != ".png":
            errors.append(f"layer {layer_id} must be a PNG for dimension validation")
            continue

        dimensions = read_png_dimensions(image_path)
        if dimensions is None:
            errors.append(f"layer {layer_id} is not a readable PNG")
            continue

        expected = (frame_width * frames, frame_height)
        if dimensions != expected:
            errors.append(
                f"layer {layer_id} has dimensions {dimensions[0]}x{dimensions[1]}, "
                f"expected {expected[0]}x{expected[1]}",
            )

    return errors


def positive_int(value: Any) -> int | None:
    return value if isinstance(value, int) and value > 0 else None


def read_png_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        with path.open("rb") as file:
            signature = file.read(8)
            if signature != PNG_SIGNATURE:
                return None
            length_bytes = file.read(4)
            chunk_type = file.read(4)
            if len(length_bytes) != 4 or chunk_type != b"IHDR":
                return None
            length = struct.unpack(">I", length_bytes)[0]
            if length < 8:
                return None
            width, height = struct.unpack(">II", file.read(8))
            return width, height
    except OSError:
        return None


if __name__ == "__main__":
    raise SystemExit(main())
