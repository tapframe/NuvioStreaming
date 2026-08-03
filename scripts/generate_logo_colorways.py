from pathlib import Path
import colorsys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "asset/Deliverables 2/Logo Only/Logo_1080x1080.png"
OUTPUT = ROOT / "asset/Logo Colorways - Black"
FONT_REGULAR = Path("/System/Library/Fonts/SFNS.ttf")
BLACK = "#000000"


FAMILIES = [
    {
        "slug": "core-cool",
        "name": "Core Cool",
        "label": "CORE\nCOOL",
        "description": "Brand-first\ntechnology palette",
    },
    {
        "slug": "aqua-green",
        "name": "Aqua + Green",
        "label": "AQUA +\nGREEN",
        "description": "Fresh product and\ngrowth palette",
    },
    {
        "slug": "warm-spectrum",
        "name": "Warm Spectrum",
        "label": "WARM\nSPECTRUM",
        "description": "Entertainment and\ncampaign palette",
    },
    {
        "slug": "luxe-neutral",
        "name": "Luxe + Neutral",
        "label": "LUXE +\nNEUTRAL",
        "description": "Premium and\nsystem palette",
    },
]


VARIANTS = [
    {
        "family": "core-cool",
        "slug": "original-on-black",
        "name": "Original on Black",
        "swatches": ["#45D6EB", "#3965D4", "#B250EF"],
        "hues": [190, 225, 286],
        "usage": "Current identity",
        "preserve": True,
    },
    {
        "family": "core-cool",
        "slug": "glacier",
        "name": "Glacier",
        "swatches": ["#7BE7FF", "#35B9FF", "#506BFF"],
        "hues": [191, 202, 231],
        "usage": "Bright and approachable",
    },
    {
        "family": "core-cool",
        "slug": "arctic-blue",
        "name": "Arctic Blue",
        "swatches": ["#4DE3FF", "#3185F5", "#4D55E8"],
        "hues": [188, 214, 237],
        "usage": "Best master-brand option",
        "recommended": True,
    },
    {
        "family": "core-cool",
        "slug": "cobalt-pulse",
        "name": "Cobalt Pulse",
        "swatches": ["#59A8FF", "#315BFF", "#613DFF"],
        "hues": [211, 228, 254],
        "usage": "High-energy technology",
    },
    {
        "family": "core-cool",
        "slug": "sapphire",
        "name": "Sapphire",
        "swatches": ["#38C5FF", "#2265E5", "#3B2FD1"],
        "hues": [196, 219, 245],
        "usage": "Confident and premium",
    },
    {
        "family": "core-cool",
        "slug": "electric-violet",
        "name": "Electric Violet",
        "swatches": ["#4985FF", "#704DFF", "#EA4DFF"],
        "hues": [218, 253, 293],
        "usage": "Creator-led media",
    },
    {
        "family": "aqua-green",
        "slug": "polar-mint",
        "name": "Polar Mint",
        "swatches": ["#80FFE3", "#31E6C5", "#21B8E5"],
        "hues": [167, 169, 194],
        "usage": "Light and contemporary",
    },
    {
        "family": "aqua-green",
        "slug": "tidal",
        "name": "Tidal",
        "swatches": ["#42E8B4", "#14C8C8", "#2384E8"],
        "hues": [160, 180, 210],
        "usage": "Best fresh-brand option",
        "recommended": True,
    },
    {
        "family": "aqua-green",
        "slug": "turquoise",
        "name": "Turquoise",
        "swatches": ["#38F2D0", "#12D6B3", "#19A7D8"],
        "hues": [169, 168, 195],
        "usage": "Clean and global",
    },
    {
        "family": "aqua-green",
        "slug": "emerald",
        "name": "Emerald",
        "swatches": ["#7BF08D", "#22D37C", "#0BBF9A"],
        "hues": [127, 148, 168],
        "usage": "Mature and assured",
    },
    {
        "family": "aqua-green",
        "slug": "jade",
        "name": "Jade",
        "swatches": ["#B9F44A", "#2DDB83", "#12B8A6"],
        "hues": [79, 150, 174],
        "usage": "Energetic product growth",
    },
    {
        "family": "aqua-green",
        "slug": "lime-pulse",
        "name": "Lime Pulse",
        "swatches": ["#D5FF4F", "#78ED3B", "#16C995"],
        "hues": [72, 104, 157],
        "usage": "Youth and activation",
    },
    {
        "family": "warm-spectrum",
        "slug": "sunset",
        "name": "Sunset",
        "swatches": ["#8D55FF", "#F044A7", "#FF7048"],
        "hues": [260, 324, 374],
        "usage": "Best campaign option",
        "recommended": True,
    },
    {
        "family": "warm-spectrum",
        "slug": "magenta-rush",
        "name": "Magenta Rush",
        "swatches": ["#6B5CFF", "#E640D5", "#FF4E87"],
        "hues": [248, 306, 339],
        "usage": "Creator campaigns",
    },
    {
        "family": "warm-spectrum",
        "slug": "cherry-pop",
        "name": "Cherry Pop",
        "swatches": ["#FF4AB8", "#FF3D6E", "#FF633D"],
        "hues": [326, 344, 373],
        "usage": "Bold social presence",
    },
    {
        "family": "warm-spectrum",
        "slug": "crimson",
        "name": "Crimson",
        "swatches": ["#FF5B91", "#F52E62", "#E42E3D"],
        "hues": [340, 346, 355],
        "usage": "Dramatic editorial use",
    },
    {
        "family": "warm-spectrum",
        "slug": "ember-gold",
        "name": "Ember Gold",
        "swatches": ["#FF476F", "#FF7738", "#FFD34E"],
        "hues": [347, 379, 407],
        "usage": "Events and launches",
    },
    {
        "family": "warm-spectrum",
        "slug": "solar",
        "name": "Solar",
        "swatches": ["#FF6B3D", "#FFAA2D", "#FFE35C"],
        "hues": [14, 36, 50],
        "usage": "Optimistic promotion",
    },
    {
        "family": "luxe-neutral",
        "slug": "rose-gold",
        "name": "Rose Gold",
        "swatches": ["#B75AFF", "#EC70A9", "#FFB37A"],
        "hues": [279, 334, 385],
        "usage": "Lifestyle premium",
    },
    {
        "family": "luxe-neutral",
        "slug": "amethyst",
        "name": "Amethyst",
        "swatches": ["#6E5BFF", "#A85CFF", "#E475FF"],
        "hues": [247, 273, 291],
        "usage": "Best premium option",
        "recommended": True,
    },
    {
        "family": "luxe-neutral",
        "slug": "burgundy",
        "name": "Burgundy",
        "swatches": ["#B63D82", "#D94D70", "#ED765C"],
        "hues": [326, 345, 369],
        "usage": "Cinematic and editorial",
    },
    {
        "family": "luxe-neutral",
        "slug": "copper",
        "name": "Copper",
        "swatches": ["#C95945", "#DE7B45", "#ECAE62"],
        "hues": [9, 24, 38],
        "usage": "Warm heritage premium",
    },
    {
        "family": "luxe-neutral",
        "slug": "champagne",
        "name": "Champagne",
        "swatches": ["#D6A95F", "#E8C979", "#F7E6B0"],
        "hues": [38, 44, 46],
        "usage": "Luxury partnerships",
    },
    {
        "family": "luxe-neutral",
        "slug": "graphite",
        "name": "Graphite",
        "swatches": ["#F3F5F7", "#AAB2BE", "#687381"],
        "hues": [210, 215, 220],
        "usage": "Monochrome system mark",
        "monochrome": True,
    },
]


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def mix_hex(first, second, amount):
    a = np.array(hex_rgb(first), dtype=np.float32)
    b = np.array(hex_rgb(second), dtype=np.float32)
    return tuple(np.rint(a * (1 - amount) + b * amount).astype(np.uint8))


def swatch_hsv(swatches):
    converted = []
    for value in swatches:
        red, green, blue = (channel / 255 for channel in hex_rgb(value))
        converted.append(colorsys.rgb_to_hsv(red, green, blue))
    return np.array(converted, dtype=np.float32)


def recolor(source, variant):
    pixels = np.array(source.convert("RGBA"), dtype=np.uint8)
    rgb = pixels[..., :3]
    alpha = pixels[..., 3]
    hsv = cv2.cvtColor(rgb.astype(np.float32) / 255, cv2.COLOR_RGB2HSV)
    hue = hsv[..., 0]
    saturation = hsv[..., 1]
    value = hsv[..., 2]
    mapped_rgb = rgb.copy()
    if not variant.get("preserve"):
        color_mask = (alpha > 0) & (saturation > 0.12) & (value > 0.22)
        position = np.clip((hue - 184) / 110, 0, 1)
        stops = np.array([0, 0.5, 1], dtype=np.float32)
        target_hue = np.interp(position, stops, variant["hues"]) % 360
        targets = swatch_hsv(variant["swatches"])
        target_saturation = np.interp(position, stops, targets[:, 1])
        target_value = np.interp(position, stops, targets[:, 2])
        saturation_factor = np.clip((saturation / 0.69) ** 0.35, 0.72, 1.16)
        value_factor = np.clip((value / 0.88) ** 0.65, 0.74, 1.1)
        mapped_saturation = np.clip(target_saturation * saturation_factor, 0, 1)
        if variant.get("monochrome"):
            mapped_saturation = np.zeros_like(mapped_saturation)
        mapped_value = np.clip(target_value * value_factor, 0, 1)
        adjusted = hsv.copy()
        adjusted[..., 0][color_mask] = target_hue[color_mask]
        adjusted[..., 1][color_mask] = mapped_saturation[color_mask]
        adjusted[..., 2][color_mask] = mapped_value[color_mask]
        mapped_rgb = np.rint(cv2.cvtColor(adjusted, cv2.COLOR_HSV2RGB) * 255).astype(np.uint8)
    dark_mask = (alpha > 0) & (value <= 0.22)
    dark_level = np.clip(value / 0.118, 0.58, 1.35)
    inner = np.array(hex_rgb(BLACK), dtype=np.float32)
    mapped_rgb[dark_mask] = np.clip(inner * dark_level[dark_mask, None], 0, 255).astype(np.uint8)
    pixels[..., :3] = mapped_rgb
    return Image.fromarray(pixels, mode="RGBA")


def composite_black(logo):
    background = Image.new("RGBA", logo.size, (0, 0, 0, 255))
    background.alpha_composite(logo)
    return background.convert("RGB")


def fit_logo(logo, width, height):
    bounds = logo.getchannel("A").getbbox()
    cropped = logo.crop(bounds)
    scale = min(width / cropped.width, height / cropped.height)
    size = (round(cropped.width * scale), round(cropped.height * scale))
    return cropped.resize(size, Image.Resampling.LANCZOS)


def font(size):
    return ImageFont.truetype(str(FONT_REGULAR), size)


def family_variants(slug):
    return [variant for variant in VARIANTS if variant["family"] == slug]


def draw_swatch_row(draw, swatches, left, top, diameter, gap):
    x = left
    for swatch in swatches:
        draw.ellipse(
            (x, top, x + diameter, top + diameter),
            fill=swatch,
            outline=mix_hex(swatch, "#FFFFFF", 0.38),
            width=2,
        )
        x += diameter + gap


def draw_master(rendered):
    canvas_width = 3080
    margin = 60
    rail_width = 250
    header_height = 220
    card_width = 430
    card_height = 420
    column_gap = 20
    row_gap = 30
    canvas_height = header_height + card_height * 4 + row_gap * 3 + margin
    canvas = Image.new("RGB", (canvas_width, canvas_height), BLACK)
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 42), "NUVIO / COLOR SYSTEM", font=font(58), fill="#F7F7F7")
    draw.text(
        (margin, 120),
        "24 curated logo colorways · pure black preview field · original geometry preserved",
        font=font(26),
        fill="#909090",
    )
    rendered_by_slug = {variant["slug"]: logo for variant, logo in zip(VARIANTS, rendered)}
    for family_index, family in enumerate(FAMILIES):
        top = header_height + family_index * (card_height + row_gap)
        draw.multiline_text(
            (margin, top + 92),
            family["label"],
            font=font(34),
            fill="#F7F7F7",
            spacing=4,
        )
        draw.multiline_text(
            (margin, top + 188),
            family["description"],
            font=font(19),
            fill="#777777",
            spacing=4,
        )
        for column, variant in enumerate(family_variants(family["slug"])):
            left = margin + rail_width + column * (card_width + column_gap)
            right = left + card_width
            bottom = top + card_height
            border = "#323232" if variant.get("recommended") else "#222222"
            draw.rounded_rectangle((left, top, right, bottom), radius=24, fill=BLACK, outline=border, width=2)
            logo = fit_logo(rendered_by_slug[variant["slug"]], 285, 285)
            logo_x = left + (card_width - logo.width) // 2
            canvas.paste(logo, (logo_x, top + 18), logo)
            draw.text((left + 24, top + 314), variant["name"], font=font(25), fill="#F4F4F4")
            draw.text((left + 24, top + 350), variant["usage"], font=font(16), fill="#777777")
            draw_swatch_row(draw, variant["swatches"], left + 24, top + 382, 22, 8)
            if variant.get("recommended"):
                badge_width = 116
                badge_left = right - badge_width - 18
                draw.rounded_rectangle(
                    (badge_left, top + 374, right - 18, top + 402),
                    radius=14,
                    fill="#F4F4F4",
                )
                draw.text((badge_left + 12, top + 379), "DESIGNER PICK", font=font(12), fill=BLACK)
    canvas.save(OUTPUT / "Nuvio-Color-System-Master.png", optimize=True)


def draw_family_board(family, rendered_by_slug):
    canvas_width = 2280
    margin = 60
    gap = 30
    header_height = 220
    card_width = 700
    card_height = 560
    canvas_height = header_height + card_height * 2 + gap + margin
    canvas = Image.new("RGB", (canvas_width, canvas_height), BLACK)
    draw = ImageDraw.Draw(canvas)
    draw.text((margin, 44), f"NUVIO / {family['name'].upper()}", font=font(58), fill="#F7F7F7")
    draw.text(
        (margin, 124),
        "Six curated logo shades shown on pure black #000000",
        font=font(26),
        fill="#909090",
    )
    for index, variant in enumerate(family_variants(family["slug"])):
        row, column = divmod(index, 3)
        left = margin + column * (card_width + gap)
        top = header_height + row * (card_height + gap)
        right = left + card_width
        bottom = top + card_height
        border = "#3A3A3A" if variant.get("recommended") else "#242424"
        draw.rounded_rectangle((left, top, right, bottom), radius=32, fill=BLACK, outline=border, width=2)
        logo = fit_logo(rendered_by_slug[variant["slug"]], 390, 390)
        logo_x = left + (card_width - logo.width) // 2
        canvas.paste(logo, (logo_x, top + 20), logo)
        draw.text((left + 34, top + 420), variant["name"], font=font(32), fill="#F7F7F7")
        draw.text((left + 34, top + 464), variant["usage"], font=font(19), fill="#838383")
        draw_swatch_row(draw, variant["swatches"], right - 34 - 138, top + 458, 38, 12)
        if variant.get("recommended"):
            draw.rounded_rectangle((left + 34, top + 504, left + 174, top + 536), radius=16, fill="#F2F2F2")
            draw.text((left + 48, top + 510), "DESIGNER PICK", font=font(14), fill=BLACK)
    canvas.save(OUTPUT / "previews" / f"{family['slug']}.png", optimize=True)


def write_guide():
    lines = [
        "# Nuvio logo color system",
        "",
        "This set contains 24 professionally curated colorways across four usage families. Every preview uses pure black `#000000`. Logo geometry, transparency, highlights, overlap shading, and the white play glyph are preserved.",
        "",
        "## Designer recommendation",
        "",
        "- Use **Arctic Blue** as the strongest evolution of the master brand.",
        "- Use **Tidal** when the product needs a fresher, more distinctive identity.",
        "- Use **Amethyst** for premium positioning and **Graphite** for monochrome system contexts.",
        "- Reserve **Sunset**, **Ember Gold**, and the brighter warm variants for campaigns, launches, and seasonal moments.",
        "",
        "| Family | Colorway | Gradient anchors | Recommended use |",
        "| --- | --- | --- | --- |",
    ]
    family_names = {family["slug"]: family["name"] for family in FAMILIES}
    for variant in VARIANTS:
        anchors = " → ".join(variant["swatches"])
        lines.append(f"| {family_names[variant['family']]} | {variant['name']} | {anchors} | {variant['usage']} |")
    lines.extend(
        [
            "",
            "Each colorway is supplied as a transparent 1080×1080 PNG and a matching 1080×1080 PNG on pure black.",
            "",
            "The source is `asset/Deliverables 2/Logo Only/Logo_1080x1080.png`.",
        ]
    )
    (OUTPUT / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    transparent_dir = OUTPUT / "transparent"
    black_dir = OUTPUT / "black-background"
    preview_dir = OUTPUT / "previews"
    transparent_dir.mkdir(parents=True, exist_ok=True)
    black_dir.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE).convert("RGBA")
    rendered = []
    for index, variant in enumerate(VARIANTS, start=1):
        logo = recolor(source, variant)
        filename = f"{index:02d}-{variant['slug']}.png"
        logo.save(transparent_dir / filename, optimize=True)
        composite_black(logo).save(black_dir / filename, optimize=True)
        rendered.append(logo)
    rendered_by_slug = {variant["slug"]: logo for variant, logo in zip(VARIANTS, rendered)}
    draw_master(rendered)
    for family in FAMILIES:
        draw_family_board(family, rendered_by_slug)
    write_guide()


if __name__ == "__main__":
    main()
